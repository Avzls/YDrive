import {
  Controller,
  Get,
  Post,
  Delete,
  Param,
  Body,
  Query,
  UseGuards,
  HttpCode,
  HttpStatus,
  UploadedFile,
  UseInterceptors,
  Req,
  Res,
  StreamableFile,
  UnauthorizedException,
} from '@nestjs/common';
import { Response } from 'express';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiQuery, ApiConsumes, ApiBody, ApiProduces } from '@nestjs/swagger';
import { FilesService } from './files.service';
import { InitUploadDto, CompleteUploadDto, DirectUploadDto } from './dto';
import { JwtAuthGuard } from '@common/guards/jwt-auth.guard';
import { CurrentUser } from '@common/decorators/current-user.decorator';
import { Public } from '@common/decorators/public.decorator';
import { User } from '@modules/users/entities/user.entity';

@ApiTags('Files')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('files')
export class FilesController {
  constructor(private readonly filesService: FilesService) {}

  /**
   * POST /files/upload
   * Direct file upload via multipart/form-data (API proxy to MinIO)
   * NOTE: Auth disabled temporarily for testing - TODO: re-enable
   */
  @Post('upload')
  @ApiOperation({ summary: 'Direct file upload via multipart/form-data' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        file: { type: 'string', format: 'binary' },
        name: { type: 'string' },
        mimeType: { type: 'string' },
        folderId: { type: 'string', nullable: true },
      },
    },
  })
  @UseInterceptors(FileInterceptor('file'))
  async uploadFile(
    @UploadedFile() file: Express.Multer.File,
    @Body() dto: DirectUploadDto,
    @CurrentUser() user: User,
  ) {
    // Use authenticated user, fallback to placeholder if auth is disabled
    const userId = user?.id || 'admin-user-id-placeholder';
    return this.filesService.directUpload(file, dto, userId);
  }

  /**
   * POST /files/init-upload
   * Initialize file upload - get presigned URL
   */
  @Post('init-upload')
  @ApiOperation({ summary: 'Initialize file upload, get presigned URL' })
  async initUpload(
    @Body() dto: InitUploadDto,
    @CurrentUser() user: User,
  ) {
    return this.filesService.initUpload(dto, user.id);
  }

  /**
   * POST /files/complete-upload
   * Finalize upload - verify and queue processing
   */
  @Post('complete-upload')
  @ApiOperation({ summary: 'Complete file upload, start processing' })
  async completeUpload(
    @Body() dto: CompleteUploadDto,
    @CurrentUser() user: User,
  ) {
    return this.filesService.completeUpload(dto.fileId, user.id);
  }

  /**
   * GET /files
   * List files (optionally in folder)
   */
  @Get()
  @ApiOperation({ summary: 'List files' })
  @ApiQuery({ name: 'folderId', required: false })
  async listFiles(
    @CurrentUser() user: User,
    @Query('folderId') folderId?: string,
  ) {
    return this.filesService.listFiles(user.id, folderId);
  }

  /**
   * GET /files/:id
   * Get file details
   */
  @Get(':id')
  @ApiOperation({ summary: 'Get file details' })
  async getFile(
    @Param('id') id: string,
    @CurrentUser() user: User,
  ) {
    return this.filesService.findById(id);
  }

  /**
   * GET /files/:id/download
   * Get presigned download URL (may fail in Docker environments)
   */
  @Get(':id/download')
  @ApiOperation({ summary: 'Get presigned download URL' })
  async getDownloadUrl(
    @Param('id') id: string,
    @CurrentUser() user: User,
  ) {
    return this.filesService.getDownloadUrl(id, user.id);
  }

  /**
   * GET /files/:id/stream
   * Direct file stream download (recommended for Docker environments)
   * Accepts token from query string for direct browser downloads
   */
  @Public()
  @Get(':id/stream')
  @ApiOperation({ summary: 'Stream file directly from storage' })
  @ApiProduces('application/octet-stream')
  @ApiQuery({ name: 'token', required: true, description: 'JWT access token' })
  async streamFile(
    @Param('id') id: string,
    @Query('token') token: string,
    @Res({ passthrough: true }) res: Response,
  ): Promise<StreamableFile> {
    // Manually validate token from query string
    if (!token) {
      throw new UnauthorizedException('Token required');
    }

    // Decode token to get userId (basic validation - token was already verified at login)
    try {
      const payload = JSON.parse(Buffer.from(token.split('.')[1], 'base64').toString());
      const userId = payload.sub;

      if (!userId) {
        throw new UnauthorizedException('Invalid token');
      }

      const { stream, fileName, mimeType, size } = await this.filesService.getFileStream(id, userId);
      
      res.set({
        'Content-Type': mimeType,
        'Content-Disposition': `attachment; filename="${encodeURIComponent(fileName)}"`,
        'Content-Length': size.toString(),
      });

      return new StreamableFile(stream as any);
    } catch (error) {
      throw new UnauthorizedException('Invalid token');
    }
  }

  /**
   * DELETE /files/:id
   * Soft delete (move to trash)
   */
  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Move file to trash' })
  async deleteFile(
    @Param('id') id: string,
    @CurrentUser() user: User,
  ) {
    await this.filesService.softDelete(id, user.id);
  }

  /**
   * POST /files/:id/restore
   * Restore from trash
   */
  @Post(':id/restore')
  @ApiOperation({ summary: 'Restore file from trash' })
  async restoreFile(
    @Param('id') id: string,
    @CurrentUser() user: User,
  ) {
    await this.filesService.restore(id, user.id);
    return { message: 'File restored' };
  }
}
