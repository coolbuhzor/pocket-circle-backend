import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { randomUUID } from 'crypto';
import {
  ActivityType,
  InviteStatus,
  NotificationType,
  Role,
} from '../../generated/prisma/enums';
import { ActivityService } from '../activity/activity.service';
import { NotificationsService } from '../notifications/notifications.service';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class InvitesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly activityService: ActivityService,
    private readonly notificationsService: NotificationsService,
  ) {}

  async create(groupId: string, invitedByUserId: string) {
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 30);

    return this.prisma.invite.create({
      data: {
        token: randomUUID(),
        groupId,
        invitedByUserId,
        expiresAt,
        status: InviteStatus.active,
      },
    });
  }

  async view(token: string) {
    const invite = await this.prisma.invite.findUnique({
      where: { token },
      include: {
        group: {
          select: { id: true, name: true, contributionAmount: true },
        },
        invitedBy: { select: { id: true, name: true } },
      },
    });

    if (!invite) {
      throw new NotFoundException('Invite not found or is no longer valid');
    }

    if (
      invite.status !== InviteStatus.active ||
      invite.expiresAt.getTime() < Date.now()
    ) {
      throw new BadRequestException(
        'This invite has expired or is no longer active',
      );
    }

    return {
      token: invite.token,
      expiresAt: invite.expiresAt,
      group: {
        id: invite.group.id,
        name: invite.group.name,
        contributionAmount: invite.group.contributionAmount,
      },
      inviter: {
        id: invite.invitedBy.id,
        name: invite.invitedBy.name,
      },
    };
  }

  async accept(token: string, userId: string) {
    const invite = await this.prisma.invite.findUnique({
      where: { token },
      include: {
        group: { select: { id: true, name: true } },
        invitedBy: { select: { id: true, name: true } },
      },
    });

    if (!invite) {
      throw new NotFoundException('Invite not found or is no longer valid');
    }

    if (invite.status !== InviteStatus.active) {
      throw new BadRequestException('This invite is no longer active');
    }

    if (invite.expiresAt.getTime() < Date.now()) {
      await this.prisma.invite.update({
        where: { token },
        data: { status: InviteStatus.expired },
      });
      throw new BadRequestException('This invite has expired');
    }

    const existing = await this.prisma.groupMember.findUnique({
      where: {
        groupId_userId: { groupId: invite.groupId, userId },
      },
    });
    if (existing) {
      throw new ConflictException('You are already a member of this group');
    }

    const maxOrder = await this.prisma.groupMember.aggregate({
      where: { groupId: invite.groupId },
      _max: { payoutOrder: true },
    });
    const payoutOrder = (maxOrder._max.payoutOrder ?? 0) + 1;

    const membership = await this.prisma.$transaction(async (tx) => {
      const member = await tx.groupMember.create({
        data: {
          groupId: invite.groupId,
          userId,
          role: Role.member,
          payoutOrder,
        },
        include: {
          user: { select: { id: true, name: true, email: true } },
        },
      });

      await tx.invite.update({
        where: { token },
        data: { status: InviteStatus.accepted },
      });

      return member;
    });

    await this.activityService.log(
      invite.groupId,
      ActivityType.member_joined,
      userId,
      { actorName: membership.user.name },
    );

    await this.notificationsService.notify(
      invite.invitedByUserId,
      NotificationType.invite_accepted,
      {
        groupId: invite.groupId,
        groupName: invite.group.name,
        actorName: membership.user.name,
        href: `/groups/${invite.groupId}`,
      },
    );

    return membership;
  }
}
