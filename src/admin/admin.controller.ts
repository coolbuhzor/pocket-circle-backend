import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { SuperAdminGuard } from '../common/guards/super-admin.guard';
import { AdminService } from './admin.service';
import { AdminListQueryDto } from './dto/admin-list-query.dto';

@ApiTags('Admin')
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard, SuperAdminGuard)
@Controller('admin')
export class AdminController {
  constructor(private readonly adminService: AdminService) {}

  @Get('users')
  @ApiOperation({ summary: 'List all users (super admin)' })
  listUsers(@Query() query: AdminListQueryDto) {
    return this.adminService.listUsers(query);
  }

  @Get('users/:id')
  @ApiOperation({ summary: 'Get user detail (super admin)' })
  getUser(@Param('id') id: string) {
    return this.adminService.getUser(id);
  }

  @Get('groups')
  @ApiOperation({ summary: 'List all groups (super admin)' })
  listGroups(@Query() query: AdminListQueryDto) {
    return this.adminService.listGroups(query);
  }

  @Get('groups/:id')
  @ApiOperation({ summary: 'Get group detail (super admin)' })
  getGroup(@Param('id') id: string) {
    return this.adminService.getGroup(id);
  }

  @Get('stats/overview')
  @ApiOperation({ summary: 'Platform overview stats (super admin)' })
  statsOverview() {
    return this.adminService.statsOverview();
  }

  @Get('stats/growth')
  @ApiOperation({ summary: 'Signup and group growth stats (super admin)' })
  statsGrowth() {
    return this.adminService.statsGrowth();
  }

  @Get('stats/financial')
  @ApiOperation({ summary: 'Confirmed volume by group and frequency (super admin)' })
  statsFinancial() {
    return this.adminService.statsFinancial();
  }

  @Get('stats/engagement')
  @ApiOperation({ summary: 'Engagement and health metrics (super admin)' })
  statsEngagement() {
    return this.adminService.statsEngagement();
  }
}
