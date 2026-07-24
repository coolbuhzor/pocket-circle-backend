import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  AuthUser,
  CurrentUser,
} from '../common/decorators/current-user.decorator';
import { GroupAdminGuard } from '../common/guards/group-admin.guard';
import { GroupMemberGuard } from '../common/guards/group-member.guard';
import { CreateGroupDto } from './dto/create-group.dto';
import { UpdateGroupDto } from './dto/update-group.dto';
import { GroupsService } from './groups.service';

@ApiTags('Groups')
@ApiBearerAuth('access-token')
@Controller('groups')
export class GroupsController {
  constructor(private readonly groupsService: GroupsService) {}

  @Get()
  @ApiOperation({ summary: 'List groups for the current user' })
  findAll(@CurrentUser() user: AuthUser) {
    return this.groupsService.findAllForUser(user.id);
  }

  @Post()
  @ApiOperation({ summary: 'Create a group' })
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateGroupDto) {
    return this.groupsService.create(user.id, dto);
  }

  @Get(':id')
  @UseGuards(GroupMemberGuard)
  @ApiOperation({ summary: 'Get a group by id' })
  findOne(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.groupsService.findOne(id, user.id);
  }

  @Patch(':id')
  @UseGuards(GroupAdminGuard)
  @ApiOperation({ summary: 'Update a group (admin)' })
  update(@Param('id') id: string, @Body() dto: UpdateGroupDto) {
    return this.groupsService.update(id, dto);
  }

  @Delete(':id')
  @UseGuards(GroupAdminGuard)
  @ApiOperation({ summary: 'Delete a group (admin)' })
  remove(@Param('id') id: string) {
    return this.groupsService.remove(id);
  }
}
