import { Injectable, NotFoundException, ForbiddenException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In } from 'typeorm';
import { Tag } from './entities/tag.entity';
import { File } from '@modules/files/entities/file.entity';
import { CreateTagDto } from './dto/create-tag.dto';
import { UpdateTagDto } from './dto/update-tag.dto';

@Injectable()
export class TagsService {
  constructor(
    @InjectRepository(Tag)
    private tagRepository: Repository<Tag>,
    @InjectRepository(File)
    private fileRepository: Repository<File>,
  ) {}

  // Create a new tag
  async create(dto: CreateTagDto, userId: string): Promise<Tag> {
    // Check if tag with same name already exists for user
    const existing = await this.tagRepository.findOne({
      where: { name: dto.name, ownerId: userId },
    });
    if (existing) {
      throw new BadRequestException(`Tag "${dto.name}" already exists`);
    }

    const tag = this.tagRepository.create({
      name: dto.name,
      color: dto.color || '#1a73e8',
      ownerId: userId,
    });
    return this.tagRepository.save(tag);
  }

  // List all tags for user
  async findAll(userId: string): Promise<Tag[]> {
    return this.tagRepository.find({
      where: { ownerId: userId },
      order: { name: 'ASC' },
    });
  }

  // Get tag by ID
  async findById(tagId: string, userId: string): Promise<Tag> {
    const tag = await this.tagRepository.findOne({
      where: { id: tagId, ownerId: userId },
      relations: ['files'],
    });
    if (!tag) {
      throw new NotFoundException('Tag not found');
    }
    return tag;
  }

  // Update tag
  async update(tagId: string, dto: UpdateTagDto, userId: string): Promise<Tag> {
    const tag = await this.findById(tagId, userId);
    
    // Check if new name conflicts
    if (dto.name && dto.name !== tag.name) {
      const existing = await this.tagRepository.findOne({
        where: { name: dto.name, ownerId: userId },
      });
      if (existing) {
        throw new BadRequestException(`Tag "${dto.name}" already exists`);
      }
    }

    Object.assign(tag, dto);
    return this.tagRepository.save(tag);
  }

  // Delete tag
  async remove(tagId: string, userId: string): Promise<void> {
    const tag = await this.findById(tagId, userId);
    await this.tagRepository.remove(tag);
  }

  // Add tags to a file
  async addTagsToFile(fileId: string, tagIds: string[], userId: string): Promise<File> {
    const file = await this.fileRepository.findOne({
      where: { id: fileId },
      relations: ['tags'],
    });
    if (!file) {
      throw new NotFoundException('File not found');
    }
    if (file.ownerId !== userId) {
      throw new ForbiddenException('You do not have access to this file');
    }

    const tags = await this.tagRepository.find({
      where: { id: In(tagIds), ownerId: userId },
    });

    // Merge existing tags with new ones
    const existingTagIds = new Set(file.tags?.map(t => t.id) || []);
    const newTags = tags.filter(t => !existingTagIds.has(t.id));
    file.tags = [...(file.tags || []), ...newTags];

    return this.fileRepository.save(file);
  }

  // Remove tags from a file
  async removeTagsFromFile(fileId: string, tagIds: string[], userId: string): Promise<File> {
    const file = await this.fileRepository.findOne({
      where: { id: fileId },
      relations: ['tags'],
    });
    if (!file) {
      throw new NotFoundException('File not found');
    }
    if (file.ownerId !== userId) {
      throw new ForbiddenException('You do not have access to this file');
    }

    const tagIdSet = new Set(tagIds);
    file.tags = (file.tags || []).filter(t => !tagIdSet.has(t.id));

    return this.fileRepository.save(file);
  }

  // Set tags for a file (replace all)
  async setFileTags(fileId: string, tagIds: string[], userId: string): Promise<File> {
    const file = await this.fileRepository.findOne({
      where: { id: fileId },
      relations: ['tags'],
    });
    if (!file) {
      throw new NotFoundException('File not found');
    }
    if (file.ownerId !== userId) {
      throw new ForbiddenException('You do not have access to this file');
    }

    const tags = await this.tagRepository.find({
      where: { id: In(tagIds), ownerId: userId },
    });

    file.tags = tags;
    return this.fileRepository.save(file);
  }

  // Get files by tag
  async getFilesByTag(tagId: string, userId: string): Promise<File[]> {
    const tag = await this.tagRepository.findOne({
      where: { id: tagId, ownerId: userId },
      relations: ['files'],
    });
    if (!tag) {
      throw new NotFoundException('Tag not found');
    }
    return tag.files.filter(f => !f.isTrashed);
  }

  // Get tags for a file
  async getFileTags(fileId: string, userId: string): Promise<Tag[]> {
    const file = await this.fileRepository.findOne({
      where: { id: fileId },
      relations: ['tags'],
    });
    if (!file) {
      throw new NotFoundException('File not found');
    }
    if (file.ownerId !== userId) {
      throw new ForbiddenException('You do not have access to this file');
    }
    return file.tags || [];
  }
}
