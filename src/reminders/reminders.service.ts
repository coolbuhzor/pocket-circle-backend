import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  ActivityType,
  NotificationType,
} from '../../generated/prisma/enums';
import { ActivityService } from '../activity/activity.service';
import { NotificationsService } from '../notifications/notifications.service';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class RemindersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly activityService: ActivityService,
    private readonly notificationsService: NotificationsService,
  ) {}

  async send(cycleId: string, actorUserId: string, toUserId: string) {
    const cycle = await this.prisma.cycle.findUnique({
      where: { id: cycleId },
      include: { group: { select: { id: true, name: true } } },
    });
    if (!cycle) {
      throw new NotFoundException('Cycle not found');
    }
    if (toUserId === cycle.collectorUserId) {
      throw new BadRequestException('Cannot remind the collector');
    }

    const membership = await this.prisma.groupMember.findUnique({
      where: {
        groupId_userId: { groupId: cycle.groupId, userId: toUserId },
      },
      include: { user: { select: { id: true, name: true } } },
    });
    if (!membership) {
      throw new NotFoundException('Target user is not a group member');
    }

    const actor = await this.prisma.user.findUnique({
      where: { id: actorUserId },
      select: { name: true },
    });

    const activity = await this.activityService.log(
      cycle.groupId,
      ActivityType.reminder_sent,
      actorUserId,
      {
        cycleId,
        targetUserId: toUserId,
        actorName: actor?.name,
        targetName: membership.user.name,
      },
    );

    const notification = await this.notificationsService.notify(
      toUserId,
      NotificationType.reminder,
      {
        groupId: cycle.groupId,
        groupName: cycle.group.name,
        actorName: actor?.name,
        href: `/groups/${cycle.groupId}`,
      },
    );

    return { activity, notification };
  }
}
