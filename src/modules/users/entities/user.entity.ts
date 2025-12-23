import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  OneToMany,
} from 'typeorm';
import { Exclude } from 'class-transformer';
import { File } from '@modules/files/entities/file.entity';
import { Folder } from '@modules/folders/entities/folder.entity';

@Entity('users')
export class User {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ unique: true })
  email: string;

  @Column({ unique: true })
  nip: string;

  @Column({ name: 'password_hash' })
  @Exclude()
  passwordHash: string;

  @Column()
  name: string;

  @Column({ name: 'avatar_url', nullable: true })
  avatarUrl?: string;

  @Column({ name: 'storage_quota_bytes', type: 'bigint', default: 10737418240 })
  storageQuotaBytes: number;

  @Column({ name: 'storage_used_bytes', type: 'bigint', default: 0 })
  storageUsedBytes: number;

  @Column({ name: 'is_active', default: true })
  isActive: boolean;

  @Column({ name: 'is_admin', default: false })
  isAdmin: boolean;

  @Column({ name: 'last_login_at', nullable: true })
  lastLoginAt?: Date;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;

  // Relations
  @OneToMany(() => File, (file) => file.owner)
  files: File[];

  @OneToMany(() => Folder, (folder) => folder.owner)
  folders: Folder[];
}
