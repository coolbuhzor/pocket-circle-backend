import { Module } from '@nestjs/common';
import { ActivityModule } from '../activity/activity.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { InvitesController } from './invites.controller';
import { InvitesService } from './invites.service';

@Module({
  imports: [ActivityModule, NotificationsModule],
  controllers: [InvitesController],
  providers: [InvitesService],
  exports: [InvitesService],
})
export class InvitesModule {}
