import { Controller, Get, Query, UseGuards, ForbiddenException } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { AuditService } from './audit.service';
import { CurrentUser } from '@common/decorators/current-user.decorator';
import { JwtAuthGuard } from '@common/guards/jwt-auth.guard';
import { User } from '@modules/users/entities/user.entity';

@ApiTags('Audit')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('audit')
export class AuditController {
  constructor(private readonly auditService: AuditService) {}

  /**
   * GET /audit/my-activity
   * Get current user's activity log
   */
  @Get('my-activity')
  @ApiOperation({ summary: 'Get current user activity log' })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  async getMyActivity(
    @CurrentUser() user: User,
    @Query('limit') limit?: number,
  ) {
    return this.auditService.findByUser(user.id, limit || 50);
  }

  /**
   * GET /audit/all
   * Get all activity logs (admin only) with optional filters
   */
  @Get('all')
  @ApiOperation({ summary: 'Get all activity logs (admin only)' })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiQuery({ name: 'userId', required: false, type: String })
  @ApiQuery({ name: 'action', required: false, type: String })
  @ApiQuery({ name: 'startDate', required: false, type: String })
  @ApiQuery({ name: 'endDate', required: false, type: String })
  async getAllActivity(
    @CurrentUser() user: User,
    @Query('limit') limit?: number,
    @Query('userId') userId?: string,
    @Query('action') action?: string,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
  ) {
    // Admin only
    if (!user.isAdmin) {
      throw new ForbiddenException('Only admins can view all activity logs');
    }
    
    // Parse endDate to end of day (23:59:59.999)
    let parsedEndDate: Date | undefined;
    if (endDate) {
      parsedEndDate = new Date(endDate);
      parsedEndDate.setHours(23, 59, 59, 999);
    }
    
    return this.auditService.findAll({
      limit: limit || 100,
      userId,
      action,
      startDate: startDate ? new Date(startDate) : undefined,
      endDate: parsedEndDate,
    });
  }

  /**
   * GET /audit/recent
   * Get recent activity (admin only)
   */
  @Get('recent')
  @ApiOperation({ summary: 'Get recent activity logs (admin only)' })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  async getRecentActivity(
    @CurrentUser() user: User,
    @Query('limit') limit?: number,
  ) {
    // Admin only
    if (!user.isAdmin) {
      throw new ForbiddenException('Only admins can view all activity logs');
    }
    return this.auditService.findRecent(limit || 50);
  }

  /**
   * GET /audit/resource
   * Get activity for a specific resource
   */
  @Get('resource')
  @ApiOperation({ summary: 'Get activity for specific resource' })
  @ApiQuery({ name: 'type', required: true, type: String })
  @ApiQuery({ name: 'id', required: true, type: String })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  async getResourceActivity(
    @Query('type') resourceType: string,
    @Query('id') resourceId: string,
    @Query('limit') limit?: number,
  ) {
    return this.auditService.findByResource(resourceType, resourceId, limit || 50);
  }
}
