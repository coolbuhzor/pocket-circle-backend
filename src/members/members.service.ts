import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { CycleStatus, Role } from '../../generated/prisma/enums';
import { withDisplayName } from '../common/helpers/user-name';
import { userSummarySelect } from '../common/helpers/user-select';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class MembersService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Split members into pending (not yet collected this rotation round)
   * vs done (already collected this round).
   *
   * Known edge case: round boundaries are derived from
   * floor(completedCycleCount / memberCount). If membership changes
   * mid-round, the boundary is approximate until we track rounds explicitly.
   */
  async getCurrentRoundStatus(groupId: string) {
    const group = await this.prisma.group.findUnique({
      where: { id: groupId },
      include: { members: true },
    });
    if (!group) {
      throw new NotFoundException('Group not found');
    }

    const memberCount = group.members.length;
    if (memberCount === 0) {
      return { pendingUserIds: [], doneUserIds: [] };
    }

    const completedCycleCount = await this.prisma.cycle.count({
      where: { groupId, status: CycleStatus.completed },
    });

    const roundStartCycleNumber =
      Math.floor(completedCycleCount / memberCount) * memberCount + 1;

    const cyclesThisRound = await this.prisma.cycle.findMany({
      where: { groupId, cycleNumber: { gte: roundStartCycleNumber } },
    });

    const collectedThisRound = new Set(
      cyclesThisRound.map((c) => c.collectorUserId),
    );

    return {
      pendingUserIds: group.members
        .filter((m) => !collectedThisRound.has(m.userId))
        .map((m) => m.userId),
      doneUserIds: group.members
        .filter((m) => collectedThisRound.has(m.userId))
        .map((m) => m.userId),
    };
  }

  async reorder(groupId: string, userIds: string[]) {
    const members = await this.prisma.groupMember.findMany({
      where: { groupId },
    });

    if (userIds.length !== members.length) {
      throw new BadRequestException(
        'userIds must include every group member exactly once',
      );
    }

    const memberIds = new Set(members.map((m) => m.userId));
    for (const userId of userIds) {
      if (!memberIds.has(userId)) {
        throw new BadRequestException(
          `User ${userId} is not a member of this group`,
        );
      }
    }

    const unique = new Set(userIds);
    if (unique.size !== userIds.length) {
      throw new BadRequestException('userIds must be unique');
    }

    const { pendingUserIds, doneUserIds } =
      await this.getCurrentRoundStatus(groupId);

    const positions = new Map(userIds.map((id, index) => [id, index]));
    const maxPendingPosition = Math.max(
      ...pendingUserIds.map((id) => positions.get(id) ?? -1),
    );
    const minDonePosition = doneUserIds.length
      ? Math.min(...doneUserIds.map((id) => positions.get(id) ?? Infinity))
      : Infinity;

    if (maxPendingPosition > minDonePosition) {
      throw new ConflictException(
        "Can't move someone who's already collected this round ahead of someone who hasn't gone yet.",
      );
    }

    await this.prisma.$transaction(
      userIds.map((userId, index) =>
        this.prisma.groupMember.update({
          where: { groupId_userId: { groupId, userId } },
          data: { payoutOrder: index + 1 },
        }),
      ),
    );

    const updated = await this.prisma.groupMember.findMany({
      where: { groupId },
      include: {
        user: {
          select: userSummarySelect,
        },
      },
      orderBy: { payoutOrder: 'asc' },
    });

    return updated.map((member) => ({
      ...member,
      user: withDisplayName(member.user),
    }));
  }

  async makeAdmin(groupId: string, userId: string) {
    const membership = await this.prisma.groupMember.findUnique({
      where: { groupId_userId: { groupId, userId } },
    });
    if (!membership) {
      throw new NotFoundException('Member not found');
    }

    const updated = await this.prisma.groupMember.update({
      where: { groupId_userId: { groupId, userId } },
      data: { role: Role.admin },
      include: {
        user: {
          select: userSummarySelect,
        },
      },
    });

    return {
      ...updated,
      user: withDisplayName(updated.user),
    };
  }

  async remove(groupId: string, targetUserId: string, requesterId: string) {
    if (targetUserId === requesterId) {
      throw new BadRequestException(
        'You cannot remove yourself via this endpoint',
      );
    }

    const membership = await this.prisma.groupMember.findUnique({
      where: { groupId_userId: { groupId, userId: targetUserId } },
    });
    if (!membership) {
      throw new NotFoundException('Member not found');
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.groupMember.delete({
        where: { groupId_userId: { groupId, userId: targetUserId } },
      });

      const remaining = await tx.groupMember.findMany({
        where: { groupId },
        orderBy: { payoutOrder: 'asc' },
      });

      for (let i = 0; i < remaining.length; i++) {
        const member = remaining[i];
        if (member.payoutOrder !== i + 1) {
          await tx.groupMember.update({
            where: {
              groupId_userId: { groupId, userId: member.userId },
            },
            data: { payoutOrder: i + 1 },
          });
        }
      }
    });

    return { ok: true };
  }
}
