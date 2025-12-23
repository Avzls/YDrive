import { Injectable, NotFoundException, ConflictException, ForbiddenException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, IsNull } from 'typeorm';
import * as archiver from 'archiver';
import { PassThrough } from 'stream';
import { Folder } from './entities/folder.entity';
import { File } from '@modules/files/entities/file.entity';
import { MinioService } from '@modules/storage/minio.service';
import { PermissionsService } from '@modules/permissions/permissions.service';
import { PermissionRole } from '@modules/permissions/entities/permission.entity';

export interface CreateFolderDto {
  name: string;
  parentId?: string;
}

@Injectable()
export class FoldersService {
  constructor(
    @InjectRepository(Folder)
    private folderRepository: Repository<Folder>,
    @InjectRepository(File)
    private fileRepository: Repository<File>,
    private minioService: MinioService,
    private permissionsService: PermissionsService,
  ) {}

  async create(dto: CreateFolderDto, userId: string): Promise<Folder> {
    let path = '/';
    let depth = 0;

    if (dto.parentId) {
      const parent = await this.folderRepository.findOne({
        where: { id: dto.parentId, ownerId: userId, isTrashed: false },
      });
      if (!parent) {
        throw new NotFoundException('Parent folder not found');
      }
      path = `${parent.path}${parent.id}/`;
      depth = parent.depth + 1;
    }

    // Check for duplicate name
    const existing = await this.folderRepository.findOne({
      where: {
        name: dto.name,
        parentId: dto.parentId || IsNull(),
        ownerId: userId,
        isTrashed: false,
      },
    });

    if (existing) {
      throw new ConflictException('Folder with this name already exists');
    }

    const folder = this.folderRepository.create({
      name: dto.name,
      parentId: dto.parentId ?? undefined,
      ownerId: userId,
      path,
      depth,
    });

    return this.folderRepository.save(folder);
  }

  async findById(id: string, userId: string): Promise<Folder> {
    const folder = await this.folderRepository.findOne({
      where: { id, isTrashed: false },
      relations: ['children', 'files'],
    });

    if (!folder) {
      throw new NotFoundException('Folder not found');
    }

    if (folder.ownerId !== userId) {
      const hasAccess = await this.permissionsService.checkAccess(userId, id, 'folder', PermissionRole.VIEWER);
      if (!hasAccess) {
        throw new NotFoundException('Folder not found or access denied');
      }
    }

    return folder;
  }

  async listContents(folderId: string | null, userId: string) {
    if (folderId) {
      // Check access to parent folder if not root
      const folder = await this.folderRepository.findOne({ where: { id: folderId } });
      if (!folder || folder.isTrashed) throw new NotFoundException('Folder not found');
      
      if (folder.ownerId !== userId) {
        const hasAccess = await this.permissionsService.checkAccess(userId, folderId, 'folder', PermissionRole.VIEWER);
        if (!hasAccess) throw new NotFoundException('Folder not found or access denied');
      }
    }

    const folders = await this.folderRepository.find({
      where: {
        parentId: folderId || IsNull(),
        isTrashed: false,
        // If root, only show owned folders. If subfolder, we already checked access to parent.
        ...(folderId ? {} : { ownerId: userId }),
      },
      order: { name: 'ASC' },
    });

    const files = await this.fileRepository.find({
      where: {
        folderId: folderId || IsNull(),
        isTrashed: false,
        ...(folderId ? {} : { ownerId: userId }),
      },
      order: { name: 'ASC' },
    });

    return { folders, files };
  }

  async rename(id: string, newName: string, userId: string): Promise<Folder> {
    const folder = await this.folderRepository.findOne({ where: { id, isTrashed: false } });
    if (!folder) throw new NotFoundException('Folder not found');

    if (folder.ownerId !== userId) {
      const hasAccess = await this.permissionsService.checkAccess(userId, id, 'folder', PermissionRole.EDITOR);
      if (!hasAccess) throw new ForbiddenException('You do not have permission to rename this folder');
    }

    folder.name = newName;
    return this.folderRepository.save(folder);
  }

