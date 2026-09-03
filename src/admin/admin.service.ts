import { Injectable, NotFoundException } from '@nestjs/common';
import {
  ContributionStatus,
  CycleStatus,
  InviteStatus,
} from '../../generated/prisma/enums';
import { Prisma } from '../../generated/prisma/client';
import { deriveInviteEffectiveStatus } from '../common/helpers/invite-effective-status';
import { getFullName, withDisplayName } from '../common/helpers/user-name';
import {
  userNameSelect,
  userSummarySelect,
} from '../common/helpers/user-select';
import { PrismaService } from '../prisma/prisma.service';
import { AdminListQueryDto } from './dto/admin-list-query.dto';

function pagination(query: AdminListQueryDto) {
  const page = query.page ?? 1;
  const limit = query.limit ?? 20;
  return { page, limit, skip: (page - 1) * limit };
}

@Injectable()
export class AdminService {
  constructor(private readonly prisma: PrismaService) {}

  // ─── Users ───────────────────────────────────────────────────────────────

  async listUsers(query: AdminListQueryDto) {
    const { page, limit, skip } = pagination(query);
    const where: Prisma.UserWhereInput = query.search
      ? {
          OR: [
            { firstName: { contains: query.search, mode: 'insensitive' } },
            { lastName: { contains: query.search, mode: 'insensitive' } },
            { middleName: { contains: query.search, mode: 'insensitive' } },
            { email: { contains: query.search, mode: 'insensitive' } },
          ],
        }
      : {};

    const [total, users] = await Promise.all([
      this.prisma.user.count({ where }),
      this.prisma.user.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          ...userNameSelect,
          email: true,
          createdAt: true,
          lastLoginAt: true,
          _count: { select: { memberships: true } },
        },
      }),
    ]);

    const userIds = users.map((u) => u.id);
    const contributedByUser = new Map<string, number>();
    const collectedByUser = new Map<string, number>();

    if (userIds.length > 0) {
      const [contributed, collected] = await Promise.all([
        this.prisma.contribution.groupBy({
          by: ['payerUserId'],
          where: {
            payerUserId: { in: userIds },
            status: ContributionStatus.confirmed,
          },
          _sum: { amount: true },
        }),
        this.prisma.contribution.groupBy({
          by: ['cycleId'],
          where: {
            status: ContributionStatus.confirmed,
            cycle: { collectorUserId: { in: userIds } },
          },
          _sum: { amount: true },
        }),
      ]);

      for (const row of contributed) {
        contributedByUser.set(row.payerUserId, row._sum.amount ?? 0);
      }

      if (collected.length > 0) {
        const cycles = await this.prisma.cycle.findMany({
          where: { id: { in: collected.map((c) => c.cycleId) } },
          select: { id: true, collectorUserId: true },
        });
        const collectorByCycle = new Map(
          cycles.map((c) => [c.id, c.collectorUserId] as const),
        );
        for (const row of collected) {
          const collectorId = collectorByCycle.get(row.cycleId);
          if (!collectorId) continue;
          collectedByUser.set(
            collectorId,
            (collectedByUser.get(collectorId) ?? 0) + (row._sum.amount ?? 0),
          );
        }
      }
    }

    return {
      data: users.map((user) => ({
        id: user.id,
        name: getFullName(user),
        firstName: user.firstName,
        middleName: user.middleName,
        lastName: user.lastName,
        email: user.email,
        createdAt: user.createdAt,
        lastLoginAt: user.lastLoginAt,
        groupCount: user._count.memberships,
        totalContributed: contributedByUser.get(user.id) ?? 0,
        totalCollected: collectedByUser.get(user.id) ?? 0,
      })),
      meta: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit) || 1,
      },
    };
  }

  async getUser(id: string) {
    const user = await this.prisma.user.findUnique({
      where: { id },
      select: {
        id: true,
        ...userNameSelect,
        email: true,
        bankName: true,
        bankCode: true,
        accountNumber: true,
        bankVerified: true,
        notifyEmail: true,
        notifyWhatsApp: true,
        isSuperAdmin: true,
        lastLoginAt: true,
        createdAt: true,
        memberships: {
          include: {
            group: {
              select: {
                id: true,
                name: true,
                contributionAmount: true,
                frequency: true,
              },
            },
          },
          orderBy: { payoutOrder: 'asc' },
        },
        contributions: {
          orderBy: { submittedAt: 'desc' },
          include: {
            cycle: {
              select: {
                id: true,
                cycleNumber: true,
                groupId: true,
                periodStart: true,
                periodEnd: true,
                group: { select: { id: true, name: true } },
              },
            },
          },
        },
      },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    return {
      id: user.id,
      name: getFullName(user),
      firstName: user.firstName,
      middleName: user.middleName,
      lastName: user.lastName,
      email: user.email,
      bankName: user.bankName,
      bankCode: user.bankCode,
      accountNumber: user.accountNumber,
      bankVerified: user.bankVerified,
      notifyEmail: user.notifyEmail,
      notifyWhatsApp: user.notifyWhatsApp,
      isSuperAdmin: user.isSuperAdmin,
      lastLoginAt: user.lastLoginAt,
      createdAt: user.createdAt,
      groups: user.memberships.map((m) => ({
        groupId: m.groupId,
        role: m.role,
        payoutOrder: m.payoutOrder,
        group: m.group,
      })),
      contributions: user.contributions,
    };
  }

  // ─── Groups ──────────────────────────────────────────────────────────────

  async listGroups(query: AdminListQueryDto) {
    const { page, limit, skip } = pagination(query);
    const where: Prisma.GroupWhereInput = query.search
      ? { name: { contains: query.search, mode: 'insensitive' } }
      : {};

    const [total, groups] = await Promise.all([
      this.prisma.group.count({ where }),
      this.prisma.group.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          _count: { select: { members: true } },
          cycles: {
            where: { status: CycleStatus.active },
            take: 1,
            include: {
              collector: { select: { id: true, ...userNameSelect } },
            },
          },
        },
      }),
    ]);

    const groupIds = groups.map((g) => g.id);
    const confirmedByGroup =
      groupIds.length === 0
        ? []
        : await this.prisma.contribution.groupBy({
            by: ['cycleId'],
            where: {
              status: ContributionStatus.confirmed,
              cycle: { groupId: { in: groupIds } },
            },
            _sum: { amount: true },
          });

    const totalCollectedByGroup = new Map<string, number>();
    if (confirmedByGroup.length > 0) {
      const cycleIds = confirmedByGroup.map((c) => c.cycleId);
      const cycles = await this.prisma.cycle.findMany({
        where: { id: { in: cycleIds } },
        select: { id: true, groupId: true },
      });
      const groupByCycle = new Map(cycles.map((c) => [c.id, c.groupId]));
      for (const row of confirmedByGroup) {
        const groupId = groupByCycle.get(row.cycleId);
        if (!groupId) continue;
        totalCollectedByGroup.set(
          groupId,
          (totalCollectedByGroup.get(groupId) ?? 0) + (row._sum.amount ?? 0),
        );
      }
    }

    return {
      data: groups.map((group) => {
        const activeCycle = group.cycles[0] ?? null;
        return {
          id: group.id,
          name: group.name,
          contributionAmount: group.contributionAmount,
          frequency: group.frequency,
          memberCount: group._count.members,
          currentCycleNumber: activeCycle?.cycleNumber ?? null,
          currentCollectorName: activeCycle?.collector
            ? getFullName(activeCycle.collector)
            : null,
          totalConfirmedCollected: totalCollectedByGroup.get(group.id) ?? 0,
          createdAt: group.createdAt,
        };
      }),
      meta: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit) || 1,
      },
    };
  }

  async getGroup(id: string) {
    const group = await this.prisma.group.findUnique({
      where: { id },
      include: {
        members: {
          include: {
            user: {
              select: {
                id: true,
                ...userNameSelect,
                email: true,
                bankName: true,
                bankCode: true,
                accountNumber: true,
                bankVerified: true,
                lastLoginAt: true,
                createdAt: true,
              },
            },
          },
          orderBy: { payoutOrder: 'asc' },
        },
        cycles: {
          orderBy: { cycleNumber: 'desc' },
          include: {
            collector: {
              select: userSummarySelect,
            },
            contributions: {
              include: {
                payer: {
                  select: userSummarySelect,
                },
                reviewer: {
                  select: { id: true, ...userNameSelect },
                },
              },
              orderBy: { submittedAt: 'desc' },
            },
          },
        },
        activity: {
          orderBy: { createdAt: 'desc' },
          include: {
            actor: { select: { id: true, ...userNameSelect } },
            target: { select: { id: true, ...userNameSelect } },
          },
        },
        invites: {
          orderBy: { expiresAt: 'desc' },
          include: {
            invitedBy: { select: { id: true, ...userNameSelect } },
          },
        },
      },
    });

    if (!group) {
      throw new NotFoundException('Group not found');
    }

    return {
      ...group,
      members: group.members.map((member) => ({
        ...member,
        user: withDisplayName(member.user),
      })),
      cycles: group.cycles.map((cycle) => ({
        ...cycle,
        collector: withDisplayName(cycle.collector),
        contributions: cycle.contributions.map((contribution) => ({
          ...contribution,
          payer: withDisplayName(contribution.payer),
          reviewer: contribution.reviewer
            ? withDisplayName(contribution.reviewer)
            : null,
        })),
      })),
      activity: group.activity.map((event) => ({
        ...event,
        actor: withDisplayName(event.actor),
        target: event.target ? withDisplayName(event.target) : null,
      })),
      invites: group.invites.map((invite) => ({
        ...invite,
        invitedBy: withDisplayName(invite.invitedBy),
        effectiveStatus: deriveInviteEffectiveStatus(invite),
      })),
    };
  }

  // ─── Stats ───────────────────────────────────────────────────────────────

  async statsOverview() {
    const now = new Date();

    const [
      totalUsers,
      totalGroups,
      totalActiveCycles,
      totalCompletedCycles,
      confirmedAgg,
      pendingAgg,
      disputedAgg,
      activeCycles,
    ] = await Promise.all([
      this.prisma.user.count(),
      this.prisma.group.count(),
      this.prisma.cycle.count({ where: { status: CycleStatus.active } }),
      this.prisma.cycle.count({ where: { status: CycleStatus.completed } }),
      this.prisma.contribution.aggregate({
        where: { status: ContributionStatus.confirmed },
        _sum: { amount: true },
      }),
      this.prisma.contribution.aggregate({
        where: { status: ContributionStatus.pending },
        _sum: { amount: true },
      }),
      this.prisma.contribution.aggregate({
        where: { status: ContributionStatus.disputed },
        _sum: { amount: true },
      }),
      this.prisma.cycle.findMany({
        where: { status: CycleStatus.active, periodEnd: { lt: now } },
        select: {
          id: true,
          collectorUserId: true,
          group: {
            select: {
              members: { select: { userId: true } },
            },
          },
          contributions: { select: { payerUserId: true } },
        },
      }),
    ]);

    let totalOverdueCount = 0;
    for (const cycle of activeCycles) {
      const paidOrSubmitted = new Set(
        cycle.contributions.map((c) => c.payerUserId),
      );
      for (const member of cycle.group.members) {
        if (member.userId === cycle.collectorUserId) continue;
        if (!paidOrSubmitted.has(member.userId)) {
          totalOverdueCount += 1;
        }
      }
    }

    return {
      totalUsers,
      totalGroups,
      totalActiveCycles,
      totalCompletedCycles,
      totalConfirmedVolume: confirmedAgg._sum.amount ?? 0,
      totalPendingAmount: pendingAgg._sum.amount ?? 0,
      totalDisputedAmount: disputedAgg._sum.amount ?? 0,
      totalOverdueCount,
    };
  }

  async statsGrowth() {
    const now = new Date();
    const thirtyDaysAgo = new Date(now);
    thirtyDaysAgo.setUTCHours(0, 0, 0, 0);
    thirtyDaysAgo.setUTCDate(thirtyDaysAgo.getUTCDate() - 29);

    const [recentUsers, recentGroups, allUsers, allGroups] = await Promise.all([
      this.prisma.user.findMany({
        where: { createdAt: { gte: thirtyDaysAgo } },
        select: { createdAt: true },
        orderBy: { createdAt: 'asc' },
      }),
      this.prisma.group.findMany({
        where: { createdAt: { gte: thirtyDaysAgo } },
        select: { createdAt: true },
        orderBy: { createdAt: 'asc' },
      }),
      this.prisma.user.findMany({
        select: { createdAt: true },
        orderBy: { createdAt: 'asc' },
      }),
      this.prisma.group.findMany({
        select: { createdAt: true },
        orderBy: { createdAt: 'asc' },
      }),
    ]);

    const last30DaysKeys: string[] = [];
    for (let i = 0; i < 30; i++) {
      const d = new Date(thirtyDaysAgo);
      d.setUTCDate(thirtyDaysAgo.getUTCDate() + i);
      last30DaysKeys.push(d.toISOString().slice(0, 10));
    }

    const countByDay = (dates: Date[]) => {
      const map = new Map<string, number>();
      for (const key of last30DaysKeys) map.set(key, 0);
      for (const date of dates) {
        const key = date.toISOString().slice(0, 10);
        if (map.has(key)) map.set(key, (map.get(key) ?? 0) + 1);
      }
      return last30DaysKeys.map((date) => ({
        date,
        count: map.get(date) ?? 0,
      }));
    };

    const countByMonth = (dates: Date[]) => {
      const map = new Map<string, number>();
      for (const date of dates) {
        const key = date.toISOString().slice(0, 7); // YYYY-MM
        map.set(key, (map.get(key) ?? 0) + 1);
      }
      return [...map.entries()]
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([month, count]) => ({ month, count }));
    };

    return {
      byDay: {
        users: countByDay(recentUsers.map((u) => u.createdAt)),
        groups: countByDay(recentGroups.map((g) => g.createdAt)),
      },
      byMonth: {
        users: countByMonth(allUsers.map((u) => u.createdAt)),
        groups: countByMonth(allGroups.map((g) => g.createdAt)),
      },
    };
  }

  async statsFinancial() {
    const byCycle = await this.prisma.contribution.groupBy({
      by: ['cycleId'],
      where: { status: ContributionStatus.confirmed },
      _sum: { amount: true },
    });

    if (byCycle.length === 0) {
      return {
        byGroup: [],
        byFrequency: [],
      };
    }

    const cycles = await this.prisma.cycle.findMany({
      where: { id: { in: byCycle.map((c) => c.cycleId) } },
      select: {
        id: true,
        groupId: true,
        group: { select: { id: true, name: true, frequency: true } },
      },
    });
    const cycleMeta = new Map(cycles.map((c) => [c.id, c]));

    const byGroupMap = new Map<
      string,
      { groupId: string; groupName: string; totalConfirmedVolume: number }
    >();
    const byFrequencyMap = new Map<string, number>();

    for (const row of byCycle) {
      const meta = cycleMeta.get(row.cycleId);
      if (!meta) continue;
      const amount = row._sum.amount ?? 0;

      const existing = byGroupMap.get(meta.groupId);
      if (existing) {
        existing.totalConfirmedVolume += amount;
      } else {
        byGroupMap.set(meta.groupId, {
          groupId: meta.groupId,
          groupName: meta.group.name,
          totalConfirmedVolume: amount,
        });
      }

      byFrequencyMap.set(
        meta.group.frequency,
        (byFrequencyMap.get(meta.group.frequency) ?? 0) + amount,
      );
    }

    return {
      byGroup: [...byGroupMap.values()].sort(
        (a, b) => b.totalConfirmedVolume - a.totalConfirmedVolume,
      ),
      byFrequency: [...byFrequencyMap.entries()]
        .map(([frequency, totalConfirmedVolume]) => ({
          frequency,
          totalConfirmedVolume,
        }))
        .sort((a, b) => b.totalConfirmedVolume - a.totalConfirmedVolume),
    };
  }

  async statsEngagement() {
    const [
      totalInvites,
      acceptedInvites,
      totalGroups,
      memberCountAgg,
      completedCyclesByGroup,
      totalContributions,
      disputedContributions,
      confirmedWithTiming,
    ] = await Promise.all([
      this.prisma.invite.count(),
      this.prisma.invite.count({ where: { status: InviteStatus.accepted } }),
      this.prisma.group.count(),
      this.prisma.groupMember.count(),
      this.prisma.cycle.groupBy({
        by: ['groupId'],
        where: { status: CycleStatus.completed },
        _count: { _all: true },
      }),
      this.prisma.contribution.count(),
      this.prisma.contribution.count({
        where: { status: ContributionStatus.disputed },
      }),
      this.prisma.contribution.findMany({
        where: {
          status: ContributionStatus.confirmed,
          submittedAt: { not: null },
        },
        select: {
          submittedAt: true,
          cycle: { select: { periodStart: true } },
        },
      }),
    ]);

    const inviteAcceptanceRate =
      totalInvites === 0 ? 0 : acceptedInvites / totalInvites;

    const averageGroupSize =
      totalGroups === 0 ? 0 : memberCountAgg / totalGroups;

    const averageCompletedCyclesPerGroup =
      totalGroups === 0
        ? 0
        : completedCyclesByGroup.reduce(
            (sum, row) => sum + row._count._all,
            0,
          ) / totalGroups;

    const disputeRate =
      totalContributions === 0 ? 0 : disputedContributions / totalContributions;

    let averageTimeToPaymentMs: number | null = null;
    if (confirmedWithTiming.length > 0) {
      const totalMs = confirmedWithTiming.reduce((sum, row) => {
        const submitted = row.submittedAt!.getTime();
        const start = row.cycle.periodStart.getTime();
        return sum + (submitted - start);
      }, 0);
      averageTimeToPaymentMs = totalMs / confirmedWithTiming.length;
    }

    return {
      inviteAcceptanceRate,
      averageGroupSize,
      averageCompletedCyclesPerGroup,
      disputeRate,
      averageTimeToPaymentMs,
      averageTimeToPaymentHours:
        averageTimeToPaymentMs === null
          ? null
          : averageTimeToPaymentMs / (1000 * 60 * 60),
    };
  }
}
