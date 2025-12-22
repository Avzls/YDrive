import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { User } from '@modules/users/entities/user.entity';
import { File } from './file.entity';

@Entity('file_versions')
export class FileVersion {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'file_id' })
  fileId: string;

  @ManyToOne(() => File, (file) => file.versions, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'file_id' })
  file: File;

  @Column({ name: 'version_number' })
  versionNumber: number;

  @Column({ name: 'storage_key' })
  storageKey: string;

  @Column({ name: 'size_bytes', type: 'bigint' })
  sizeBytes: number;

  @Column({ name: 'checksum_sha256', nullable: true })
  checksumSha256?: string;

  @Column({ name: 'thumbnail_key', nullable: true })
  thumbnailKey?: string;

  @Column({ name: 'preview_key', nullable: true })
  previewKey?: string;

  @Column({ name: 'uploaded_by' })
  uploadedById: string;

  @ManyToOne(() => User)
  @JoinColumn({ name: 'uploaded_by' })
  uploadedBy: User;

  @Column({ nullable: true })
  comment?: string;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
