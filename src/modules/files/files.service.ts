import { Injectable, NotFoundException, BadRequestException, Logger, ForbiddenException } from '@nestjs/common';
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
import { PermissionsService } from '@modules/permissions/permissions.service';
import { PermissionRole } from '@modules/permissions/entities/permission.entity';
import * as AdmZip from 'adm-zip';
import { createExtractorFromData } from 'node-unrar-js';

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
    private permissionsService: PermissionsService,
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
   * Upload a new version of an existing file
   */
  async uploadNewVersion(
    fileId: string,
    file: Express.Multer.File,
    userId: string,
  ): Promise<CompleteUploadResponseDto> {
    // Find existing file
    const existingFile = await this.fileRepository.findOne({ where: { id: fileId } });
    if (!existingFile) throw new NotFoundException('File not found');

    // Permission check - need editor access
    if (existingFile.ownerId !== userId) {
      const hasAccess = await this.permissionsService.checkAccess(userId, fileId, 'file', PermissionRole.EDITOR);
      if (!hasAccess) throw new ForbiddenException('You do not have permission to update this file');
    }

    // Get current max version number
    const maxVersion = await this.fileVersionRepository
      .createQueryBuilder('v')
      .where('v.fileId = :fileId', { fileId })
      .select('MAX(v.versionNumber)', 'max')
      .getRawOne();
    const newVersionNumber = (maxVersion?.max || 0) + 1;

    // Create new storage key with version number
    const newStorageKey = `${fileId}/v${newVersionNumber}_${existingFile.name}`;

    // Upload to MinIO
    await this.minioService.uploadBuffer(
      'files',
      newStorageKey,
      file.buffer,
      file.mimetype,
    );

    // Create new version record
    const version = this.fileVersionRepository.create({
      fileId,
      versionNumber: newVersionNumber,
      storageKey: newStorageKey,
      sizeBytes: file.size,
      uploadedById: userId,
      comment: `Version ${newVersionNumber} uploaded`,
    });
    await this.fileVersionRepository.save(version);

    // Update file to point to new version
    const oldSize = existingFile.sizeBytes;
    existingFile.currentVersionId = version.id;
    existingFile.storageKey = newStorageKey;
    existingFile.sizeBytes = file.size;
    existingFile.mimeType = file.mimetype;
    existingFile.updatedAt = new Date();
    existingFile.status = FileStatus.SCANNING;
    await this.fileRepository.save(existingFile);

    // Update user storage (add diff)
    const sizeDiff = file.size - Number(oldSize);
    if (sizeDiff > 0) {
      await this.userRepository.increment({ id: existingFile.ownerId }, 'storageUsedBytes', sizeDiff);
    } else if (sizeDiff < 0) {
      await this.userRepository.decrement({ id: existingFile.ownerId }, 'storageUsedBytes', Math.abs(sizeDiff));
    }

    // Queue processing jobs
    await this.fileProcessingQueue.add('virus-scan', {
      fileId: existingFile.id,
      storageKey: newStorageKey,
      mimeType: file.mimetype,
    }, {
      attempts: 3,
      backoff: { type: 'exponential', delay: 5000 },
    });

    this.logger.log(`Uploaded new version ${newVersionNumber} for file: ${fileId}`);

    return {
      id: existingFile.id,
      name: existingFile.name,
      status: existingFile.status,
      mimeType: existingFile.mimeType,
      sizeBytes: existingFile.sizeBytes,
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

    // Check owner or permission
    if (file.ownerId !== userId) {
      const hasAccess = await this.permissionsService.checkAccess(userId, fileId, 'file', PermissionRole.VIEWER);
      if (!hasAccess) {
        throw new NotFoundException('File not found or access denied');
      }
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

    // Check owner or permission
    if (file.ownerId !== userId) {
      const hasAccess = await this.permissionsService.checkAccess(userId, fileId, 'file', PermissionRole.VIEWER);
      if (!hasAccess) {
        throw new NotFoundException('File not found or access denied');
      }
    }

    if (file.status !== FileStatus.READY && file.status !== FileStatus.PROCESSING) {
      throw new BadRequestException(`File is not ready for download. Status: ${file.status}`);
    }

    const stream = await this.minioService.getObject('files', file.storageKey);

    // Track file access
    file.lastAccessedAt = new Date();
    await this.fileRepository.save(file);

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

    if (!file) {
      throw new NotFoundException('File not found');
    }

    // Check owner or permission
    if (file.ownerId !== userId) {
      const hasAccess = await this.permissionsService.checkAccess(userId, fileId, 'file', PermissionRole.VIEWER);
      if (!hasAccess) {
        throw new NotFoundException('File not found or access denied');
      }
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

    // Check owner or permission
    if (file.ownerId !== userId) {
      const hasAccess = await this.permissionsService.checkAccess(userId, fileId, 'file', PermissionRole.VIEWER);
      if (!hasAccess) {
        throw new NotFoundException('File not found or access denied');
      }
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

    // Track file access
    file.lastAccessedAt = new Date();
    await this.fileRepository.save(file);

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
   * Search files with advanced filters
   */
  async search(userId: string, filters: {
    query?: string;
    type?: string;
    modifiedAfter?: Date;
    modifiedBefore?: Date;
    minSize?: number;
    maxSize?: number;
    sortBy?: 'name' | 'updatedAt' | 'sizeBytes';
    sortOrder?: 'ASC' | 'DESC';
  }): Promise<File[]> {
    const qb = this.fileRepository
      .createQueryBuilder('file')
      .leftJoin('permissions', 'perm', 'perm.file_id = file.id AND perm.user_id = :userId', { userId })
      .where('(file.ownerId = :userId OR perm.id IS NOT NULL)', { userId })
      .andWhere('file.isTrashed = false');

    // Name search
    if (filters.query && filters.query.trim().length > 0) {
      qb.andWhere('LOWER(file.name) LIKE LOWER(:query)', { query: `%${filters.query}%` });
    }

    // Type filter (maps to MIME type categories)
    if (filters.type) {
      const mimePatterns: Record<string, string[]> = {
        image: ['image/%'],
        video: ['video/%'],
        audio: ['audio/%'],
        document: ['application/pdf', 'application/msword', 'application/vnd.openxmlformats%', 'text/%'],
        archive: ['application/zip', 'application/x-rar%', 'application/x-7z%', 'application/gzip'],
      };
      const patterns = mimePatterns[filters.type];
      if (patterns && patterns.length > 0) {
        const conditions = patterns.map((p, i) => `file.mimeType LIKE :mime${i}`).join(' OR ');
        const params: Record<string, string> = {};
        patterns.forEach((p, i) => { params[`mime${i}`] = p; });
        qb.andWhere(`(${conditions})`, params);
      } else if (filters.type === 'other') {
        // Exclude known types
        qb.andWhere(`file.mimeType NOT LIKE 'image/%'`)
          .andWhere(`file.mimeType NOT LIKE 'video/%'`)
          .andWhere(`file.mimeType NOT LIKE 'audio/%'`)
          .andWhere(`file.mimeType NOT LIKE 'application/pdf'`)
          .andWhere(`file.mimeType NOT LIKE 'application/msword'`)
          .andWhere(`file.mimeType NOT LIKE 'application/vnd.openxmlformats%'`)
          .andWhere(`file.mimeType NOT LIKE 'text/%'`)
          .andWhere(`file.mimeType NOT LIKE 'application/zip'`)
          .andWhere(`file.mimeType NOT LIKE 'application/x-rar%'`);
      }
    }

    // Date filters
    if (filters.modifiedAfter) {
      qb.andWhere('file.updatedAt >= :modifiedAfter', { modifiedAfter: filters.modifiedAfter });
    }
    if (filters.modifiedBefore) {
      qb.andWhere('file.updatedAt <= :modifiedBefore', { modifiedBefore: filters.modifiedBefore });
    }

    // Size filters
    if (filters.minSize !== undefined) {
      qb.andWhere('file.sizeBytes >= :minSize', { minSize: filters.minSize });
    }
    if (filters.maxSize !== undefined) {
      qb.andWhere('file.sizeBytes <= :maxSize', { maxSize: filters.maxSize });
    }

    // Sorting
    const sortField = filters.sortBy || 'name';
    const sortOrder = filters.sortOrder || 'ASC';
    qb.orderBy(`file.${sortField}`, sortOrder);

    return qb.limit(100).getMany();
  }

  /**
   * Toggle starred status for file
   */
  async toggleStar(fileId: string, userId: string): Promise<{ isStarred: boolean }> {
    const file = await this.fileRepository.findOne({
      where: { id: fileId, isTrashed: false },
    });

    if (!file) {
      throw new NotFoundException('File not found');
    }

    if (file.ownerId !== userId) {
      const hasAccess = await this.permissionsService.checkAccess(userId, fileId, 'file', PermissionRole.VIEWER);
      if (!hasAccess) throw new NotFoundException('File not found or access denied');
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
   * List recently accessed files for user
   */
  async listRecent(userId: string, limit: number = 20): Promise<File[]> {
    return this.fileRepository.find({
      where: {
        ownerId: userId,
        isTrashed: false,
      },
      order: { lastAccessedAt: { direction: 'DESC', nulls: 'LAST' } },
      take: limit,
    });
  }

  /**
   * Rename file
   */
  async rename(fileId: string, userId: string, newName: string): Promise<File> {
    const file = await this.fileRepository.findOne({
      where: { id: fileId, isTrashed: false },
    });

    if (!file) {
      throw new NotFoundException('File not found');
    }

    if (file.ownerId !== userId) {
      const hasAccess = await this.permissionsService.checkAccess(userId, fileId, 'file', PermissionRole.EDITOR);
      if (!hasAccess) throw new ForbiddenException('You do not have permission to rename this file');
    }

    file.name = newName;
    return this.fileRepository.save(file);
  }

  /**
   * Move file to different folder
   */
  async move(fileId: string, userId: string, targetFolderId: string | null): Promise<File> {
    const file = await this.fileRepository.findOne({
      where: { id: fileId, isTrashed: false },
    });

    if (!file) {
      throw new NotFoundException('File not found');
    }

    if (file.ownerId !== userId) {
      const hasAccess = await this.permissionsService.checkAccess(userId, fileId, 'file', PermissionRole.EDITOR);
      if (!hasAccess) throw new ForbiddenException('You do not have permission to move this file');
    }

    // Check target folder access if moving to another folder
    if (targetFolderId) {
      const targetFolder = await this.fileRepository.manager.getRepository('folders').findOne({ // Using manager to avoid circular dependency or just raw repository
        where: { id: targetFolderId, isTrashed: false }
      });
      if (targetFolder && targetFolder.ownerId !== userId) {
        const hasTargetAccess = await this.permissionsService.checkAccess(userId, targetFolderId, 'folder', PermissionRole.EDITOR);
        if (!hasTargetAccess) throw new ForbiddenException('You do not have permission to move items into the target folder');
      }
    }

    file.folderId = targetFolderId ?? undefined;
    return this.fileRepository.save(file);
  }

  /**
   * Soft delete file (move to trash)
   */
  async softDelete(fileId: string, userId: string): Promise<void> {
    const file = await this.fileRepository.findOne({
      where: { id: fileId, isTrashed: false },
    });

    if (!file) {
      throw new NotFoundException('File not found');
    }

    if (file.ownerId !== userId) {
      const hasAccess = await this.permissionsService.checkAccess(userId, fileId, 'file', PermissionRole.EDITOR);
      if (!hasAccess) throw new ForbiddenException('You do not have permission to delete this file');
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

  /**
   * List contents of an archive file (RAR, ZIP)
   */
  async listArchiveContents(fileId: string, userId: string): Promise<any[]> {
    const file = await this.fileRepository.findOne({ where: { id: fileId } });
    if (!file) throw new NotFoundException('File not found');

    // Permission check
    if (file.ownerId !== userId) {
      const hasAccess = await this.permissionsService.checkAccess(userId, fileId, 'file', PermissionRole.VIEWER);
      if (!hasAccess) throw new NotFoundException('File not found or access denied');
    }

    const stream = await this.minioService.getObject('files', file.storageKey);
    const buffer: Buffer = await new Promise((resolve, reject) => {
      const chunks: any[] = [];
      stream.on('data', (chunk) => chunks.push(chunk));
      stream.on('error', reject);
      stream.on('end', () => resolve(Buffer.concat(chunks)));
    });

    const extension = file.extension?.toLowerCase() || this.extractExtension(file.name);

    if (extension === 'zip') {
      try {
        const zip = new AdmZip(buffer);
        return zip.getEntries().map((entry: any) => ({
          name: entry.entryName,
          size: entry.header.size,
          isDirectory: entry.isDirectory,
          mtime: entry.header.time,
        }));
      } catch (err) {
        throw new BadRequestException('Failed to parse ZIP file: ' + err.message);
      }
    } else if (extension === 'rar') {
      try {
        // node-unrar-js needs Uint8Array or ArrayBuffer
        const extractor = await createExtractorFromData({ data: new Uint8Array(buffer).buffer });
        const list = extractor.getFileList();
        const fileHeaders = [...list.fileHeaders];
        return fileHeaders.map(header => ({
          name: header.name,
          size: header.unpSize,
          isDirectory: header.flags.directory,
          mtime: header.time,
        }));
      } catch (err) {
        throw new BadRequestException('Failed to parse RAR file: ' + err.message);
      }
    } else {
      throw new BadRequestException('Unsupported archive format: ' + extension);
    }
  }

  /**
   * List all versions of a file
   */
  async listVersions(fileId: string, userId: string): Promise<FileVersion[]> {
    const file = await this.fileRepository.findOne({ where: { id: fileId } });
    if (!file) throw new NotFoundException('File not found');

    // Permission check
    if (file.ownerId !== userId) {
      const hasAccess = await this.permissionsService.checkAccess(userId, fileId, 'file', PermissionRole.VIEWER);
      if (!hasAccess) throw new NotFoundException('File not found or access denied');
    }

    return this.fileVersionRepository.find({
      where: { fileId },
      relations: ['uploadedBy'],
      order: { versionNumber: 'DESC' },
    });
  }

  /**
   * Get a specific version's stream for download
   */
  async getVersionStream(versionId: string, userId: string): Promise<{
    stream: NodeJS.ReadableStream;
    fileName: string;
    mimeType: string;
    size: number;
  }> {
    const version = await this.fileVersionRepository.findOne({
      where: { id: versionId },
      relations: ['file'],
    });
    if (!version) throw new NotFoundException('Version not found');

    const file = version.file;
    if (!file) throw new NotFoundException('File not found');

    // Permission check
    if (file.ownerId !== userId) {
      const hasAccess = await this.permissionsService.checkAccess(userId, file.id, 'file', PermissionRole.VIEWER);
      if (!hasAccess) throw new NotFoundException('File not found or access denied');
    }

    const stream = await this.minioService.getObject('files', version.storageKey);
    return {
      stream,
      fileName: `v${version.versionNumber}_${file.name}`,
      mimeType: file.mimeType,
      size: Number(version.sizeBytes),
    };
  }

  /**
   * Restore a file to a specific version (creates a new version from the old one)
   */
  async restoreVersion(versionId: string, userId: string): Promise<File> {
    const version = await this.fileVersionRepository.findOne({
      where: { id: versionId },
      relations: ['file'],
    });
    if (!version) throw new NotFoundException('Version not found');

    const file = version.file;
    if (!file) throw new NotFoundException('File not found');

    // Permission check - need editor access to restore
    if (file.ownerId !== userId) {
      const hasAccess = await this.permissionsService.checkAccess(userId, file.id, 'file', PermissionRole.EDITOR);
      if (!hasAccess) throw new ForbiddenException('You do not have permission to restore this file');
    }

    // Get current max version number
    const maxVersion = await this.fileVersionRepository
      .createQueryBuilder('v')
      .where('v.fileId = :fileId', { fileId: file.id })
      .select('MAX(v.versionNumber)', 'max')
      .getRawOne();
    const newVersionNumber = (maxVersion?.max || 0) + 1;

    // Copy the old version's storage key to a new key
    const newStorageKey = `${file.id}/v${newVersionNumber}_${file.name}`;
    await this.minioService.copyObject('files', version.storageKey, 'files', newStorageKey);

    // Create new version record
    const newVersion = this.fileVersionRepository.create({
      fileId: file.id,
      versionNumber: newVersionNumber,
      storageKey: newStorageKey,
      sizeBytes: version.sizeBytes,
      checksumSha256: version.checksumSha256,
      thumbnailKey: version.thumbnailKey,
      previewKey: version.previewKey,
      uploadedById: userId,
      comment: `Restored from version ${version.versionNumber}`,
    });
    await this.fileVersionRepository.save(newVersion);

    // Update file to point to new version
    file.currentVersionId = newVersion.id;
    file.storageKey = newStorageKey;
    file.sizeBytes = version.sizeBytes;
    file.updatedAt = new Date();
    await this.fileRepository.save(file);

    return file;
  }
}
