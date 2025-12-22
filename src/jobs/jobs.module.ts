import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BullModule } from '@nestjs/bullmq';
import { FileProcessingProcessor } from './processors/file-processing.processor';
import { File } from '@modules/files/entities/file.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([File]),
    BullModule.registerQueue({
      name: 'file-processing',
    }),
  ],
  providers: [FileProcessingProcessor],
})
export class JobsModule {}
