import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
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

  async findRecent(limit = 100): Promise<AuditLog[]> {
    return this.auditLogRepository.find({
      order: { createdAt: 'DESC' },
      take: limit,
      relations: ['user'],
    });
  }
}
