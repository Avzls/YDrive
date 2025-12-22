import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { User } from '@modules/users/entities/user.entity';

export enum AuditAction {
  FILE_UPLOAD = 'file.upload',
  FILE_DOWNLOAD = 'file.download',
  FILE_VIEW = 'file.view',
  FILE_DELETE = 'file.delete',
  FILE_RESTORE = 'file.restore',
  FILE_RENAME = 'file.rename',
  FILE_MOVE = 'file.move',
  FILE_SHARE = 'file.share',
  FILE_UNSHARE = 'file.unshare',
  FILE_VERSION_CREATE = 'file.version.create',
  FOLDER_CREATE = 'folder.create',
  FOLDER_DELETE = 'folder.delete',
  FOLDER_RESTORE = 'folder.restore',
  FOLDER_RENAME = 'folder.rename',
  FOLDER_MOVE = 'folder.move',
  FOLDER_SHARE = 'folder.share',
  FOLDER_UNSHARE = 'folder.unshare',
  PERMISSION_GRANT = 'permission.grant',
  PERMISSION_REVOKE = 'permission.revoke',
  USER_LOGIN = 'user.login',
  USER_LOGOUT = 'user.logout',
  USER_CREATE = 'user.create',
}

@Entity('audit_logs')
export class AuditLog {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'user_id', nullable: true })
  userId?: string;

  @ManyToOne(() => User, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'user_id' })
  user?: User;

  @Column({ name: 'ip_address', nullable: true })
  ipAddress?: string;

  @Column({ name: 'user_agent', nullable: true })
  userAgent?: string;

  @Column({ type: 'enum', enum: AuditAction })
  action: AuditAction;

  @Column({ name: 'resource_type' })
  resourceType: string;

  @Column({ name: 'resource_id' })
  resourceId: string;

  @Column({ name: 'resource_name', nullable: true })
  resourceName?: string;

  @Column({ type: 'jsonb', nullable: true })
  details?: Record<string, any>;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
