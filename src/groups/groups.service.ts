import { Injectable, NotFoundException } from '@nestjs/common';
import { CycleStatus, Role } from '../../generated/prisma/enums';
import { computePeriodEnd } from '../common/helpers/compute-period-end';
import { deriveContributionDisplayStatus } from '../common/helpers/contribution-display-status';
import { withDisplayName } from '../common/helpers/user-name';
import { userBankSelect } from '../common/helpers/user-select';
import { InvitesService } from '../invites/invites.service';
import { PrismaService } from '../prisma/prisma.service';
import { CreateGroupDto } from './dto/create-group.dto';
import { UpdateGroupDto } from './dto/update-group.dto';

const groupDetailInclude = {
  members: {
    include: {
      user: {
        select: {
          ...userBankSelect,
          email: true,
        },
      },
    },
    orderBy: { payoutOrder: 'asc' as const },
  },
  cycles: {
    where: { status: CycleStatus.active },
    include: {
      collector: {
        select: userBankSelect,
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
  ReturnType<PrismaService['group']['findUniqueOrThrow']>
> & {
  members: Array<{
    groupId: string;
    userId: string;
    role: Role;
    payoutOrder: number;
    user: {
      id: string;
      firstName: string;
      middleName: string | null;
      lastName: string;
      email: string;
      bankName: string;
      bankCode: string;
      accountNumber: string;
      bankVerified: boolean;
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
      firstName: string;
      middleName: string | null;
      lastName: string;
      bankName: string;
      bankCode: string;
      accountNumber: string;
      bankVerified: boolean;
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
  constructor(
    private readonly prisma: PrismaService,
    private readonly invitesService: InvitesService,
  ) {}

  async create(userId: string, dto: CreateGroupDto) {
    const now = new Date();
    const periodEnd = computePeriodEnd(now, dto.frequency);

    const creator = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: { email: true },
    });

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

    const creatorEmail = creator.email.toLowerCase().trim();
    const emails = [
      ...new Set(
        (dto.memberEmails ?? [])
          .map((email) => email.trim().toLowerCase())
          .filter(Boolean),
      ),
    ].filter((email) => email !== creatorEmail);

    const invitesSent: Array<{
      email: string;
      matchedExistingUser: boolean;
    }> = [];

    for (const email of emails) {
      const invite = await this.invitesService.create(group.id, userId, {
        email,
      });
      invitesSent.push({
        email: invite.inviteeEmail ?? email,
        matchedExistingUser: invite.matchedExistingUser,
      });
    }

    return {
      ...this.enrichGroup(group as GroupDetail, userId),
      invitesSent,
    };
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
        user: withDisplayName(member.user),
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
      activeCycle: activeCycle
        ? {
            ...activeCycle,
            collector: withDisplayName(activeCycle.collector),
          }
        : null,
      myContributionStatus: myMembership?.displayStatus ?? null,
      whoseTurn: activeCycle
        ? {
            userId: activeCycle.collectorUserId,
            ...withDisplayName(activeCycle.collector),
            bankName: activeCycle.collector.bankName,
            bankCode: activeCycle.collector.bankCode,
            accountNumber: activeCycle.collector.accountNumber,
            bankVerified: activeCycle.collector.bankVerified,
          }
        : null,
    };
  }
}
