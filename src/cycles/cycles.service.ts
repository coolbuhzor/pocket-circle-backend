import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  ActivityType,
  CycleStatus,
  NotificationType,
} from '../../generated/prisma/enums';
import { ActivityService } from '../activity/activity.service';
import { computePeriodEnd } from '../common/helpers/compute-period-end';
import { deriveContributionDisplayStatus } from '../common/helpers/contribution-display-status';
import { getFullName, withDisplayName } from '../common/helpers/user-name';
import {
  userBankSelect,
  userNameSelect,
  userSummarySelect,
} from '../common/helpers/user-select';
import { NotificationsService } from '../notifications/notifications.service';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class CyclesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly activityService: ActivityService,
    private readonly notificationsService: NotificationsService,
  ) {}

  async findHistory(groupId: string) {
    const cycles = await this.prisma.cycle.findMany({
      where: { groupId, status: CycleStatus.completed },
      include: {
        collector: {
          select: userBankSelect,
        },
      },
      orderBy: { cycleNumber: 'desc' },
    });
    return cycles.map((cycle) => ({
      ...cycle,
      collector: withDisplayName(cycle.collector),
    }));
  }

  async findActive(groupId: string) {
    const cycle = await this.prisma.cycle.findFirst({
      where: { groupId, status: CycleStatus.active },
      include: {
        collector: {
          select: {
            ...userBankSelect,
            email: true,
          },
        },
        contributions: true,
      },
    });
    if (!cycle) {
      throw new NotFoundException('No active cycle found');
    }
    return {
      ...cycle,
      collector: withDisplayName(cycle.collector),
    };
  }

  async close(groupId: string, actorUserId: string) {
    const group = await this.prisma.group.findUnique({
      where: { id: groupId },
      include: {
        members: { orderBy: { payoutOrder: 'asc' } },
      },
    });
    if (!group) {
      throw new NotFoundException('Group not found');
    }
    if (group.members.length === 0) {
      throw new BadRequestException('Group has no members');
    }

    const activeCycle = await this.prisma.cycle.findFirst({
      where: { groupId, status: CycleStatus.active },
      include: {
        collector: { select: { id: true, ...userNameSelect } },
      },
    });
    if (!activeCycle) {
      throw new BadRequestException('No active cycle to close');
    }

    const currentIndex = group.members.findIndex(
      (m) => m.userId === activeCycle.collectorUserId,
    );
    const nextIndex =
      currentIndex === -1
        ? 0
        : (currentIndex + 1) % group.members.length;
    const nextCollector = group.members[nextIndex];
    const now = new Date();
    const periodEnd = computePeriodEnd(now, group.frequency);

    const { completedCycle, newCycle } = await this.prisma.$transaction(
      async (tx) => {
        const completed = await tx.cycle.update({
          where: { id: activeCycle.id },
          data: { status: CycleStatus.completed },
        });

        const created = await tx.cycle.create({
          data: {
            groupId,
            cycleNumber: activeCycle.cycleNumber + 1,
            collectorUserId: nextCollector.userId,
            periodStart: now,
            periodEnd,
            status: CycleStatus.active,
          },
          include: {
            collector: {
              select: userBankSelect,
            },
          },
        });

        return { completedCycle: completed, newCycle: created };
      },
    );

    const actor = await this.prisma.user.findUnique({
      where: { id: actorUserId },
      select: userNameSelect,
    });
    const nextCollectorUser = await this.prisma.user.findUnique({
      where: { id: nextCollector.userId },
      select: { id: true, ...userNameSelect },
    });

    await this.activityService.log(
      groupId,
      ActivityType.cycle_completed,
      actorUserId,
      {
        cycleId: completedCycle.id,
        cycleNumber: activeCycle.cycleNumber,
        actorName: actor ? getFullName(actor) : undefined,
      },
    );
    await this.activityService.log(
      groupId,
      ActivityType.cycle_started,
      actorUserId,
      {
        cycleId: newCycle.id,
        cycleNumber: newCycle.cycleNumber,
        actorName: actor ? getFullName(actor) : undefined,
      },
    );
    await this.activityService.log(
      groupId,
      ActivityType.turn_changed,
      actorUserId,
      {
        cycleId: newCycle.id,
        targetUserId: nextCollector.userId,
        targetName: nextCollectorUser
          ? getFullName(nextCollectorUser)
          : undefined,
        actorName: actor ? getFullName(actor) : undefined,
      },
    );

    await this.notificationsService.notify(
      nextCollector.userId,
      NotificationType.your_turn,
      {
        groupId,
        groupName: group.name,
        href: `/groups/${groupId}`,
      },
    );

    const others = group.members.filter(
      (m) => m.userId !== nextCollector.userId,
    );
    await Promise.all(
      others.map((member) =>
        this.notificationsService.notify(
          member.userId,
          NotificationType.cycle_started,
          {
            groupId,
            groupName: group.name,
            href: `/groups/${groupId}`,
          },
        ),
      ),
    );

    return {
      completedCycle,
      activeCycle: {
        ...newCycle,
        collector: withDisplayName(newCycle.collector),
      },
    };
  }

  async summary(cycleId: string) {
    const cycle = await this.prisma.cycle.findUnique({
      where: { id: cycleId },
      include: {
        group: {
          include: {
            members: {
              include: {
                user: {
                  select: {
                    ...userSummarySelect,
                    bankName: true,
                    accountNumber: true,
                  },
                },
              },
              orderBy: { payoutOrder: 'asc' },
            },
          },
        },
        contributions: true,
      },
    });
    if (!cycle) {
      throw new NotFoundException('Cycle not found');
    }

    const contributionsByPayer = new Map(
      cycle.contributions.map((c) => [c.payerUserId, c]),
    );

    const members = cycle.group.members
      .filter((m) => m.userId !== cycle.collectorUserId)
      .map((member) => {
        const contribution = contributionsByPayer.get(member.userId);
        return {
          userId: member.userId,
          name: getFullName(member.user),
          email: member.user.email,
          amount: contribution?.amount ?? cycle.group.contributionAmount,
          contribution: contribution ?? null,
          displayStatus: deriveContributionDisplayStatus(
            contribution,
            cycle.periodEnd,
          ),
        };
      });

    return {
      cycle: {
        id: cycle.id,
        groupId: cycle.groupId,
        cycleNumber: cycle.cycleNumber,
        collectorUserId: cycle.collectorUserId,
        periodStart: cycle.periodStart,
        periodEnd: cycle.periodEnd,
        status: cycle.status,
        contributionAmount: cycle.group.contributionAmount,
      },
      members,
    };
  }
}
