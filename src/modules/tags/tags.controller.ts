import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  UseGuards,
  Request,
} from '@nestjs/common';
import { JwtAuthGuard } from '@common/guards/jwt-auth.guard';
import { TagsService } from './tags.service';
import { CreateTagDto } from './dto/create-tag.dto';
import { UpdateTagDto } from './dto/update-tag.dto';

@Controller('tags')
@UseGuards(JwtAuthGuard)
export class TagsController {
  constructor(private readonly tagsService: TagsService) {}

  // Create a new tag
  @Post()
  async create(@Body() dto: CreateTagDto, @Request() req: any) {
    return this.tagsService.create(dto, req.user.id);
  }

  // List all tags for current user
  @Get()
  async findAll(@Request() req: any) {
    return this.tagsService.findAll(req.user.id);
  }

  // Get tag by ID
  @Get(':id')
  async findOne(@Param('id') id: string, @Request() req: any) {
    return this.tagsService.findById(id, req.user.id);
  }

  // Update tag
  @Patch(':id')
  async update(
    @Param('id') id: string,
    @Body() dto: UpdateTagDto,
    @Request() req: any,
  ) {
    return this.tagsService.update(id, dto, req.user.id);
  }

  // Delete tag
  @Delete(':id')
  async remove(@Param('id') id: string, @Request() req: any) {
    await this.tagsService.remove(id, req.user.id);
    return { message: 'Tag deleted' };
  }

  // Get files with this tag
  @Get(':id/files')
  async getFilesByTag(@Param('id') id: string, @Request() req: any) {
    return this.tagsService.getFilesByTag(id, req.user.id);
  }
}
