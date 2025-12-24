import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Between, Like } from 'typeorm';
import { AuditLog, AuditAction } from './entities/audit-log.entity';

export interface AuditLogEntry {
  userId?: string;
  ipAddress?: string;
  userAgent?: string;
  action: AuditAction;
  resourceType: string;
  resourceId: string;
  resourceName?: string;
  details?: Record<string, any>;
}

export interface FindAllFilters {
  limit?: number;
  userId?: string;
  action?: string;
  startDate?: Date;
  endDate?: Date;
}

@Injectable()
export class AuditService {
  constructor(
    @InjectRepository(AuditLog)
    private auditLogRepository: Repository<AuditLog>,
  ) {}

  async log(entry: AuditLogEntry): Promise<void> {
    const log = this.auditLogRepository.create(entry);
    await this.auditLogRepository.save(log);
  }

  async findByUser(userId: string, limit = 100): Promise<AuditLog[]> {
    return this.auditLogRepository.find({
      where: { userId },
      order: { createdAt: 'DESC' },
      take: limit,
    });
  }

  async findByResource(resourceType: string, resourceId: string, limit = 100): Promise<AuditLog[]> {
    return this.auditLogRepository.find({
      where: { resourceType, resourceId },
      order: { createdAt: 'DESC' },
      take: limit,
    });
  }

  async findAll(filters: FindAllFilters): Promise<AuditLog[]> {
    const queryBuilder = this.auditLogRepository.createQueryBuilder('audit')
      .leftJoinAndSelect('audit.user', 'user')
      .orderBy('audit.createdAt', 'DESC')
      .take(filters.limit || 100);

    if (filters.userId) {
      queryBuilder.andWhere('audit.userId = :userId', { userId: filters.userId });
    }

    if (filters.action) {
      queryBuilder.andWhere('audit.action = :action', { action: filters.action });
    }

    if (filters.startDate) {
      queryBuilder.andWhere('audit.createdAt >= :startDate', { startDate: filters.startDate });
    }

    if (filters.endDate) {
      queryBuilder.andWhere('audit.createdAt <= :endDate', { endDate: filters.endDate });
    }

    return queryBuilder.getMany();
  }

  async findRecent(limit = 100): Promise<AuditLog[]> {
    return this.auditLogRepository.find({
      order: { createdAt: 'DESC' },
      take: limit,
      relations: ['user'],
    });
  }
}
