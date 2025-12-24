import { IsString, IsOptional, MaxLength } from 'class-validator';

export class UpdateCommentDto {
  @IsString()
  @IsOptional()
  @MaxLength(2000)
  content?: string;
}
