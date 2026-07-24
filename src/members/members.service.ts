import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Role } from '../../generated/prisma/enums';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class MembersService {
  constructor(private readonly prisma: PrismaService) {}

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

    await this.prisma.$transaction(
      userIds.map((userId, index) =>
        this.prisma.groupMember.update({
          where: { groupId_userId: { groupId, userId } },
          data: { payoutOrder: index + 1 },
        }),
      ),
    );

    return this.prisma.groupMember.findMany({
      where: { groupId },
      include: {
        user: {
          select: { id: true, name: true, email: true },
        },
      },
      orderBy: { payoutOrder: 'asc' },
    });
  }

  async makeAdmin(groupId: string, userId: string) {
    const membership = await this.prisma.groupMember.findUnique({
      where: { groupId_userId: { groupId, userId } },
    });
    if (!membership) {
      throw new NotFoundException('Member not found');
    }

    return this.prisma.groupMember.update({
      where: { groupId_userId: { groupId, userId } },
      data: { role: Role.admin },
      include: {
        user: {
          select: { id: true, name: true, email: true },
        },
      },
    });
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
