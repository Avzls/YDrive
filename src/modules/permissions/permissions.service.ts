import { Injectable, ForbiddenException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Permission, PermissionRole } from './entities/permission.entity';
import { Folder } from '@modules/folders/entities/folder.entity';
import { File } from '@modules/files/entities/file.entity';

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
