import { Injectable, NotFoundException, BadRequestException, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { v4 as uuidv4 } from 'uuid';
import { File, FileStatus, ScanStatus } from './entities/file.entity';
import { FileVersion } from './entities/file-version.entity';
import { MinioService } from '@modules/storage/minio.service';
import { InitUploadDto, InitUploadResponseDto, CompleteUploadResponseDto } from './dto';
import { User } from '@modules/users/entities/user.entity';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class FilesService {
  private readonly logger = new Logger(FilesService.name);
  private readonly presignedUrlExpiry: number;

  constructor(
    @InjectRepository(File)
    private fileRepository: Repository<File>,
    @InjectRepository(FileVersion)
    private fileVersionRepository: Repository<FileVersion>,
    @InjectRepository(User)
    private userRepository: Repository<User>,
    private minioService: MinioService,
    private configService: ConfigService,
    @InjectQueue('file-processing')
    private fileProcessingQueue: Queue,
  ) {
    this.presignedUrlExpiry = parseInt(this.configService.get('PRESIGNED_URL_EXPIRY', '3600'));
  }

  /**
   * Initialize file upload - create record and generate presigned URL
   */
  async initUpload(dto: InitUploadDto, userId: string): Promise<InitUploadResponseDto> {
    // Generate unique storage key
    const fileId = uuidv4();
    const extension = this.extractExtension(dto.name);
    const storageKey = `${fileId}/v1_${dto.name}`;
    const tempKey = `uploads/${fileId}/${dto.name}`;

    // Create file record
    const file = this.fileRepository.create({
      id: fileId,
      name: dto.name,
      folderId: dto.folderId ?? undefined,
      ownerId: userId,
      mimeType: dto.mimeType,
      extension,
      storageKey,
      sizeBytes: dto.sizeBytes,
      status: FileStatus.UPLOADING,
      scanStatus: ScanStatus.PENDING,
    });
    await this.fileRepository.save(file);

    // Generate presigned URL
    const uploadUrl = await this.minioService.getPresignedUploadUrl(tempKey, this.presignedUrlExpiry);
    const expiresAt = new Date(Date.now() + this.presignedUrlExpiry * 1000);

    this.logger.log(`Init upload: ${file.id} - ${file.name}`);

    return {
      fileId: file.id,
      uploadUrl,
      expiresAt,
    };
  }

  /**
   * Complete file upload - verify file exists and queue processing
   */
  async completeUpload(fileId: string, userId: string): Promise<CompleteUploadResponseDto> {
    const file = await this.fileRepository.findOne({
      where: { id: fileId, ownerId: userId },
    });

    if (!file) {
      throw new NotFoundException('File not found');
    }

    if (file.status !== FileStatus.UPLOADING) {
      throw new BadRequestException('File upload already completed or processing');
    }

    // Verify file exists in MinIO temp bucket
    const tempKey = `uploads/${fileId}/${file.name}`;
    const exists = await this.minioService.objectExists('temp', tempKey);
    
    if (!exists) {
      throw new BadRequestException('File not uploaded yet. Please upload to the presigned URL first.');
    }

    // Move from temp to files bucket
    await this.minioService.moveFromTemp(tempKey, file.storageKey);

    // Create first version
    const version = this.fileVersionRepository.create({
      fileId: file.id,
      versionNumber: 1,
      storageKey: file.storageKey,
      sizeBytes: file.sizeBytes,
      uploadedById: userId,
    });
    await this.fileVersionRepository.save(version);

    // Update file status and link to version
    file.status = FileStatus.SCANNING;
    file.currentVersionId = version.id;
    await this.fileRepository.save(file);

    // Update user storage used
    await this.userRepository.increment({ id: userId }, 'storageUsedBytes', file.sizeBytes);

    // Queue processing jobs
    await this.fileProcessingQueue.add('virus-scan', {
      fileId: file.id,
      storageKey: file.storageKey,
      mimeType: file.mimeType,
    }, {
      attempts: 3,
      backoff: { type: 'exponential', delay: 5000 },
    });

    this.logger.log(`Complete upload: ${file.id} - queued for processing`);

    return {
      id: file.id,
      name: file.name,
      status: file.status,
      mimeType: file.mimeType,
      sizeBytes: file.sizeBytes,
    };
  }

  /**
   * Direct upload via multipart/form-data (API proxy to MinIO)
   * No presigned URL needed - file goes through API
   */
  async directUpload(
    file: Express.Multer.File,
    dto: any,
    userId: string,
  ): Promise<CompleteUploadResponseDto> {
    const fileId = uuidv4();
    const fileName = dto.name || file.originalname;
    const extension = this.extractExtension(fileName);
    const storageKey = `${fileId}/v1_${fileName}`;

    // Create file record
    const fileRecord = this.fileRepository.create({
      id: fileId,
      name: fileName,
      folderId: dto.folderId ?? undefined,
      ownerId: userId,
      mimeType: file.mimetype,
      extension,
      storageKey,
      sizeBytes: file.size,
      status: FileStatus.SCANNING,
      scanStatus: ScanStatus.PENDING,
    });
    await this.fileRepository.save(fileRecord);

    // Upload directly to MinIO files bucket
    await this.minioService.uploadBuffer(
      'files',
      storageKey,
      file.buffer,
      file.mimetype,
    );

    // Create first version
    const version = this.fileVersionRepository.create({
      fileId: fileRecord.id,
      versionNumber: 1,
      storageKey: fileRecord.storageKey,
      sizeBytes: fileRecord.sizeBytes,
      uploadedById: userId,
    });
    await this.fileVersionRepository.save(version);

    // Update file with version
    fileRecord.currentVersionId = version.id;
    await this.fileRepository.save(fileRecord);

    // Update user storage used
    await this.userRepository.increment({ id: userId }, 'storageUsedBytes', fileRecord.sizeBytes);

    // Queue processing jobs
    await this.fileProcessingQueue.add('virus-scan', {
      fileId: fileRecord.id,
      storageKey: fileRecord.storageKey,
      mimeType: fileRecord.mimeType,
    }, {
      attempts: 3,
      backoff: { type: 'exponential', delay: 5000 },
    });

    this.logger.log(`Direct upload: ${fileRecord.id} - ${fileRecord.name}`);

    return {
      id: fileRecord.id,
      name: fileRecord.name,
      status: fileRecord.status,
      mimeType: fileRecord.mimeType,
      sizeBytes: fileRecord.sizeBytes,
    };
  }

  /**
   * Get presigned download URL for file
   */
  async getDownloadUrl(fileId: string, userId: string): Promise<{ downloadUrl: string; fileName: string }> {
    const file = await this.fileRepository.findOne({
      where: { id: fileId },
    });

    if (!file) {
      throw new NotFoundException('File not found');
    }

    // TODO: Check permission here
    if (file.ownerId !== userId) {
      throw new NotFoundException('File not found or access denied');
    }

    if (file.status !== FileStatus.READY && file.status !== FileStatus.PROCESSING) {
      throw new BadRequestException(`File is not ready for download. Status: ${file.status}`);
    }

    const downloadUrl = await this.minioService.getPresignedDownloadUrl(
      'files',
      file.storageKey,
      this.presignedUrlExpiry,
      file.name,
    );

    return {
      downloadUrl,
      fileName: file.name,
    };
  }

  /**
   * Get file stream for direct download (proxied through API)
   */
  async getFileStream(fileId: string, userId: string): Promise<{
    stream: NodeJS.ReadableStream;
    fileName: string;
    mimeType: string;
    size: number;
  }> {
    const file = await this.fileRepository.findOne({
      where: { id: fileId },
    });

    if (!file) {
      throw new NotFoundException('File not found');
    }

    // TODO: Check permission here
    if (file.ownerId !== userId) {
      throw new NotFoundException('File not found or access denied');
    }

    if (file.status !== FileStatus.READY && file.status !== FileStatus.PROCESSING) {
      throw new BadRequestException(`File is not ready for download. Status: ${file.status}`);
    }

    const stream = await this.minioService.getObject('files', file.storageKey);

    return {
      stream,
      fileName: file.name,
      mimeType: file.mimeType,
      size: file.sizeBytes,
    };
  }

  /**
   * Get thumbnail stream for file preview
   */
  async getThumbnailStream(fileId: string, userId: string): Promise<{
    stream: NodeJS.ReadableStream;
    mimeType: string;
  } | null> {
    const file = await this.fileRepository.findOne({
      where: { id: fileId },
    });

    if (!file || file.ownerId !== userId) {
      throw new NotFoundException('File not found');
    }

    if (!file.thumbnailKey) {
      return null; // No thumbnail available
    }

    const stream = await this.minioService.getObject('thumbnails', file.thumbnailKey);
    return {
      stream,
      mimeType: 'image/webp',
    };
  }

  /**
   * Get preview stream for direct file viewing (images, PDFs, videos)
   */
  async getPreviewStream(fileId: string, userId: string): Promise<{
    stream: NodeJS.ReadableStream;
    fileName: string;
    mimeType: string;
    size: number;
  }> {
    const file = await this.fileRepository.findOne({
      where: { id: fileId },
    });

    if (!file) {
      throw new NotFoundException('File not found');
    }

    if (file.ownerId !== userId) {
      throw new NotFoundException('File not found or access denied');
    }

    if (file.status !== FileStatus.READY && file.status !== FileStatus.PROCESSING) {
      throw new BadRequestException(`File is not ready. Status: ${file.status}`);
    }

    // For preview, we use the original file (or preview version if available)
    const storageKey = file.previewKey || file.storageKey;
    const bucket = file.previewKey ? 'previews' : 'files';

    const stream = await this.minioService.getObject(bucket as any, storageKey);

    // Determine mimeType: if previewKey exists and is PDF, use PDF mimeType
    let previewMimeType = file.mimeType;
    if (file.previewKey) {
      if (file.previewKey.endsWith('.pdf')) {
        previewMimeType = 'application/pdf';
      } else if (file.previewKey.endsWith('.png')) {
        previewMimeType = 'image/png';
      } else if (file.previewKey.endsWith('.mp4')) {
        previewMimeType = 'video/mp4';
      }
    }

    return {
      stream,
      fileName: file.name,
      mimeType: previewMimeType,
      size: file.sizeBytes,
    };
  }

  /**
   * Get file by ID
   */
  async findById(fileId: string): Promise<File | null> {
    return this.fileRepository.findOne({
      where: { id: fileId },
      relations: ['owner', 'folder', 'currentVersion'],
    });
  }

  /**
   * List files for user (in specific folder or root)
   */
  async listFiles(userId: string, folderId?: string): Promise<File[]> {
    const where: any = {
      ownerId: userId,
      isTrashed: false,
    };
    
    if (folderId) {
      where.folderId = folderId;
    } else {
      where.folderId = null;
    }

    return this.fileRepository.find({
      where,
      order: { name: 'ASC' },
    });
  }

  /**
   * Search files by name
   */
  async search(userId: string, query: string): Promise<File[]> {
    if (!query || query.trim().length === 0) {
      return [];
    }

    return this.fileRepository
      .createQueryBuilder('file')
      .where('file.ownerId = :userId', { userId })
      .andWhere('file.isTrashed = false')
      .andWhere('LOWER(file.name) LIKE LOWER(:query)', { query: `%${query}%` })
      .orderBy('file.name', 'ASC')
      .limit(50)
      .getMany();
  }

  /**
   * Toggle starred status for file
   */
  async toggleStar(fileId: string, userId: string): Promise<{ isStarred: boolean }> {
    const file = await this.fileRepository.findOne({
      where: { id: fileId, ownerId: userId, isTrashed: false },
    });

    if (!file) {
      throw new NotFoundException('File not found');
    }

    file.isStarred = !file.isStarred;
    await this.fileRepository.save(file);

    return { isStarred: file.isStarred };
  }

  /**
   * List all starred files for user
   */
  async listStarred(userId: string): Promise<File[]> {
    return this.fileRepository.find({
      where: {
        ownerId: userId,
        isStarred: true,
        isTrashed: false,
      },
      order: { name: 'ASC' },
    });
  }

  /**
   * Rename file
   */
  async rename(fileId: string, userId: string, newName: string): Promise<File> {
    const file = await this.fileRepository.findOne({
      where: { id: fileId, ownerId: userId, isTrashed: false },
    });

    if (!file) {
      throw new NotFoundException('File not found');
    }

    file.name = newName;
    return this.fileRepository.save(file);
  }

  /**
   * Move file to different folder
   */
  async move(fileId: string, userId: string, targetFolderId: string | null): Promise<File> {
    const file = await this.fileRepository.findOne({
      where: { id: fileId, ownerId: userId, isTrashed: false },
    });

    if (!file) {
      throw new NotFoundException('File not found');
    }

    file.folderId = targetFolderId ?? undefined;
    return this.fileRepository.save(file);
  }

  /**
   * Soft delete file (move to trash)
   */
  async softDelete(fileId: string, userId: string): Promise<void> {
    const file = await this.fileRepository.findOne({
      where: { id: fileId, ownerId: userId },
    });

    if (!file) {
      throw new NotFoundException('File not found');
    }

    file.isTrashed = true;
    file.trashedAt = new Date();
    await this.fileRepository.save(file);
  }

  /**
   * Restore file from trash
   */
  async restore(fileId: string, userId: string): Promise<void> {
    const file = await this.fileRepository.findOne({
      where: { id: fileId, ownerId: userId, isTrashed: true },
    });

    if (!file) {
      throw new NotFoundException('File not found in trash');
    }

    file.isTrashed = false;
    file.trashedAt = undefined;
    await this.fileRepository.save(file);
  }

  /**
   * List all files in trash for user
   */
  async listTrashed(userId: string): Promise<File[]> {
    return this.fileRepository.find({
      where: {
        ownerId: userId,
        isTrashed: true,
      },
      order: { trashedAt: 'DESC' },
    });
  }

  /**
   * Permanently delete file (remove from storage)
   */
  async permanentDelete(fileId: string, userId: string): Promise<void> {
    const file = await this.fileRepository.findOne({
      where: { id: fileId, ownerId: userId, isTrashed: true },
    });

    if (!file) {
      throw new NotFoundException('File not found in trash');
    }

    // Delete from MinIO
    try {
      await this.minioService.deleteObject('files', file.storageKey);
      if (file.thumbnailKey) {
        await this.minioService.deleteObject('thumbnails', file.thumbnailKey);
      }
      if (file.previewKey) {
        await this.minioService.deleteObject('previews', file.previewKey);
      }
    } catch (error) {
      this.logger.warn(`Failed to delete file from storage: ${error}`);
    }

    // Update user storage
    await this.userRepository.decrement({ id: userId }, 'storageUsedBytes', file.sizeBytes);

    // Delete file record
    await this.fileRepository.delete(fileId);
  }

  /**
   * Empty trash - permanently delete all trashed files
   */
  async emptyTrash(userId: string): Promise<{ deletedCount: number }> {
    const trashedFiles = await this.listTrashed(userId);
    let deletedCount = 0;

    for (const file of trashedFiles) {
      try {
        await this.permanentDelete(file.id, userId);
        deletedCount++;
      } catch (error) {
        this.logger.warn(`Failed to permanently delete file ${file.id}: ${error}`);
      }
    }

    return { deletedCount };
  }

  private extractExtension(filename: string): string | undefined {
    const parts = filename.split('.');
    return parts.length > 1 ? parts.pop()?.toLowerCase() : undefined;
  }
}
