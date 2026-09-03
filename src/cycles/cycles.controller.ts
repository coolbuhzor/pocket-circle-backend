import { Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  AuthUser,
  CurrentUser,
} from '../common/decorators/current-user.decorator';
import {
  ResolveCycleFrom,
  ResolveGroupFrom,
} from '../common/decorators/group-id-param.decorator';
import { CollectorOrAdminGuard } from '../common/guards/collector-or-admin.guard';
import { GroupMemberGuard } from '../common/guards/group-member.guard';
import { CyclesService } from './cycles.service';

@ApiTags('Cycles')
@ApiBearerAuth('access-token')
@Controller()
export class CyclesController {
  constructor(private readonly cyclesService: CyclesService) {}

  @Get('groups/:id/cycles')
  @UseGuards(GroupMemberGuard)
  @ApiOperation({ summary: 'List cycle history for a group' })
  findHistory(@Param('id') groupId: string) {
    return this.cyclesService.findHistory(groupId);
  }

  @Get('groups/:id/cycles/active')
  @UseGuards(GroupMemberGuard)
  @ApiOperation({ summary: 'Get the active cycle for a group' })
  findActive(@Param('id') groupId: string) {
    return this.cyclesService.findActive(groupId);
  }

  @Post('groups/:id/cycles/close')
  @UseGuards(CollectorOrAdminGuard)
  @ResolveCycleFrom('activeByGroup')
  @ApiOperation({ summary: 'Close the active cycle (collector or admin)' })
  close(@Param('id') groupId: string, @CurrentUser() user: AuthUser) {
    return this.cyclesService.close(groupId, user.id);
  }

  @Get('cycles/:id/summary')
  @UseGuards(GroupMemberGuard)
  @ResolveGroupFrom('cycle')
  @ApiOperation({ summary: 'Get a cycle summary' })
  summary(@Param('id') cycleId: string) {
    return this.cyclesService.summary(cycleId);
  }
}
