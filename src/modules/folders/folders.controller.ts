import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Param,
  Body,
  Query,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiQuery, ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsNotEmpty, IsString, IsOptional, IsUUID } from 'class-validator';
import { FoldersService } from './folders.service';
import { JwtAuthGuard } from '@common/guards/jwt-auth.guard';
import { CurrentUser } from '@common/decorators/current-user.decorator';
import { User } from '@modules/users/entities/user.entity';

class CreateFolderDto {
  @ApiProperty({ example: 'My Folder' })
  @IsString()
  @IsNotEmpty()
  name: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  parentId?: string;
}

class RenameFolderDto {
  @ApiProperty({ example: 'Renamed Folder' })
  @IsString()
  @IsNotEmpty()
  name: string;
}

class MoveFolderDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  parentId?: string | null;
}

@ApiTags('Folders')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('folders')
export class FoldersController {
  constructor(private readonly foldersService: FoldersService) {}

  @Post()
  @ApiOperation({ summary: 'Create a new folder' })
  async create(
    @Body() dto: CreateFolderDto,
    @CurrentUser() user: User,
  ) {
    return this.foldersService.create(dto, user.id);
  }

  @Get()
  @ApiOperation({ summary: 'List folder contents (or root if no parentId)' })
  @ApiQuery({ name: 'parentId', required: false })
  async listContents(
    @CurrentUser() user: User,
    @Query('parentId') parentId?: string,
  ) {
    return this.foldersService.listContents(parentId || null, user.id);
  }

  @Get('trash')
  @ApiOperation({ summary: 'List trashed folders' })
  async listTrashed(@CurrentUser() user: User) {
    return this.foldersService.listTrashed(user.id);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get folder details' })
  async getFolder(
    @Param('id') id: string,
    @CurrentUser() user: User,
  ) {
    return this.foldersService.findById(id, user.id);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Rename folder' })
  async rename(
    @Param('id') id: string,
    @Body() dto: RenameFolderDto,
    @CurrentUser() user: User,
  ) {
    return this.foldersService.rename(id, dto.name, user.id);
  }

  @Patch(':id/move')
  @ApiOperation({ summary: 'Move folder to another parent' })
  async move(
    @Param('id') id: string,
    @Body() dto: MoveFolderDto,
    @CurrentUser() user: User,
  ) {
    return this.foldersService.move(id, dto.parentId ?? null, user.id);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Move folder to trash' })
  async delete(
    @Param('id') id: string,
    @CurrentUser() user: User,
  ) {
    await this.foldersService.softDelete(id, user.id);
  }

  @Post(':id/restore')
  @ApiOperation({ summary: 'Restore folder from trash' })
  async restore(
    @Param('id') id: string,
    @CurrentUser() user: User,
  ) {
    await this.foldersService.restore(id, user.id);
    return { message: 'Folder restored' };
  }

  @Delete(':id/permanent')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Permanently delete folder' })
  async permanentDelete(
    @Param('id') id: string,
    @CurrentUser() user: User,
  ) {
    await this.foldersService.permanentDelete(id, user.id);
  }
}
