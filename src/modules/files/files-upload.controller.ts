import { Controller, Post, UploadedFile, UseInterceptors, Body, Req } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiTags, ApiConsumes, ApiBody, ApiBearerAuth } from '@nestjs/swagger';
// import { JwtAuthGuard } from '@modules/auth/guards/jwt-auth.guard';
import { FilesService } from './files.service';
import { DirectUploadDto } from './dto/direct-upload.dto';

@ApiTags('files')
@Controller('files')
// @UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class FilesDirectUploadController {
  constructor(private readonly filesService: FilesService) {}

  @Post('upload')
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        file: {
          type: 'string',
          format: 'binary',
        },
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
    @Req() req: any,
  ) {
    // Temporarily hardcoded for testing - TODO: add back auth
    const userId = 'admin-user-id-placeholder';
    return this.filesService.directUpload(file, dto, userId);
  }
}
