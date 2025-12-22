import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, IsNull } from 'typeorm';
import { Folder } from './entities/folder.entity';
import { File } from '@modules/files/entities/file.entity';

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
      where: { id, ownerId: userId, isTrashed: false },
      relations: ['children', 'files'],
    });

    if (!folder) {
      throw new NotFoundException('Folder not found');
    }

    return folder;
  }

  async listContents(folderId: string | null, userId: string) {
    const folders = await this.folderRepository.find({
      where: {
        parentId: folderId || IsNull(),
        ownerId: userId,
        isTrashed: false,
      },
      order: { name: 'ASC' },
    });

    const files = await this.fileRepository.find({
      where: {
        folderId: folderId || IsNull(),
        ownerId: userId,
        isTrashed: false,
      },
      order: { name: 'ASC' },
    });

    return { folders, files };
  }

  async rename(id: string, newName: string, userId: string): Promise<Folder> {
    const folder = await this.findById(id, userId);
    folder.name = newName;
    return this.folderRepository.save(folder);
  }

  async move(id: string, newParentId: string | null, userId: string): Promise<Folder> {
    const folder = await this.findById(id, userId);

    // Prevent moving to self or descendant
    if (newParentId) {
      const newParent = await this.folderRepository.findOne({
        where: { id: newParentId, ownerId: userId, isTrashed: false },
      });
      if (!newParent) {
        throw new NotFoundException('Target folder not found');
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
    const folder = await this.findById(id, userId);
    
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
}
