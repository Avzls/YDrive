import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AdminController } from './admin.controller';
import { AdminService } from './admin.service';
import { User } from '@modules/users/entities/user.entity';
import { File } from '@modules/files/entities/file.entity';
import { Folder } from '@modules/folders/entities/folder.entity';

@Module({
  imports: [TypeOrmModule.forFeature([User, File, Folder])],
  controllers: [AdminController],
  providers: [AdminService],
})
export class AdminModule {}
