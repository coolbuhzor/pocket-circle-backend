import { Injectable } from '@nestjs/common';
import { ActivityType } from '../../generated/prisma/enums';
import { withDisplayName } from '../common/helpers/user-name';
import { userNameSelect } from '../common/helpers/user-select';
import { PrismaService } from '../prisma/prisma.service';

type LogOptions = {
  targetUserId?: string;
  cycleId?: string;
  actorName?: string;
  targetName?: string;
  reason?: string;
  cycleNumber?: number;
};

@Injectable()
export class ActivityService {
  constructor(private readonly prisma: PrismaService) {}

  async log(
    groupId: string,
    type: ActivityType,
    actorUserId: string,
    options: LogOptions = {},
  ) {
    const message = this.formatMessage(type, options);
    return this.prisma.activityEvent.create({
      data: {
        groupId,
        type,
        actorUserId,
        targetUserId: options.targetUserId,
        cycleId: options.cycleId,
        message,
      },
    });
  }

  async findByGroup(groupId: string) {
    const events = await this.prisma.activityEvent.findMany({
      where: { groupId },
      orderBy: { createdAt: 'desc' },
      include: {
        actor: { select: { id: true, ...userNameSelect } },
        target: { select: { id: true, ...userNameSelect } },
      },
    });

    return events.map((event) => ({
      ...event,
      actor: withDisplayName(event.actor),
      target: event.target ? withDisplayName(event.target) : null,
    }));
  }

  private formatMessage(type: ActivityType, options: LogOptions): string {
    const actor = options.actorName ?? 'Someone';
    const target = options.targetName ?? 'a member';

    switch (type) {
      case ActivityType.member_joined:
        return `${actor} joined the group`;
      case ActivityType.receipt_uploaded:
        return `${actor} uploaded a payment receipt`;
      case ActivityType.payment_confirmed:
        return `${actor} confirmed ${target}'s payment`;
      case ActivityType.payment_disputed:
        return options.reason
          ? `${actor} disputed ${target}'s payment: ${options.reason}`
          : `${actor} disputed ${target}'s payment`;
      case ActivityType.reminder_sent:
        return `${actor} sent a reminder to ${target}`;
      case ActivityType.cycle_started:
        return options.cycleNumber
          ? `Cycle ${options.cycleNumber} started`
          : 'A new cycle started';
      case ActivityType.cycle_completed:
        return options.cycleNumber
          ? `Cycle ${options.cycleNumber} completed`
          : 'Cycle completed';
      case ActivityType.turn_changed:
        return `It's now ${target}'s turn to collect`;
      default:
        return 'Activity recorded';
    }
  }
}
