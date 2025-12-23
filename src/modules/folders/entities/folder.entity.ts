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
import { File } from '@modules/files/entities/file.entity';

@Entity('folders')
export class Folder {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  name: string;

  @Column({ name: 'parent_id', nullable: true })
  parentId?: string;

  @ManyToOne(() => Folder, (folder) => folder.children, { nullable: true, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'parent_id' })
  parent?: Folder;

  @OneToMany(() => Folder, (folder) => folder.parent)
  children: Folder[];

  @Column({ name: 'owner_id' })
  ownerId: string;

  @ManyToOne(() => User, (user) => user.folders, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'owner_id' })
  owner: User;

  @Column()
  path: string;

  @Column({ default: 0 })
  depth: number;

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

  // Relations
  @OneToMany(() => File, (file) => file.folder)
  files: File[];
}
