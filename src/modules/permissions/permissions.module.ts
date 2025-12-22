import { Module, Global } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PermissionsService } from './permissions.service';
import { Permission } from './entities/permission.entity';
import { Folder } from '@modules/folders/entities/folder.entity';
import { File } from '@modules/files/entities/file.entity';

@Global()
@Module({
  imports: [TypeOrmModule.forFeature([Permission, Folder, File])],
  providers: [PermissionsService],
  exports: [PermissionsService],
})
export class PermissionsModule {}
