import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BullModule } from '@nestjs/bullmq';
import { FilesController } from './files.controller';
import { FilesService } from './files.service';
import { File } from './entities/file.entity';
import { FileVersion } from './entities/file-version.entity';
import { User } from '@modules/users/entities/user.entity';
import { StorageModule } from '@modules/storage/storage.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([File, FileVersion, User]),
    BullModule.registerQueue({
      name: 'file-processing',
    }),
    StorageModule,
  ],
  controllers: [FilesController],
  providers: [FilesService],
  exports: [FilesService],
})
export class FilesModule {}
