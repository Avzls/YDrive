import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SharingService } from './sharing.service';
import { ShareLink } from './entities/share-link.entity';
import { File } from '@modules/files/entities/file.entity';

@Module({
  imports: [TypeOrmModule.forFeature([ShareLink, File])],
  providers: [SharingService],
  exports: [SharingService],
})
export class SharingModule {}
