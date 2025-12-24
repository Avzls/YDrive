import { IsUUID, IsArray } from 'class-validator';

export class AddTagsToFileDto {
  @IsArray()
  @IsUUID('4', { each: true })
  tagIds: string[];
}

export class RemoveTagsFromFileDto {
  @IsArray()
  @IsUUID('4', { each: true })
  tagIds: string[];
}
