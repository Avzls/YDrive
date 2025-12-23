import { Injectable, ForbiddenException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, ILike } from 'typeorm';
import { Permission, PermissionRole } from './entities/permission.entity';
import { Folder } from '@modules/folders/entities/folder.entity';
import { File } from '@modules/files/entities/file.entity';
import { User } from '@modules/users/entities/user.entity';

@Injectable()
export class PermissionsService {
  private readonly roleHierarchy = {
    [PermissionRole.OWNER]: 3,
    [PermissionRole.EDITOR]: 2,
    [PermissionRole.VIEWER]: 1,
  };

  constructor(
    @InjectRepository(Permission)
    private permissionRepository: Repository<Permission>,
    @InjectRepository(Folder)
    private folderRepository: Repository<Folder>,
    @InjectRepository(File)
    private fileRepository: Repository<File>,
    @InjectRepository(User)
    private userRepository: Repository<User>,
  ) {}

  /**
   * Check if user has required permission on resource
   */
  async checkAccess(
    userId: string,
    resourceId: string,
    resourceType: 'file' | 'folder',
    requiredRole: PermissionRole,
  ): Promise<boolean> {
    // Get resource
    const resource = resourceType === 'file'
      ? await this.fileRepository.findOne({ where: { id: resourceId } })
      : await this.folderRepository.findOne({ where: { id: resourceId } });

    if (!resource) return false;

    // Owner always has access
    if (resource.ownerId === userId) return true;

    // Check direct permission
    const directPerm = await this.getDirectPermission(userId, resourceId, resourceType);
    if (directPerm && this.hasRole(directPerm.role, requiredRole)) return true;

    // Check inherited permission (traverse up folder tree)
    if (resourceType === 'file' && (resource as File).folderId) {
      return this.checkAccess(userId, (resource as File).folderId!, 'folder', requiredRole);
    }
    if (resourceType === 'folder' && (resource as Folder).parentId) {
      return this.checkAccess(userId, (resource as Folder).parentId!, 'folder', requiredRole);
    }

    return false;
  }

  /**
   * Grant permission to user on resource
   */
  async grantPermission(
    resourceId: string,
    resourceType: 'file' | 'folder',
    userId: string,
    role: PermissionRole,
    grantedById: string,
  ): Promise<Permission> {
    // Check if permission already exists
    const existing = await this.getDirectPermission(userId, resourceId, resourceType);
    
    if (existing) {
      existing.role = role;
      return this.permissionRepository.save(existing);
    }

    const permission = this.permissionRepository.create({
      folderId: resourceType === 'folder' ? resourceId : undefined,
      fileId: resourceType === 'file' ? resourceId : undefined,
      userId,
      role,
      grantedById,
    });

    const saved = await this.permissionRepository.save(permission);

    // If folder, propagate to children (async, fire and forget)
    if (resourceType === 'folder') {
      this.propagateToChildren(resourceId, userId, role, saved.id);
    }

    return saved;
  }

  /**
   * Revoke permission from user
   */
  async revokePermission(
    resourceId: string,
    resourceType: 'file' | 'folder',
    userId: string,
  ): Promise<void> {
    const permission = await this.getDirectPermission(userId, resourceId, resourceType);
    if (permission) {
      // Also delete inherited permissions
      await this.permissionRepository.delete({ inheritedFrom: permission.id });
      await this.permissionRepository.delete({ id: permission.id });
    }
  }

  /**
   * List permissions for a resource
   */
  async listPermissions(resourceId: string, resourceType: 'file' | 'folder'): Promise<Permission[]> {
    return this.permissionRepository.find({
      where: resourceType === 'folder'
        ? { folderId: resourceId }
        : { fileId: resourceId },
      relations: ['user'],
    });
  }

  /**
   * List files and folders shared with a user
   */
  async listSharedWithMe(userId: string): Promise<{ files: File[]; folders: Folder[] }> {
    // Get all permissions for this user
    const permissions = await this.permissionRepository.find({
      where: { userId },
      relations: ['file', 'folder'],
    });

    const files: File[] = [];
    const folders: Folder[] = [];

    for (const perm of permissions) {
      if (perm.file && !perm.file.isTrashed) {
        files.push(perm.file);
      }
      if (perm.folder && !perm.folder.isTrashed && !perm.inheritedFrom) {
        // Only show top-level shared folders (not inherited ones)
        folders.push(perm.folder);
      }
    }

    return { files, folders };
  }

  /**
   * Search users by NIP or name for sharing
   */
  async searchUsers(query: string): Promise<{ id: string; nip: string; name: string; email: string }[]> {
    if (!query || query.length < 2) return [];

    const users = await this.userRepository.find({
      where: [
        { nip: ILike(`%${query}%`) },
        { name: ILike(`%${query}%`) },
        { email: ILike(`%${query}%`) },
      ],
      take: 10,
    });

    return users.map(u => ({
      id: u.id,
      nip: u.nip,
      name: u.name,
      email: u.email,
    }));
  }

  private async getDirectPermission(
    userId: string,
    resourceId: string,
    resourceType: 'file' | 'folder',
  ): Promise<Permission | null> {
    return this.permissionRepository.findOne({
      where: resourceType === 'folder'
        ? { userId, folderId: resourceId }
        : { userId, fileId: resourceId },
    });
  }

  private hasRole(userRole: PermissionRole, requiredRole: PermissionRole): boolean {
    return this.roleHierarchy[userRole] >= this.roleHierarchy[requiredRole];
  }

  private async propagateToChildren(
    folderId: string,
    userId: string,
    role: PermissionRole,
    inheritedFrom: string,
  ) {
    // Get child folders
    const children = await this.folderRepository.find({ where: { parentId: folderId } });
    
    for (const child of children) {
      const existing = await this.getDirectPermission(userId, child.id, 'folder');
      if (!existing) {
        await this.permissionRepository.save({
          folderId: child.id,
          userId,
          role,
          inheritedFrom,
        });
        // Recurse
        await this.propagateToChildren(child.id, userId, role, inheritedFrom);
      }
    }

    // Get files in folder
    const files = await this.fileRepository.find({ where: { folderId } });
    for (const file of files) {
      const existing = await this.getDirectPermission(userId, file.id, 'file');
      if (!existing) {
        await this.permissionRepository.save({
          fileId: file.id,
          userId,
          role,
          inheritedFrom,
        });
      }
    }
  }
}

