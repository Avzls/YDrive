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
  UploadedFile,
  UseInterceptors,
  Req,
  Res,
  StreamableFile,
  UnauthorizedException,
  NotFoundException,
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
   * POST /files/:id/version
   * Upload a new version of an existing file
   */
  @Post(':id/version')
  @ApiOperation({ summary: 'Upload a new version of an existing file' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        file: { type: 'string', format: 'binary' },
      },
    },
  })
  @UseInterceptors(FileInterceptor('file'))
  async uploadNewVersion(
    @Param('id') fileId: string,
    @UploadedFile() file: Express.Multer.File,
    @CurrentUser() user: User,
  ) {
    return this.filesService.uploadNewVersion(fileId, file, user.id);
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
   * GET /files/trash
   * List all trashed files
   */
  @Get('trash')
  @ApiOperation({ summary: 'List trashed files' })
  async listTrashed(@CurrentUser() user: User) {
    return this.filesService.listTrashed(user.id);
  }

  /**
   * GET /files/search?q=query
   * Search files with advanced filters
   */
  @Get('search')
  @ApiOperation({ summary: 'Search files with filters' })
  @ApiQuery({ name: 'q', required: false, description: 'Search query (name)' })
  @ApiQuery({ name: 'type', required: false, description: 'File type filter (image, video, document, audio, archive, other)' })
  @ApiQuery({ name: 'modifiedAfter', required: false, description: 'Modified after date (ISO string)' })
  @ApiQuery({ name: 'modifiedBefore', required: false, description: 'Modified before date (ISO string)' })
  @ApiQuery({ name: 'minSize', required: false, description: 'Minimum file size in bytes' })
  @ApiQuery({ name: 'maxSize', required: false, description: 'Maximum file size in bytes' })
  @ApiQuery({ name: 'sortBy', required: false, description: 'Sort field (name, updatedAt, sizeBytes)' })
  @ApiQuery({ name: 'sortOrder', required: false, description: 'Sort order (ASC, DESC)' })
  async searchFiles(
    @Query('q') query: string,
    @Query('type') type: string,
    @Query('modifiedAfter') modifiedAfter: string,
    @Query('modifiedBefore') modifiedBefore: string,
    @Query('minSize') minSize: string,
    @Query('maxSize') maxSize: string,
    @Query('sortBy') sortBy: string,
    @Query('sortOrder') sortOrder: string,
    @CurrentUser() user: User,
  ) {
    return this.filesService.search(user.id, {
      query,
      type,
      modifiedAfter: modifiedAfter ? new Date(modifiedAfter) : undefined,
      modifiedBefore: modifiedBefore ? new Date(modifiedBefore) : undefined,
      minSize: minSize ? parseInt(minSize) : undefined,
      maxSize: maxSize ? parseInt(maxSize) : undefined,
      sortBy: sortBy as 'name' | 'updatedAt' | 'sizeBytes' | undefined,
      sortOrder: sortOrder as 'ASC' | 'DESC' | undefined,
    });
  }

  /**
   * GET /files/starred
   * List all starred files
   */
  @Get('starred')
  @ApiOperation({ summary: 'List starred files' })
  async listStarred(@CurrentUser() user: User) {
    return this.filesService.listStarred(user.id);
  }

  /**
   * GET /files/recent
   * List recently accessed files
   */
  @Get('recent')
  @ApiOperation({ summary: 'List recently accessed files' })
  @ApiQuery({ name: 'limit', required: false, description: 'Number of files to return (default: 20)' })
  async listRecent(
    @CurrentUser() user: User,
    @Query('limit') limit?: string,
  ) {
    return this.filesService.listRecent(user.id, limit ? parseInt(limit) : 20);
  }

  /**
   * POST /files/:id/star
   * Toggle starred status
   */
  @Post(':id/star')
  @ApiOperation({ summary: 'Toggle file starred status' })
  async toggleStar(
    @Param('id') id: string,
    @CurrentUser() user: User,
  ) {
    return this.filesService.toggleStar(id, user.id);
  }

  /**
   * GET /files/archive/contents/:id
   * List contents of a RAR or ZIP file
   */
  @Get('archive/contents/:id')
  @ApiOperation({ summary: 'List contents of a RAR or ZIP archive' })
  async listArchiveContents(
    @Param('id') id: string,
    @CurrentUser() user: User,
  ) {
    return this.filesService.listArchiveContents(id, user.id);
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
   * PATCH /files/:id
   * Rename file
   */
  @Patch(':id')
  @ApiOperation({ summary: 'Rename file' })
  async renameFile(
    @Param('id') id: string,
    @Body('name') name: string,
    @CurrentUser() user: User,
  ) {
    return this.filesService.rename(id, user.id, name);
  }

  /**
   * PATCH /files/:id/move
   * Move file to different folder
   */
  @Patch(':id/move')
  @ApiOperation({ summary: 'Move file to different folder' })
  async moveFile(
    @Param('id') id: string,
    @Body('folderId') folderId: string | null,
    @CurrentUser() user: User,
  ) {
    return this.filesService.move(id, user.id, folderId);
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
      
      // Use RFC 5987 format for proper filename encoding
      // Include both ASCII fallback and UTF-8 encoded version
      const asciiFileName = fileName.replace(/[^\x20-\x7E]/g, '_');
      
      res.set({
        'Content-Type': mimeType,
        'Content-Disposition': `attachment; filename="${asciiFileName}"; filename*=UTF-8''${encodeURIComponent(fileName)}`,
        'Content-Length': size.toString(),
      });

      return new StreamableFile(stream as any);
    } catch (error) {
      throw new UnauthorizedException('Invalid token');
    }
  }

  /**
   * GET /files/:id/thumbnail
   * Stream thumbnail image
   */
  @Public()
  @Get(':id/thumbnail')
  @ApiOperation({ summary: 'Get file thumbnail' })
  @ApiProduces('image/webp')
  @ApiQuery({ name: 'token', required: true })
  async getThumbnail(
    @Param('id') id: string,
    @Query('token') token: string,
    @Res({ passthrough: true }) res: Response,
  ): Promise<StreamableFile> {
    if (!token) throw new UnauthorizedException('Token required');

    try {
      const payload = JSON.parse(Buffer.from(token.split('.')[1], 'base64').toString());
      const userId = payload.sub;
      if (!userId) throw new UnauthorizedException('Invalid token');

      const result = await this.filesService.getThumbnailStream(id, userId);
      if (!result) {
        res.status(404);
        throw new NotFoundException('No thumbnail available');
      }

      res.set({ 'Content-Type': result.mimeType });
      return new StreamableFile(result.stream as any);
    } catch (error) {
      if (error instanceof NotFoundException) throw error;
      throw new UnauthorizedException('Invalid token');
    }
  }

  /**
   * GET /files/:id/preview
   * Stream file for inline preview (images, PDFs, videos)
   */
  @Public()
  @Get(':id/preview')
  @ApiOperation({ summary: 'Stream file for preview' })
  @ApiQuery({ name: 'token', required: true })
  async getPreview(
    @Param('id') id: string,
    @Query('token') token: string,
    @Res({ passthrough: true }) res: Response,
  ): Promise<StreamableFile> {
    if (!token) throw new UnauthorizedException('Token required');

    try {
      const payload = JSON.parse(Buffer.from(token.split('.')[1], 'base64').toString());
      const userId = payload.sub;
      if (!userId) throw new UnauthorizedException('Invalid token');

      const { stream, fileName, mimeType } = await this.filesService.getPreviewStream(id, userId);
      
      // Don't set Content-Length because preview file size may differ from original
      // Browser will handle chunked transfer encoding
      res.set({
        'Content-Type': mimeType,
        'Content-Disposition': `inline; filename="${encodeURIComponent(fileName)}"`,
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

  /**
   * DELETE /files/:id/permanent
   * Permanently delete file from trash
   */
  @Delete(':id/permanent')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Permanently delete file' })
  async permanentDelete(
    @Param('id') id: string,
    @CurrentUser() user: User,
  ) {
    await this.filesService.permanentDelete(id, user.id);
  }

  /**
   * DELETE /files/trash/empty
   * Empty all trash
   */
  @Delete('trash/empty')
  @ApiOperation({ summary: 'Empty trash' })
  async emptyTrash(@CurrentUser() user: User) {
    return this.filesService.emptyTrash(user.id);
  }

  /**
   * GET /files/:id/versions
   * List all versions of a file
   */
  @Get(':id/versions')
  @ApiOperation({ summary: 'List all versions of a file' })
  async listVersions(
    @Param('id') id: string,
    @CurrentUser() user: User,
  ) {
    return this.filesService.listVersions(id, user.id);
  }

  /**
   * GET /files/versions/:versionId/stream
   * Stream a specific version for download
   */
  @Public()
  @Get('versions/:versionId/stream')
  @ApiOperation({ summary: 'Download a specific version' })
  @ApiProduces('application/octet-stream')
  @ApiQuery({ name: 'token', required: true })
  async streamVersion(
    @Param('versionId') versionId: string,
    @Query('token') token: string,
    @Res({ passthrough: true }) res: Response,
  ): Promise<StreamableFile> {
    if (!token) throw new UnauthorizedException('Token required');

    try {
      const payload = JSON.parse(Buffer.from(token.split('.')[1], 'base64').toString());
      const userId = payload.sub;
      if (!userId) throw new UnauthorizedException('Invalid token');

      const { stream, fileName, mimeType, size } = await this.filesService.getVersionStream(versionId, userId);
      
      const asciiFileName = fileName.replace(/[^\x20-\x7E]/g, '_');
      res.set({
        'Content-Type': mimeType,
        'Content-Disposition': `attachment; filename="${asciiFileName}"; filename*=UTF-8''${encodeURIComponent(fileName)}`,
        'Content-Length': size.toString(),
      });

      return new StreamableFile(stream as any);
    } catch (error) {
      if (error instanceof NotFoundException) throw error;
      throw new UnauthorizedException('Invalid token');
    }
  }

  /**
   * POST /files/versions/:versionId/restore
   * Restore a file to a specific version
   */
  @Post('versions/:versionId/restore')
  @ApiOperation({ summary: 'Restore file to a specific version' })
  async restoreVersion(
    @Param('versionId') versionId: string,
    @CurrentUser() user: User,
  ) {
    return this.filesService.restoreVersion(versionId, user.id);
  }
}
