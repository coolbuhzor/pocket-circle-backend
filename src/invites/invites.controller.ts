import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  AuthUser,
  CurrentUser,
} from '../common/decorators/current-user.decorator';
import { Public } from '../common/decorators/public.decorator';
import { GroupAdminGuard } from '../common/guards/group-admin.guard';
import { CreateInviteDto } from './dto/create-invite.dto';
import { InvitesService } from './invites.service';

@ApiTags('Invites')
@Controller()
export class InvitesController {
  constructor(private readonly invitesService: InvitesService) {}

  @Post('groups/:id/invites')
  @UseGuards(GroupAdminGuard)
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'Create an invite link (admin)' })
  create(
    @Param('id') groupId: string,
    @CurrentUser() user: AuthUser,
    @Body() dto: CreateInviteDto,
  ) {
    return this.invitesService.create(groupId, user.id, dto);
  }

  @Get('groups/:id/invites')
  @UseGuards(GroupAdminGuard)
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'List invites for a group (admin)' })
  listForGroup(@Param('id') groupId: string) {
    return this.invitesService.listForGroup(groupId);
  }

  @Post('groups/:id/invites/:token/revoke')
  @UseGuards(GroupAdminGuard)
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'Revoke an invite (admin)' })
  revoke(@Param('id') groupId: string, @Param('token') token: string) {
    return this.invitesService.revoke(groupId, token);
  }

  @Public()
  @Get('invites/:token')
  @ApiOperation({ summary: 'View invite details (public)' })
  view(@Param('token') token: string) {
    return this.invitesService.view(token);
  }

  @Post('invites/:token/accept')
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'Accept an invite' })
  accept(@Param('token') token: string, @CurrentUser() user: AuthUser) {
    return this.invitesService.accept(token, user);
  }
}
