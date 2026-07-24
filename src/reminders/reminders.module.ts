import { Module } from '@nestjs/common';
import { ActivityModule } from '../activity/activity.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { RemindersController } from './reminders.controller';
import { RemindersService } from './reminders.service';

@Module({
  imports: [ActivityModule, NotificationsModule],
  controllers: [RemindersController],
  providers: [RemindersService],
})
export class RemindersModule {}
