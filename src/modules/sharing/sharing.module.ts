import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SharingService } from './sharing.service';
import { SharingController } from './sharing.controller';
import { ShareLink } from './entities/share-link.entity';
import { File } from '@modules/files/entities/file.entity';
import { StorageModule } from '@modules/storage/storage.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([ShareLink, File]),
    StorageModule,
  ],
  controllers: [SharingController],
  providers: [SharingService],
  exports: [SharingService],
})
export class SharingModule {}