  async move(id: string, newParentId: string | null, userId: string): Promise<Folder> {
    const folder = await this.folderRepository.findOne({ where: { id, isTrashed: false } });
    if (!folder) throw new NotFoundException('Folder not found');

    if (folder.ownerId !== userId) {
      const hasAccess = await this.permissionsService.checkAccess(userId, id, 'folder', PermissionRole.EDITOR);
      if (!hasAccess) throw new ForbiddenException('You do not have permission to move this folder');
    }

    // Prevent moving to self or descendant
    if (newParentId) {
      const newParent = await this.folderRepository.findOne({
        where: { id: newParentId, isTrashed: false }, // Don't filter by ownerId here, but check if user has access to target
      });
      if (!newParent) {
        throw new NotFoundException('Target folder not found');
      }

      if (newParent.ownerId !== userId) {
        const hasAccess = await this.permissionsService.checkAccess(userId, newParentId, 'folder', PermissionRole.EDITOR);
        if (!hasAccess) throw new ForbiddenException('You do not have permission to move items into the target folder');
      }

      if (newParent.path.includes(folder.id)) {
        throw new ConflictException('Cannot move folder into its own descendant');
      }
      folder.parentId = newParentId;
      folder.path = `${newParent.path}${newParent.id}/`;
      folder.depth = newParent.depth + 1;
    } else {
      folder.parentId = undefined;
      folder.path = '/';
      folder.depth = 0;
    }

    return this.folderRepository.save(folder);
  }

  async softDelete(id: string, userId: string): Promise<void> {
    const folder = await this.folderRepository.findOne({ where: { id, isTrashed: false } });
    if (!folder) throw new NotFoundException('Folder not found');

    if (folder.ownerId !== userId) {
      const hasAccess = await this.permissionsService.checkAccess(userId, id, 'folder', PermissionRole.EDITOR);
      if (!hasAccess) throw new ForbiddenException('You do not have permission to delete this folder');
    }
    
    // Cascade soft delete to children folders
    await this.folderRepository
      .createQueryBuilder()
      .update(Folder)
      .set({ isTrashed: true, trashedAt: new Date() })
      .where('path LIKE :path', { path: `%${folder.id}%` })
      .execute();

    // Cascade soft delete to files in this folder and subfolders
    const descendantFolderIds = await this.folderRepository
      .createQueryBuilder('f')
      .select('f.id')
      .where('f.path LIKE :path', { path: `%${folder.id}%` })
      .getRawMany();

    const folderIds = [folder.id, ...descendantFolderIds.map((f: { f_id: string }) => f.f_id)];
    
    await this.fileRepository
      .createQueryBuilder()
      .update(File)
      .set({ isTrashed: true, trashedAt: new Date() })
      .where('folder_id IN (:...ids)', { ids: folderIds })
      .execute();

    folder.isTrashed = true;
    folder.trashedAt = new Date();
    await this.folderRepository.save(folder);
  }

  async restore(id: string, userId: string): Promise<void> {
    const folder = await this.folderRepository.findOne({
      where: { id, ownerId: userId, isTrashed: true },
    });

    if (!folder) {
      throw new NotFoundException('Folder not found in trash');
    }

    // If parent is trashed, move to root
    if (folder.parentId) {
      const parent = await this.folderRepository.findOne({
        where: { id: folder.parentId },
      });
      if (parent?.isTrashed) {
        folder.parentId = undefined;
        folder.path = '/';
        folder.depth = 0;
      }
    }

    folder.isTrashed = false;
    folder.trashedAt = undefined;
    await this.folderRepository.save(folder);
  }

  /**
   * List all trashed folders for user
   */
  async listTrashed(userId: string): Promise<Folder[]> {
    return this.folderRepository.find({
      where: {
        ownerId: userId,
        isTrashed: true,
      },
      order: { trashedAt: 'DESC' },
    });
  }

  /**
   * Search folders by name
   */
  async search(userId: string, query: string): Promise<Folder[]> {
    if (!query || query.trim().length === 0) {
      return [];
    }

    // Search owned folders and folders where user has explicit permission
    return this.folderRepository
      .createQueryBuilder('folder')
      .leftJoin('permissions', 'perm', 'perm.folder_id = folder.id AND perm.user_id = :userId', { userId })
      .where('(folder.ownerId = :userId OR perm.id IS NOT NULL)', { userId })
      .andWhere('folder.isTrashed = false')
      .andWhere('LOWER(folder.name) LIKE LOWER(:query)', { query: `%${query}%` })
      .orderBy('folder.name', 'ASC')
      .limit(50)
      .getMany();
  }

  /**
   * Permanently delete folder and its contents
   */
  async permanentDelete(id: string, userId: string): Promise<void> {
    const folder = await this.folderRepository.findOne({
      where: { id, ownerId: userId, isTrashed: true },
    });

    if (!folder) {
      throw new NotFoundException('Folder not found in trash');
    }

    // Delete all files in this folder (they should already be trashed)
    await this.fileRepository.delete({ folderId: id });

    // Delete the folder
    await this.folderRepository.delete(id);
  }

