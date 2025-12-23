import {
  Controller,
  Get,
  Post,
  Delete,
  Param,
  Body,
  Query,
  UseGuards,
  HttpCode,
  HttpStatus,
  Res,
  StreamableFile,
  NotFoundException,
} from '@nestjs/common';
import { Response } from 'express';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { SharingService, CreateShareLinkDto } from './sharing.service';
import { JwtAuthGuard } from '@common/guards/jwt-auth.guard';
import { CurrentUser } from '@common/decorators/current-user.decorator';
import { Public } from '@common/decorators/public.decorator';
import { User } from '@modules/users/entities/user.entity';
import { MinioService } from '@modules/storage/minio.service';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { File, FileStatus } from '@modules/files/entities/file.entity';

@ApiTags('Sharing')
@Controller('share')
export class SharingController {
  constructor(
    private readonly sharingService: SharingService,
    private readonly minioService: MinioService,
    @InjectRepository(File)
    private fileRepository: Repository<File>,
  ) {}

  /**
   * POST /share
   * Create a share link for file or folder
   */
  @Post()
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Create share link' })
  async createShareLink(
    @Body() dto: CreateShareLinkDto,
    @CurrentUser() user: User,
  ) {
    const shareLink = await this.sharingService.createShareLink(dto, user.id);
    const baseUrl = process.env.FRONTEND_URL || 'http://localhost:3001';
    return {
      ...shareLink,
      shareUrl: `${baseUrl}/share/${shareLink.token}`,
    };
  }

  /**
   * GET /share
   * List share links for a file or folder
   */
  @Get()
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'List share links' })
  @ApiQuery({ name: 'fileId', required: false })
  @ApiQuery({ name: 'folderId', required: false })
  async listShareLinks(
    @Query('fileId') fileId?: string,
    @Query('folderId') folderId?: string,
  ) {
    const links = await this.sharingService.listShareLinks(fileId, folderId);
    const baseUrl = process.env.FRONTEND_URL || 'http://localhost:3001';
    return links.map(link => ({
      ...link,
      shareUrl: `${baseUrl}/share/${link.token}`,
    }));
  }

  /**
   * DELETE /share/:id
   * Delete a share link
   */
  @Delete(':id')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete share link' })
  async deleteShareLink(
    @Param('id') id: string,
    @CurrentUser() user: User,
  ) {
    await this.sharingService.deleteShareLink(id, user.id);
  }

  /**
   * GET /share/:token/info
   * Get shared file/folder info (public, no auth)
   */
  @Public()
  @Get(':token/info')
  @ApiOperation({ summary: 'Get shared content info' })
  async getShareInfo(
    @Param('token') token: string,
    @Query('password') password?: string,
  ) {
    const result = await this.sharingService.accessShareLink(token, password);
    
    if (result.file) {
      return {
        type: 'file',
        file: {
          id: result.file.id,
          name: result.file.name,
          mimeType: result.file.mimeType,
          sizeBytes: result.file.sizeBytes,
          hasPreview: result.file.hasPreview,
        },
        allowDownload: result.allowDownload,
      };
    }
    
    return { type: 'folder', folder: null };
  }

  /**
   * GET /share/:token/preview
   * Stream file for preview (public, no auth)
   */
  @Public()
  @Get(':token/preview')
  @ApiOperation({ summary: 'Preview shared file' })
  async previewSharedFile(
    @Param('token') token: string,
    @Query('password') password?: string,
    @Res({ passthrough: true }) res?: Response,
  ): Promise<StreamableFile> {
    const link = await this.sharingService.getByToken(token);
    
    if (!link.file) {
      throw new NotFoundException('File not found');
    }

    // Check password if required
    const result = await this.sharingService.accessShareLink(token, password);
    const file = result.file!;

    // Get preview or original file
    const storageKey = file.previewKey || file.storageKey;
    const bucket = file.previewKey ? 'previews' : 'files';

    const stream = await this.minioService.getObject(bucket as any, storageKey);

    // Determine mime type
    let mimeType = file.mimeType;
    if (file.previewKey?.endsWith('.pdf')) {
      mimeType = 'application/pdf';
    }

    res?.set({
      'Content-Type': mimeType,
      'Content-Disposition': `inline; filename="${encodeURIComponent(file.name)}"`,
    });

    return new StreamableFile(stream as any);
  }

  /**
   * GET /share/:token/download
   * Download shared file (public, no auth)
   */
  @Public()
  @Get(':token/download')
  @ApiOperation({ summary: 'Download shared file' })
  async downloadSharedFile(
    @Param('token') token: string,
    @Query('password') password?: string,
    @Res({ passthrough: true }) res?: Response,
  ): Promise<StreamableFile> {
    const link = await this.sharingService.getByToken(token);
    
    if (!link.allowDownload) {
      throw new NotFoundException('Download not allowed for this link');
    }

    if (!link.file) {
      throw new NotFoundException('File not found');
    }

    // Check password and increment access
    const result = await this.sharingService.accessShareLink(token, password);
    const file = result.file!;

    const stream = await this.minioService.getObject('files', file.storageKey);

    res?.set({
      'Content-Type': file.mimeType,
      'Content-Disposition': `attachment; filename="${encodeURIComponent(file.name)}"`,
    });

    return new StreamableFile(stream as any);
  }

  /**
   * GET /share/:token/check
   * Check if share link exists and if password is required (no access count increment)
   */
  @Public()
  @Get(':token/check')
  @ApiOperation({ summary: 'Check share link status' })
  async checkShareLink(@Param('token') token: string) {
    try {
      const link = await this.sharingService.getByToken(token);
      return {
        valid: true,
        requiresPassword: !!link.passwordHash,
        allowDownload: link.allowDownload,
        type: link.fileId ? 'file' : 'folder',
      };
    } catch {
      return { valid: false };
    }
  }
}
