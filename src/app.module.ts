import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { ScheduleModule } from '@nestjs/schedule';
import { ActivityModule } from './activity/activity.module';
import { AdminModule } from './admin/admin.module';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { AuthModule } from './auth/auth.module';
import { BanksModule } from './banks/banks.module';
import { JwtAuthGuard } from './common/guards/jwt-auth.guard';
import { ContributionsModule } from './contributions/contributions.module';
import { CyclesModule } from './cycles/cycles.module';
import { EmailModule } from './email/email.module';
import { GroupsModule } from './groups/groups.module';
import { InvitesModule } from './invites/invites.module';
import { MembersModule } from './members/members.module';
import { NotificationsModule } from './notifications/notifications.module';
import { PrismaModule } from './prisma/prisma.module';
import { RemindersModule } from './reminders/reminders.module';
import { StorageModule } from './storage/storage.module';
import { UsersModule } from './users/users.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    ScheduleModule.forRoot(),
    PrismaModule,
    EmailModule,
    StorageModule,
    AuthModule,
    BanksModule,
    UsersModule,
    GroupsModule,
    MembersModule,
    CyclesModule,
    ContributionsModule,
    RemindersModule,
    InvitesModule,
    ActivityModule,
    NotificationsModule,
    AdminModule,
  ],
  controllers: [AppController],
  providers: [
    AppService,
    {
      provide: APP_GUARD,
      useClass: JwtAuthGuard,
    },
  ],
})
export class AppModule {}
