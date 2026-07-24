import { Injectable, NotFoundException } from '@nestjs/common';
import { CycleStatus, Role } from '../../generated/prisma/enums';
import { computePeriodEnd } from '../common/helpers/compute-period-end';
import { deriveContributionDisplayStatus } from '../common/helpers/contribution-display-status';
import { PrismaService } from '../prisma/prisma.service';
import { CreateGroupDto } from './dto/create-group.dto';
import { UpdateGroupDto } from './dto/update-group.dto';

const groupDetailInclude = {
  members: {
    include: {
      user: {
        select: {
          id: true,
          name: true,
          email: true,
          bankName: true,
          accountNumber: true,
        },
      },
    },
    orderBy: { payoutOrder: 'asc' as const },
  },
  cycles: {
    where: { status: CycleStatus.active },
    include: {
      collector: {
        select: {
          id: true,
          name: true,
          bankName: true,
          accountNumber: true,
        },
      },
      contributions: {
        select: {
          id: true,
          payerUserId: true,
          amount: true,
          status: true,
          receiptUrl: true,
          note: true,
          disputeReason: true,
          submittedAt: true,
        },
      },
    },
    take: 1,
  },
  _count: { select: { members: true } },
} as const;

type GroupDetail = Awaited<
  ReturnType<
    PrismaService['group']['findUniqueOrThrow']
  >
> & {
  members: Array<{
    groupId: string;
    userId: string;
    role: Role;
    payoutOrder: number;
    user: {
      id: string;
      name: string;
      email: string;
      bankName: string;
      accountNumber: string;
    };
  }>;
  cycles: Array<{
    id: string;
    groupId: string;
    cycleNumber: number;
    collectorUserId: string;
    periodStart: Date;
    periodEnd: Date;
    status: CycleStatus;
    collector: {
      id: string;
      name: string;
      bankName: string;
      accountNumber: string;
    };
    contributions: Array<{
      id: string;
      payerUserId: string;
      amount: number;
      status: import('../../generated/prisma/enums').ContributionStatus;
      receiptUrl: string | null;
      note: string | null;
      disputeReason: string | null;
      submittedAt: Date | null;
    }>;
  }>;
  _count: { members: number };
};

@Injectable()
export class GroupsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(userId: string, dto: CreateGroupDto) {
    const now = new Date();
    const periodEnd = computePeriodEnd(now, dto.frequency);

    const group = await this.prisma.$transaction(async (tx) => {
      return tx.group.create({
        data: {
          name: dto.name,
          contributionAmount: dto.contributionAmount,
          frequency: dto.frequency,
          members: {
            create: {
              userId,
              role: Role.admin,
              payoutOrder: 1,
            },
          },
          cycles: {
            create: {
              cycleNumber: 1,
              collectorUserId: userId,
              periodStart: now,
              periodEnd,
              status: CycleStatus.active,
            },
          },
        },
        include: groupDetailInclude,
      });
    });

    return this.enrichGroup(group as GroupDetail, userId);
  }

  async findAllForUser(userId: string) {
    const memberships = await this.prisma.groupMember.findMany({
      where: { userId },
      select: { groupId: true },
    });
    const groupIds = memberships.map((m) => m.groupId);
    if (groupIds.length === 0) {
      return [];
    }

    const groups = await this.prisma.group.findMany({
      where: { id: { in: groupIds } },
      include: groupDetailInclude,
      orderBy: { createdAt: 'desc' },
    });

    return groups.map((group) =>
      this.enrichGroup(group as GroupDetail, userId),
    );
  }

  async findOne(groupId: string, userId: string) {
    const group = await this.prisma.group.findUnique({
      where: { id: groupId },
      include: groupDetailInclude,
    });
    if (!group) {
      throw new NotFoundException('Group not found');
    }
    return this.enrichGroup(group as GroupDetail, userId);
  }

  async update(groupId: string, dto: UpdateGroupDto) {
    const group = await this.prisma.group.update({
      where: { id: groupId },
      data: {
        ...(dto.name !== undefined && { name: dto.name }),
        ...(dto.contributionAmount !== undefined && {
          contributionAmount: dto.contributionAmount,
        }),
        ...(dto.frequency !== undefined && { frequency: dto.frequency }),
      },
      include: groupDetailInclude,
    });
    return this.enrichGroup(group as GroupDetail);
  }

  async remove(groupId: string) {
    await this.prisma.group.delete({ where: { id: groupId } });
    return { ok: true };
  }

  private enrichGroup(group: GroupDetail, currentUserId?: string) {
    const activeCycle = group.cycles[0] ?? null;
    const contributionsByPayer = new Map(
      (activeCycle?.contributions ?? []).map((c) => [c.payerUserId, c]),
    );

    const members = group.members.map((member) => {
      const contribution = contributionsByPayer.get(member.userId);
      const isCollector = activeCycle?.collectorUserId === member.userId;
      const displayStatus = isCollector
        ? null
        : activeCycle
          ? deriveContributionDisplayStatus(
              contribution,
              activeCycle.periodEnd,
            )
          : null;

      return {
        userId: member.userId,
        role: member.role,
        payoutOrder: member.payoutOrder,
        user: member.user,
        contribution: contribution ?? null,
        displayStatus,
        isCollector,
      };
    });

    const myMembership = currentUserId
      ? members.find((m) => m.userId === currentUserId)
      : undefined;

    return {
      id: group.id,
      name: group.name,
      contributionAmount: group.contributionAmount,
      frequency: group.frequency,
      createdAt: group.createdAt,
      memberCount: group._count.members,
      members,
      activeCycle,
      myContributionStatus: myMembership?.displayStatus ?? null,
      whoseTurn: activeCycle
        ? {
            userId: activeCycle.collectorUserId,
            name: activeCycle.collector.name,
            bankName: activeCycle.collector.bankName,
            accountNumber: activeCycle.collector.accountNumber,
          }
        : null,
    };
  }
}
