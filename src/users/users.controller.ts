import { Controller, Get, Query } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiQuery,
  ApiTags,
} from '@nestjs/swagger';
import { UsersService } from './users.service';

@ApiTags('Users')
@ApiBearerAuth('access-token')
@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get()
  @ApiOperation({ summary: 'Look up users by comma-separated ids' })
  @ApiQuery({
    name: 'ids',
    required: false,
    description: 'Comma-separated user UUIDs',
    example: 'uuid-1,uuid-2',
  })
  findByIds(@Query('ids') ids?: string) {
    const idList = (ids ?? '')
      .split(',')
      .map((id) => id.trim())
      .filter(Boolean);
    return this.usersService.findByIds(idList);
  }
}
