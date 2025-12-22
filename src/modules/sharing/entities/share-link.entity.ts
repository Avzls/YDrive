import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { User } from '@modules/users/entities/user.entity';
import { Folder } from '@modules/folders/entities/folder.entity';
import { File } from '@modules/files/entities/file.entity';
import { PermissionRole } from '@modules/permissions/entities/permission.entity';

@Entity('share_links')
export class ShareLink {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'folder_id', nullable: true })
  folderId?: string;

  @ManyToOne(() => Folder, { nullable: true, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'folder_id' })
  folder?: Folder;

  @Column({ name: 'file_id', nullable: true })
  fileId?: string;

  @ManyToOne(() => File, { nullable: true, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'file_id' })
  file?: File;

  @Column({ unique: true })
  token: string;

  @Column({ name: 'password_hash', nullable: true })
  passwordHash?: string;

  @Column({ name: 'allow_download', default: true })
  allowDownload: boolean;

  @Column({ type: 'enum', enum: PermissionRole, default: PermissionRole.VIEWER })
  role: PermissionRole;

  @Column({ name: 'expires_at', nullable: true })
  expiresAt?: Date;

  @Column({ name: 'max_access_count', nullable: true })
  maxAccessCount?: number;

  @Column({ name: 'access_count', default: 0 })
  accessCount: number;

  @Column({ name: 'created_by' })
  createdById: string;

  @ManyToOne(() => User)
  @JoinColumn({ name: 'created_by' })
  createdBy: User;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
