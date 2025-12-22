import { IsNotEmpty, IsString, IsOptional, IsUUID, ValidateIf } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';

export class DirectUploadDto {
  @ApiProperty({ description: 'File name', example: 'document.pdf' })
  @IsNotEmpty()
  @IsString()
  name: string;

  @ApiProperty({ description: 'MIME type', example: 'application/pdf' })
  @IsNotEmpty()
  @IsString()
  mimeType: string;

  @ApiPropertyOptional({ description: 'Folder ID (null = root)', example: 'uuid' })
  @IsOptional()
  @Transform(({ value }) => value === '' || value === null ? undefined : value)
  @ValidateIf((o) => o.folderId !== undefined && o.folderId !== null && o.folderId !== '')
  @IsUUID()
  folderId?: string;
}
