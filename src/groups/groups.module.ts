import { Module } from '@nestjs/common';
import { InvitesModule } from '../invites/invites.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { GroupsController } from './groups.controller';
import { GroupsService } from './groups.service';

@Module({
  imports: [InvitesModule, NotificationsModule],
  controllers: [GroupsController],
  providers: [GroupsService],
  exports: [GroupsService],
})
export class GroupsModule {}
