import { IsNotEmpty, IsUUID } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CompleteUploadDto {
  @ApiProperty({ description: 'File ID from init-upload' })
  @IsNotEmpty()
  @IsUUID()
  fileId: string;
}

export class CompleteUploadResponseDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  name: string;

  @ApiProperty()
  status: string;

  @ApiProperty()
  mimeType: string;

  @ApiProperty()
  sizeBytes: number;
}
