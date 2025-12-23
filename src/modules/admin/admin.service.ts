import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as bcrypt from 'bcrypt';
import { User } from '@modules/users/entities/user.entity';
import { File } from '@modules/files/entities/file.entity';
import { Folder } from '@modules/folders/entities/folder.entity';

export interface SystemStats {
  totalUsers: number;
  activeUsers: number;
  totalFiles: number;
  totalFolders: number;
  totalStorageUsed: number;
  totalStorageQuota: number;
}

export interface CreateUserDto {
  nip: string;
  email: string;
  name: string;
  password: string;
  isAdmin?: boolean;
  storageQuotaBytes?: number;
}

export interface UpdateUserDto {
  name?: string;
  email?: string;
  isActive?: boolean;
  isAdmin?: boolean;
  storageQuotaBytes?: number;
  password?: string;
}

@Injectable()
export class AdminService {
  constructor(
    @InjectRepository(User)
    private userRepository: Repository<User>,
    @InjectRepository(File)
    private fileRepository: Repository<File>,
    @InjectRepository(Folder)
    private folderRepository: Repository<Folder>,
  ) {}

  async getStats(): Promise<SystemStats> {
    const [totalUsers, activeUsers] = await Promise.all([
      this.userRepository.count(),
      this.userRepository.count({ where: { isActive: true } }),
    ]);

    const totalFiles = await this.fileRepository.count({ where: { isTrashed: false } });
    const totalFolders = await this.folderRepository.count({ where: { isTrashed: false } });

    // Calculate total storage
    const storageResult = await this.userRepository
      .createQueryBuilder('u')
      .select('SUM(u.storageUsedBytes)', 'used')
      .addSelect('SUM(u.storageQuotaBytes)', 'quota')
      .getRawOne();

    return {
      totalUsers,
      activeUsers,
      totalFiles,
      totalFolders,
      totalStorageUsed: parseInt(storageResult?.used || '0', 10),
      totalStorageQuota: parseInt(storageResult?.quota || '0', 10),
    };
  }

  async listUsers(page = 1, limit = 20, search?: string): Promise<{ users: User[]; total: number }> {
    const query = this.userRepository.createQueryBuilder('u');

    if (search) {
      query.where('u.name ILIKE :search OR u.email ILIKE :search OR u.nip ILIKE :search', {
        search: `%${search}%`,
      });
    }

    query.orderBy('u.createdAt', 'DESC');
    query.skip((page - 1) * limit).take(limit);

    const [users, total] = await query.getManyAndCount();
    return { users, total };
  }

  async getUser(id: string): Promise<User | null> {
    return this.userRepository.findOne({ where: { id } });
  }

  async createUser(dto: CreateUserDto): Promise<User> {
    const passwordHash = await bcrypt.hash(dto.password, 10);

    const user = this.userRepository.create({
      nip: dto.nip,
      email: dto.email,
      name: dto.name,
      passwordHash,
      isAdmin: dto.isAdmin || false,
      storageQuotaBytes: dto.storageQuotaBytes || 10737418240, // 10GB default
    });

    return this.userRepository.save(user);
  }

  async updateUser(id: string, dto: UpdateUserDto): Promise<User> {
    const user = await this.userRepository.findOne({ where: { id } });
    if (!user) throw new Error('User not found');

    if (dto.name !== undefined) user.name = dto.name;
    if (dto.email !== undefined) user.email = dto.email;
    if (dto.isActive !== undefined) user.isActive = dto.isActive;
    if (dto.isAdmin !== undefined) user.isAdmin = dto.isAdmin;
    if (dto.storageQuotaBytes !== undefined) user.storageQuotaBytes = dto.storageQuotaBytes;
    if (dto.password) {
      user.passwordHash = await bcrypt.hash(dto.password, 10);
    }

    return this.userRepository.save(user);
  }

  async deleteUser(id: string): Promise<void> {
    await this.userRepository.delete(id);
  }
}
