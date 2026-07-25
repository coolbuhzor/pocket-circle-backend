import { Injectable } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InviteStatus } from '../../generated/prisma/enums';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class InvitesSchedulerService {
  constructor(private readonly prisma: PrismaService) {}

  @Cron(CronExpression.EVERY_HOUR)
  async expireStaleInvites() {
    await this.prisma.invite.updateMany({
      where: {
        status: InviteStatus.active,
        expiresAt: { lt: new Date() },
      },
      data: { status: InviteStatus.expired },
    });
  }
}
