import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Comment } from './entities/comment.entity';
import { File } from '@modules/files/entities/file.entity';
import { CreateCommentDto } from './dto/create-comment.dto';
import { UpdateCommentDto } from './dto/update-comment.dto';

@Injectable()
export class CommentsService {
  constructor(
    @InjectRepository(Comment)
    private commentRepository: Repository<Comment>,
    @InjectRepository(File)
    private fileRepository: Repository<File>,
  ) {}

  // Create a new comment on a file
  async create(fileId: string, dto: CreateCommentDto, userId: string): Promise<Comment> {
    // Verify file exists and user has access
    const file = await this.fileRepository.findOne({ where: { id: fileId } });
    if (!file) {
      throw new NotFoundException('File not found');
    }
    
    // TODO: Add permission check for shared files
    if (file.ownerId !== userId) {
      throw new ForbiddenException('You do not have access to this file');
    }

    const comment = this.commentRepository.create({
      content: dto.content,
      fileId,
      userId,
    });
    
    const saved = await this.commentRepository.save(comment);
    
    // Return with user relation for display
    return this.commentRepository.findOne({
      where: { id: saved.id },
      relations: ['user'],
    }) as Promise<Comment>;
  }

  // List all comments for a file
  async findByFile(fileId: string, userId: string): Promise<Comment[]> {
    // Verify file exists and user has access
    const file = await this.fileRepository.findOne({ where: { id: fileId } });
    if (!file) {
      throw new NotFoundException('File not found');
    }
    
    // TODO: Add permission check for shared files
    if (file.ownerId !== userId) {
      throw new ForbiddenException('You do not have access to this file');
    }

    return this.commentRepository.find({
      where: { fileId },
      relations: ['user'],
      order: { createdAt: 'DESC' },
    });
  }

  // Update a comment (only owner can update)
  async update(commentId: string, dto: UpdateCommentDto, userId: string): Promise<Comment> {
    const comment = await this.commentRepository.findOne({
      where: { id: commentId },
      relations: ['user'],
    });
    
    if (!comment) {
      throw new NotFoundException('Comment not found');
    }
    
    if (comment.userId !== userId) {
      throw new ForbiddenException('You can only edit your own comments');
    }

    if (dto.content) {
      comment.content = dto.content;
    }
    
    return this.commentRepository.save(comment);
  }

  // Delete a comment (owner or file owner can delete)
  async remove(commentId: string, userId: string): Promise<void> {
    const comment = await this.commentRepository.findOne({
      where: { id: commentId },
      relations: ['file'],
    });
    
    if (!comment) {
      throw new NotFoundException('Comment not found');
    }
    
    // Allow deletion by comment owner or file owner
    if (comment.userId !== userId && comment.file.ownerId !== userId) {
      throw new ForbiddenException('You cannot delete this comment');
    }

    await this.commentRepository.remove(comment);
  }

  // Get comment count for a file
  async getCount(fileId: string): Promise<number> {
    return this.commentRepository.count({ where: { fileId } });
  }
}
