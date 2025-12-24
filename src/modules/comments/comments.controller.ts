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
import { CommentsService } from './comments.service';
import { CreateCommentDto } from './dto/create-comment.dto';
import { UpdateCommentDto } from './dto/update-comment.dto';

@Controller('files/:fileId/comments')
@UseGuards(JwtAuthGuard)
export class CommentsController {
  constructor(private readonly commentsService: CommentsService) {}

  // Get all comments for a file
  @Get()
  async findAll(@Param('fileId') fileId: string, @Request() req: any) {
    return this.commentsService.findByFile(fileId, req.user.id);
  }

  // Add a comment to a file
  @Post()
  async create(
    @Param('fileId') fileId: string,
    @Body() dto: CreateCommentDto,
    @Request() req: any,
  ) {
    return this.commentsService.create(fileId, dto, req.user.id);
  }

  // Get comment count for a file
  @Get('count')
  async getCount(@Param('fileId') fileId: string) {
    const count = await this.commentsService.getCount(fileId);
    return { count };
  }

  // Update a comment
  @Patch(':commentId')
  async update(
    @Param('commentId') commentId: string,
    @Body() dto: UpdateCommentDto,
    @Request() req: any,
  ) {
    return this.commentsService.update(commentId, dto, req.user.id);
  }

  // Delete a comment
  @Delete(':commentId')
  async remove(@Param('commentId') commentId: string, @Request() req: any) {
    await this.commentsService.remove(commentId, req.user.id);
    return { message: 'Comment deleted' };
  }
}
