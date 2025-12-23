import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  OneToMany,
  JoinColumn,
} from 'typeorm';
import { User } from '@modules/users/entities/user.entity';
import { FileVersion } from './file-version.entity';
import { Folder } from '@modules/folders/entities/folder.entity';

export enum FileStatus {
  UPLOADING = 'uploading',
  SCANNING = 'scanning',
  PROCESSING = 'processing',
  READY = 'ready',
  ERROR = 'error',
  INFECTED = 'infected',
}

export enum ScanStatus {
  PENDING = 'pending',
  CLEAN = 'clean',
  INFECTED = 'infected',
  ERROR = 'error',
}

@Entity('files')
export class File {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  name: string;

  @Column({ name: 'folder_id', nullable: true })
  folderId?: string;

  @ManyToOne(() => Folder, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'folder_id' })
  folder?: Folder;

  @Column({ name: 'owner_id' })
  ownerId: string;

  @ManyToOne(() => User, (user) => user.files, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'owner_id' })
  owner: User;

  @Column({ name: 'current_version_id', nullable: true })
  currentVersionId?: string;

  @ManyToOne(() => FileVersion, { nullable: true })
  @JoinColumn({ name: 'current_version_id' })
  currentVersion?: FileVersion;

  @Column({ name: 'mime_type' })
  mimeType: string;

  @Column({ nullable: true })
  extension?: string;

  @Column({ name: 'storage_key' })
  storageKey: string;

  @Column({ name: 'size_bytes', type: 'bigint' })
  sizeBytes: number;

  @Column({ name: 'checksum_sha256', nullable: true })
  checksumSha256?: string;

  @Column({ type: 'enum', enum: FileStatus, default: FileStatus.UPLOADING })
  status: FileStatus;

  @Column({ name: 'scan_status', type: 'enum', enum: ScanStatus, default: ScanStatus.PENDING })
  scanStatus: ScanStatus;

  @Column({ name: 'processing_error', nullable: true })
  processingError?: string;

  @Column({ name: 'thumbnail_key', nullable: true })
  thumbnailKey?: string;

  @Column({ name: 'preview_key', nullable: true })
  previewKey?: string;

  @Column({ name: 'has_preview', default: false })
  hasPreview: boolean;

  @Column({ name: 'is_trashed', default: false })
  isTrashed: boolean;

  @Column({ name: 'is_starred', default: false })
  isStarred: boolean;

  @Column({ name: 'trashed_at', nullable: true })
  trashedAt?: Date;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;

  @Column({ name: 'last_accessed_at', nullable: true })
  lastAccessedAt?: Date;

  // Relations
  @OneToMany(() => FileVersion, (version) => version.file)
  versions: FileVersion[];
}
