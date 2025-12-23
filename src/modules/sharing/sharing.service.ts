import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, LessThan } from 'typeorm';
import { v4 as uuidv4 } from 'uuid';
import * as bcrypt from 'bcrypt';
import { ShareLink } from './entities/share-link.entity';
import { PermissionRole } from '@modules/permissions/entities/permission.entity';
import { MinioService } from '@modules/storage/minio.service';
import { File } from '@modules/files/entities/file.entity';

export interface CreateShareLinkDto {
  fileId?: string;
  folderId?: string;
  password?: string;
  allowDownload?: boolean;
  expiresAt?: Date;
  maxAccessCount?: number;
}

@Injectable()
export class SharingService {
  constructor(
    @InjectRepository(ShareLink)
    private shareLinkRepository: Repository<ShareLink>,
    @InjectRepository(File)
    private fileRepository: Repository<File>,
    private minioService: MinioService,
  ) {}

  async createShareLink(dto: CreateShareLinkDto, userId: string): Promise<ShareLink> {
    if (!dto.fileId && !dto.folderId) {
      throw new BadRequestException('Either fileId or folderId is required');
    }

    const token = uuidv4().replace(/-/g, '');
    
    const shareLink = this.shareLinkRepository.create({
      fileId: dto.fileId ?? undefined,
      folderId: dto.folderId ?? undefined,
      token,
      passwordHash: dto.password ? await bcrypt.hash(dto.password, 10) : undefined,
      allowDownload: dto.allowDownload ?? true,
      role: PermissionRole.VIEWER,
      expiresAt: dto.expiresAt,
      maxAccessCount: dto.maxAccessCount,
      createdById: userId,
    });

    return this.shareLinkRepository.save(shareLink);
  }

  async getByToken(token: string): Promise<ShareLink> {
    const link = await this.shareLinkRepository.findOne({
      where: { token },
      relations: ['file', 'folder'],
    });

    if (!link) {
      throw new NotFoundException('Share link not found');
    }

    // Check expiry
    if (link.expiresAt && link.expiresAt < new Date()) {
      throw new BadRequestException('Share link has expired');
    }

    // Check access count
    if (link.maxAccessCount && link.accessCount >= link.maxAccessCount) {
      throw new BadRequestException('Share link access limit reached');
    }

    return link;
  }

  async accessShareLink(token: string, password?: string): Promise<{ file?: File; allowDownload?: boolean }> {
    const link = await this.getByToken(token);

    // Check password
    if (link.passwordHash) {
      if (!password || !(await bcrypt.compare(password, link.passwordHash))) {
        throw new BadRequestException('Invalid password');
      }
    }

    // Increment access count
    link.accessCount++;
    await this.shareLinkRepository.save(link);

    if (link.file) {
      return { file: link.file, allowDownload: link.allowDownload };
    }

    return { file: undefined };
  }

  async deleteShareLink(id: string, userId: string): Promise<void> {
    const link = await this.shareLinkRepository.findOne({
      where: { id, createdById: userId },
    });

    if (!link) {
      throw new NotFoundException('Share link not found');
    }

    await this.shareLinkRepository.delete(id);
  }

  async listShareLinks(fileId?: string, folderId?: string): Promise<ShareLink[]> {
    const where: any = {};
    if (fileId) where.fileId = fileId;
    if (folderId) where.folderId = folderId;

    return this.shareLinkRepository.find({
      where,
      order: { createdAt: 'DESC' },
    });
  }
}
