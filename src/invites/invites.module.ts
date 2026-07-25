import { Module } from '@nestjs/common';
import { ActivityModule } from '../activity/activity.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { InvitesController } from './invites.controller';
import { InvitesSchedulerService } from './invites.scheduler';
import { InvitesService } from './invites.service';

@Module({
  imports: [ActivityModule, NotificationsModule],
  controllers: [InvitesController],
  providers: [InvitesService, InvitesSchedulerService],
  exports: [InvitesService],
})
export class InvitesModule {}