  /**
   * Toggle starred status for folder
   */
  async toggleStar(id: string, userId: string): Promise<{ isStarred: boolean }> {
    const folder = await this.findById(id, userId);
    folder.isStarred = !folder.isStarred;
    await this.folderRepository.save(folder);
    return { isStarred: folder.isStarred };
  }

  /**
   * List all starred folders for user
   */
  async listStarred(userId: string): Promise<Folder[]> {
    return this.folderRepository.find({
      where: {
        ownerId: userId,
        isStarred: true,
        isTrashed: false,
      },
      order: { name: 'ASC' },
    });
  }

  /**
   * Get folder as ZIP stream
   */
  async getZipStream(id: string, userId: string): Promise<{ stream: PassThrough; folderName: string }> {
    const folder = await this.folderRepository.findOne({ where: { id, isTrashed: false } });
    if (!folder) throw new NotFoundException('Folder not found');

    if (folder.ownerId !== userId) {
      const hasAccess = await this.permissionsService.checkAccess(userId, id, 'folder', PermissionRole.VIEWER);
      if (!hasAccess) throw new NotFoundException('Folder not found or access denied');
    }
    
    const passThrough = new PassThrough();
    const archive = archiver('zip', {
      zlib: { level: 5 }, // Compression level
    });

    archive.pipe(passThrough);

    // Recursively add folder contents
    await this.addFolderToArchive(archive, folder, userId, '');

    archive.finalize();

    return { stream: passThrough, folderName: folder.name };
  }

  private async addFolderToArchive(
    archive: archiver.Archiver,
    folder: Folder,
    userId: string,
    basePath: string,
  ): Promise<void> {
    const currentPath = basePath ? `${basePath}/${folder.name}` : folder.name;

    // Get files in this folder
    const files = await this.fileRepository.find({
      where: {
        folderId: folder.id,
        isTrashed: false,
      },
    });

    // Add files to archive
    for (const file of files) {
      try {
        const fileStream = await this.minioService.getObject('files', file.storageKey);
        // Ensure file has extension - derive from mimeType if missing
        let fileName = file.name;
        if (!fileName.includes('.') && file.mimeType) {
          const ext = this.getExtensionFromMimeType(file.mimeType);
          if (ext) fileName = `${fileName}.${ext}`;
        }
        archive.append(fileStream as any, { name: `${currentPath}/${fileName}` });
      } catch (err) {
        console.error(`Failed to add file ${file.name} to archive:`, err);
      }
    }

    // Get subfolders
    const subfolders = await this.folderRepository.find({
      where: {
        parentId: folder.id,
        isTrashed: false,
      },
    });

    // Recursively add subfolders
    for (const subfolder of subfolders) {
      await this.addFolderToArchive(archive, subfolder, userId, currentPath);
    }

    // If folder is empty, add an empty directory entry
    if (files.length === 0 && subfolders.length === 0) {
      archive.append('', { name: `${currentPath}/` });
    }
  }

  private getExtensionFromMimeType(mimeType: string): string | null {
    const mimeToExt: Record<string, string> = {
      // Documents
      'application/pdf': 'pdf',
      'application/msword': 'doc',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
      'application/vnd.ms-excel': 'xls',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'xlsx',
      'application/vnd.ms-powerpoint': 'ppt',
      'application/vnd.openxmlformats-officedocument.presentationml.presentation': 'pptx',
      'text/plain': 'txt',
      'text/csv': 'csv',
      'text/html': 'html',
      'application/json': 'json',
      'application/xml': 'xml',
      // Images
      'image/jpeg': 'jpg',
      'image/png': 'png',
      'image/gif': 'gif',
      'image/webp': 'webp',
      'image/svg+xml': 'svg',
      'image/bmp': 'bmp',
      // Video
      'video/mp4': 'mp4',
      'video/webm': 'webm',
      'video/quicktime': 'mov',
      'video/x-msvideo': 'avi',
      // Audio
      'audio/mpeg': 'mp3',
      'audio/wav': 'wav',
      'audio/ogg': 'ogg',
      // Archives
      'application/zip': 'zip',
      'application/x-rar-compressed': 'rar',
      'application/x-7z-compressed': '7z',
      'application/gzip': 'gz',
    };
    return mimeToExt[mimeType] || null;
  }
}
