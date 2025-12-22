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

export enum PermissionRole {
  OWNER = 'owner',
  EDITOR = 'editor',
  VIEWER = 'viewer',
}

@Entity('permissions')
export class Permission {
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

  @Column({ name: 'user_id' })
  userId: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user: User;

  @Column({ type: 'enum', enum: PermissionRole })
  role: PermissionRole;

  @Column({ name: 'inherited_from', nullable: true })
  inheritedFrom?: string;

  @ManyToOne(() => Permission, { nullable: true, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'inherited_from' })
  inheritedFromPermission?: Permission;

  @Column({ name: 'granted_by', nullable: true })
  grantedById?: string;

  @ManyToOne(() => User, { nullable: true })
  @JoinColumn({ name: 'granted_by' })
  grantedBy?: User;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
