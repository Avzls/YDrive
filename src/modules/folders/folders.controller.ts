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
  Res,
  StreamableFile,
  UnauthorizedException,
} from '@nestjs/common';
import { Response } from 'express';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiQuery, ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsNotEmpty, IsString, IsOptional, IsUUID } from 'class-validator';
import { FoldersService } from './folders.service';
import { JwtAuthGuard } from '@common/guards/jwt-auth.guard';
import { CurrentUser } from '@common/decorators/current-user.decorator';
import { Public } from '@common/decorators/public.decorator';
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

  @Post(':id/star')
  @ApiOperation({ summary: 'Toggle folder starred status' })
  async toggleStar(
    @Param('id') id: string,
    @CurrentUser() user: User,
  ) {
    return this.foldersService.toggleStar(id, user.id);
  }

  @Get('starred/list')
  @ApiOperation({ summary: 'List starred folders' })
  async listStarred(@CurrentUser() user: User) {
    return this.foldersService.listStarred(user.id);
  }

  @Public()
  @Get(':id/download')
  @ApiOperation({ summary: 'Download folder as ZIP' })
  async downloadZip(
    @Param('id') id: string,
    @Query('token') token: string,
    @Res({ passthrough: true }) res: Response,
  ): Promise<StreamableFile> {
    // Validate token from query string (same as file download)
    if (!token) {
      throw new UnauthorizedException('Token required');
    }

    try {
      const payload = JSON.parse(Buffer.from(token.split('.')[1], 'base64').toString());
      const userId = payload.sub;

      if (!userId) {
        throw new UnauthorizedException('Invalid token');
      }

      const { stream, folderName } = await this.foldersService.getZipStream(id, userId);

      res.set({
        'Content-Type': 'application/zip',
        'Content-Disposition': `attachment; filename="${encodeURIComponent(folderName)}.zip"`,
      });

      return new StreamableFile(stream as any);
    } catch (error) {
      throw new UnauthorizedException('Invalid token');
    }
  }
}
