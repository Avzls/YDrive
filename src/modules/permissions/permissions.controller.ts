import {
  Controller,
  Get,
  Post,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  Request,
  HttpCode,
  HttpStatus,
  BadRequestException,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { IsOptional, IsString, IsEnum } from 'class-validator';
import { JwtAuthGuard } from '@common/guards/jwt-auth.guard';
import { PermissionsService } from './permissions.service';
import { PermissionRole } from './entities/permission.entity';

export class ShareDto {
  @IsOptional()
  @IsString()
  fileId?: string;

  @IsOptional()
  @IsString()
  folderId?: string;

  @IsString()
  userId: string;

  @IsEnum(PermissionRole)
  role: PermissionRole;
}

@ApiTags('Permissions')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('permissions')
export class PermissionsController {
  constructor(private readonly permissionsService: PermissionsService) {}

  @Post('share')
  @ApiOperation({ summary: 'Share file/folder with a user' })
  async share(@Body() dto: ShareDto, @Request() req: any) {
    const resourceId = dto.fileId || dto.folderId;
    const resourceType = dto.fileId ? 'file' : 'folder';
    
    if (!resourceId) {
      throw new BadRequestException('Either fileId or folderId is required');
    }

    return this.permissionsService.grantPermission(
      resourceId,
      resourceType,
      dto.userId,
      dto.role,
      req.user.id,
    );
  }

  @Get('shared-with-me')
  @ApiOperation({ summary: 'List files/folders shared with current user' })
  async listSharedWithMe(@Request() req: any) {
    return this.permissionsService.listSharedWithMe(req.user.id);
  }

  @Get('users/search')
  @ApiOperation({ summary: 'Search users for sharing' })
  @ApiQuery({ name: 'q', required: true })
  async searchUsers(@Query('q') query: string) {
    return this.permissionsService.searchUsers(query);
  }

  @Get(':type/:id')
  @ApiOperation({ summary: 'List users with access to resource' })
  async listAccess(
    @Param('type') type: 'file' | 'folder',
    @Param('id') id: string,
  ) {
    return this.permissionsService.listPermissions(id, type);
  }

  @Delete(':type/:id/:userId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Revoke user access to resource' })
  async revokeAccess(
    @Param('type') type: 'file' | 'folder',
    @Param('id') id: string,
    @Param('userId') userId: string,
  ) {
    await this.permissionsService.revokePermission(id, type, userId);
  }
}

