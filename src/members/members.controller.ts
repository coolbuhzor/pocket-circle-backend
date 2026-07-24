import {
  Body,
  Controller,
  Delete,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  AuthUser,
  CurrentUser,
} from '../common/decorators/current-user.decorator';
import { GroupAdminGuard } from '../common/guards/group-admin.guard';
import { ReorderMembersDto } from './dto/reorder-members.dto';
import { MembersService } from './members.service';

@ApiTags('Members')
@ApiBearerAuth('access-token')
@Controller('groups/:id/members')
@UseGuards(GroupAdminGuard)
export class MembersController {
  constructor(private readonly membersService: MembersService) {}

  @Post('reorder')
  @ApiOperation({ summary: 'Reorder payout turn order (admin)' })
  reorder(@Param('id') groupId: string, @Body() dto: ReorderMembersDto) {
    return this.membersService.reorder(groupId, dto.userIds);
  }

  @Post(':userId/make-admin')
  @ApiOperation({ summary: 'Promote a member to admin' })
  makeAdmin(
    @Param('id') groupId: string,
    @Param('userId') userId: string,
  ) {
    return this.membersService.makeAdmin(groupId, userId);
  }

  @Delete(':userId')
  @ApiOperation({ summary: 'Remove a member from the group (admin)' })
  remove(
    @Param('id') groupId: string,
    @Param('userId') userId: string,
    @CurrentUser() user: AuthUser,
  ) {
    return this.membersService.remove(groupId, userId, user.id);
  }
}
