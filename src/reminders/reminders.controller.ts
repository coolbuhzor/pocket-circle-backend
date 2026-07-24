import { Body, Controller, Param, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  AuthUser,
  CurrentUser,
} from '../common/decorators/current-user.decorator';
import { CycleCollectorGuard } from '../common/guards/cycle-collector.guard';
import { SendReminderDto } from './dto/send-reminder.dto';
import { RemindersService } from './reminders.service';

@ApiTags('Reminders')
@ApiBearerAuth('access-token')
@Controller('cycles/:id/reminders')
@UseGuards(CycleCollectorGuard)
export class RemindersController {
  constructor(private readonly remindersService: RemindersService) {}

  @Post()
  @ApiOperation({ summary: 'Send a payment reminder (collector)' })
  send(
    @Param('id') cycleId: string,
    @CurrentUser() user: AuthUser,
    @Body() dto: SendReminderDto,
  ) {
    return this.remindersService.send(cycleId, user.id, dto.toUserId);
  }
}
