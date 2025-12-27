import { IsOptional, IsUUID, ValidateIf } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class CopyFileDto {
  @ApiPropertyOptional({
    description: 'Target folder ID to copy file to (null for root)',
    example: '123e4567-e89b-12d3-a456-426614174000',
    nullable: true,
  })
  @IsOptional()
  @ValidateIf((o) => o.folderId !== null)
  @IsUUID()
  folderId?: string | null;
}
