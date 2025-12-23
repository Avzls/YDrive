import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { FoldersController } from './folders.controller';
import { FoldersService } from './folders.service';
import { Folder } from './entities/folder.entity';
import { File } from '@modules/files/entities/file.entity';
import { StorageModule } from '@modules/storage/storage.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Folder, File]),
    StorageModule,
  ],
  controllers: [FoldersController],
  providers: [FoldersService],
  exports: [FoldersService],
})
export class FoldersModule {}
