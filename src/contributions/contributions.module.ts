import { Module } from '@nestjs/common';
import { ActivityModule } from '../activity/activity.module';
import { CyclesModule } from '../cycles/cycles.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { StorageModule } from '../storage/storage.module';
import { ContributionsController } from './contributions.controller';
import { ContributionsService } from './contributions.service';

@Module({
  imports: [StorageModule, ActivityModule, NotificationsModule, CyclesModule],
  controllers: [ContributionsController],
  providers: [ContributionsService],
})
export class ContributionsModule {}
