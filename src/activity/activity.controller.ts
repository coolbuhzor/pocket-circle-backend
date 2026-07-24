import { Controller, Get, Param, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { GroupMemberGuard } from '../common/guards/group-member.guard';
import { ActivityService } from './activity.service';

@ApiTags('Activity')
@ApiBearerAuth('access-token')
@Controller('groups/:id/activity')
@UseGuards(GroupMemberGuard)
export class ActivityController {
  constructor(private readonly activityService: ActivityService) {}

  @Get()
  @ApiOperation({ summary: 'List activity events for a group' })
  list(@Param('id') groupId: string) {
    return this.activityService.findByGroup(groupId);
  }
}
