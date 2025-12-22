import { IsNotEmpty, IsString, IsNumber, IsOptional, IsUUID, Min, ValidateIf } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type, Transform } from 'class-transformer';

export class InitUploadDto {
  @ApiProperty({ description: 'File name', example: 'document.pdf' })
  @IsNotEmpty()
  @IsString()
  name: string;

  @ApiProperty({ description: 'File size in bytes', example: 1048576 })
  @Type(() => Number)
  @IsNotEmpty()
  @IsNumber()
  @Min(0)
  sizeBytes: number;

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


export class InitUploadResponseDto {
  @ApiProperty()
  fileId: string;

  @ApiProperty()
  uploadUrl: string;

  @ApiProperty()
  expiresAt: Date;
}
