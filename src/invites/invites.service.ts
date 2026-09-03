import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
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
import { deriveInviteEffectiveStatus } from '../common/helpers/invite-effective-status';
import { getFullName, withDisplayName } from '../common/helpers/user-name';
import {
  userNameSelect,
  userSummarySelect,
} from '../common/helpers/user-select';
import { EmailService } from '../email/email.service';
import { EmailSendResult, RESEND_DEMO_NOTE } from '../email/email.types';
import { NotificationsService } from '../notifications/notifications.service';
import { PrismaService } from '../prisma/prisma.service';
import { CreateInviteDto } from './dto/create-invite.dto';

@Injectable()
export class InvitesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly activityService: ActivityService,
    private readonly notificationsService: NotificationsService,
    private readonly emailService: EmailService,
  ) {}

  async create(
    groupId: string,
    invitedByUserId: string,
    dto: CreateInviteDto = {},
  ) {
    const group = await this.prisma.group.findUnique({
      where: { id: groupId },
      select: { id: true, name: true, contributionAmount: true },
    });
    if (!group) {
      throw new NotFoundException('Group not found');
    }

    const inviter = await this.prisma.user.findUnique({
      where: { id: invitedByUserId },
      select: { id: true, ...userNameSelect },
    });
    if (!inviter) {
      throw new NotFoundException('Inviter not found');
    }

    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 30);

    const inviteeEmail = dto.email?.trim().toLowerCase() ?? null;

    const invite = await this.prisma.invite.create({
      data: {
        token: randomUUID(),
        groupId,
        invitedByUserId,
        inviteeEmail,
        expiresAt,
        status: InviteStatus.active,
      },
    });

    const matchedExistingUser = await this.notifyInviteeIfMatched({
      inviteeEmail,
      inviteToken: invite.token,
      group,
      inviterName: getFullName(inviter),
    });

    const emailSend = await this.sendInviteEmail({
      inviteeEmail,
      inviteToken: invite.token,
      expiresAt: invite.expiresAt,
      group,
      inviterName: getFullName(inviter),
    });

    return {
      token: invite.token,
      groupId: invite.groupId,
      invitedByUserId: invite.invitedByUserId,
      expiresAt: invite.expiresAt,
      status: invite.status,
      inviteeEmail: invite.inviteeEmail,
      matchedExistingUser,
      ...this.toEmailFields(emailSend),
    };
  }

  async listForGroup(groupId: string) {
    const group = await this.prisma.group.findUnique({
      where: { id: groupId },
      select: { id: true },
    });
    if (!group) {
      throw new NotFoundException('Group not found');
    }

    const invites = await this.prisma.invite.findMany({
      where: { groupId },
      include: {
        invitedBy: { select: { id: true, ...userNameSelect } },
      },
      orderBy: { expiresAt: 'desc' },
    });

    return invites.map((invite) => ({
      token: invite.token,
      inviteeEmail: invite.inviteeEmail,
      invitedByUserId: invite.invitedByUserId,
      invitedBy: withDisplayName(invite.invitedBy),
      expiresAt: invite.expiresAt,
      status: invite.status,
      effectiveStatus: deriveInviteEffectiveStatus(invite),
    }));
  }

  async revoke(groupId: string, token: string) {
    const invite = await this.prisma.invite.findUnique({
      where: { token },
    });

    if (!invite || invite.groupId !== groupId) {
      throw new NotFoundException('Invite not found');
    }

    if (invite.status === InviteStatus.accepted) {
      throw new BadRequestException(
        "This invite has already been accepted and can't be revoked",
      );
    }

    const updated = await this.prisma.invite.update({
      where: { token },
      data: { status: InviteStatus.revoked },
    });

    return {
      token: updated.token,
      inviteeEmail: updated.inviteeEmail,
      invitedByUserId: updated.invitedByUserId,
      expiresAt: updated.expiresAt,
      status: updated.status,
      effectiveStatus: deriveInviteEffectiveStatus(updated),
    };
  }

  async view(token: string) {
    const invite = await this.prisma.invite.findUnique({
      where: { token },
      include: {
        group: {
          select: { id: true, name: true, contributionAmount: true },
        },
        invitedBy: { select: { id: true, ...userNameSelect } },
      },
    });

    if (!invite) {
      throw new NotFoundException('Invite not found');
    }

    return {
      token: invite.token,
      expiresAt: invite.expiresAt,
      status: invite.status,
      group: {
        id: invite.group.id,
        name: invite.group.name,
        contributionAmount: invite.group.contributionAmount,
      },
      inviter: withDisplayName(invite.invitedBy),
    };
  }

  async resend(groupId: string, token: string) {
    const invite = await this.prisma.invite.findUnique({
      where: { token },
      include: {
        group: {
          select: { id: true, name: true, contributionAmount: true },
        },
        invitedBy: { select: { id: true, ...userNameSelect } },
      },
    });

    if (!invite || invite.groupId !== groupId) {
      throw new NotFoundException('Invite not found');
    }

    if (invite.status === InviteStatus.accepted) {
      throw new BadRequestException(
        'This invite has already been accepted — no need to resend',
      );
    }

    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 30);

    const updated = await this.prisma.invite.update({
      where: { token },
      data: {
        expiresAt,
        ...(invite.status === InviteStatus.expired
          ? { status: InviteStatus.active }
          : {}),
      },
    });

    const matchedExistingUser = await this.notifyInviteeIfMatched({
      inviteeEmail: updated.inviteeEmail,
      inviteToken: updated.token,
      group: invite.group,
      inviterName: getFullName(invite.invitedBy),
    });

    const emailSend = await this.sendInviteEmail({
      inviteeEmail: updated.inviteeEmail,
      inviteToken: updated.token,
      expiresAt: updated.expiresAt,
      group: invite.group,
      inviterName: getFullName(invite.invitedBy),
    });

    return {
      token: updated.token,
      groupId: updated.groupId,
      invitedByUserId: updated.invitedByUserId,
      expiresAt: updated.expiresAt,
      status: updated.status,
      inviteeEmail: updated.inviteeEmail,
      matchedExistingUser,
      effectiveStatus: deriveInviteEffectiveStatus(updated),
      ...this.toEmailFields(emailSend),
    };
  }

  async accept(token: string, user: { id: string; email: string }) {
    const invite = await this.prisma.invite.findUnique({
      where: { token },
      include: {
        group: { select: { id: true, name: true } },
        invitedBy: { select: { id: true, ...userNameSelect } },
      },
    });

    if (!invite) {
      throw new NotFoundException('Invite not found or is no longer valid');
    }

    if (invite.status === InviteStatus.revoked) {
      throw new BadRequestException(
        'This invite has been revoked by the group admin',
      );
    }

    if (invite.status === InviteStatus.accepted) {
      throw new BadRequestException('This invite has already been accepted');
    }

    if (invite.status === InviteStatus.expired) {
      throw new BadRequestException('This invite has expired');
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

    // Targeted invites may only be accepted by the intended email.
    // Link-only invites (inviteeEmail null) stay open to whoever has the link.
    if (
      invite.inviteeEmail &&
      invite.inviteeEmail.toLowerCase().trim() !==
        user.email.toLowerCase().trim()
    ) {
      throw new ForbiddenException(
        'This invite was sent to a different email address. Log in with that email to accept it, or ask the group admin to send you a new invite.',
      );
    }

    const existing = await this.prisma.groupMember.findUnique({
      where: {
        groupId_userId: { groupId: invite.groupId, userId: user.id },
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
          userId: user.id,
          role: Role.member,
          payoutOrder,
        },
        include: {
          user: { select: userSummarySelect },
        },
      });

      await tx.invite.update({
        where: { token },
        data: { status: InviteStatus.accepted },
      });

      return member;
    });

    const memberName = getFullName(membership.user);

    await this.activityService.log(
      invite.groupId,
      ActivityType.member_joined,
      user.id,
      { actorName: memberName },
    );

    await this.notificationsService.notify(
      invite.invitedByUserId,
      NotificationType.invite_accepted,
      {
        groupId: invite.groupId,
        groupName: invite.group.name,
        actorName: memberName,
        href: `/groups/${invite.groupId}`,
      },
    );

    return {
      ...membership,
      user: withDisplayName(membership.user),
    };
  }

  private async notifyInviteeIfMatched(params: {
    inviteeEmail: string | null;
    inviteToken: string;
    group: { id: string; name: string; contributionAmount: number };
    inviterName: string;
  }): Promise<boolean> {
    const { inviteeEmail, inviteToken, group, inviterName } = params;
    if (!inviteeEmail) {
      return false;
    }

    // Case-insensitive: normalize both sides (emails are stored lowercased).
    const matchedUser = await this.prisma.user.findFirst({
      where: {
        email: { equals: inviteeEmail, mode: 'insensitive' },
      },
      select: { id: true, email: true },
    });

    if (
      !matchedUser ||
      matchedUser.email.toLowerCase() !== inviteeEmail.toLowerCase()
    ) {
      return false;
    }

    await this.notificationsService.notify(
      matchedUser.id,
      NotificationType.group_invite,
      {
        groupId: group.id,
        groupName: group.name,
        actorName: inviterName,
        title: `You've been invited to join ${group.name}`,
        body: `${inviterName} invited you to join ${group.name}. Contribution amount: ${group.contributionAmount}.`,
        href: `/invite/${inviteToken}`,
      },
    );

    return true;
  }

  private async sendInviteEmail(params: {
    inviteeEmail: string | null;
    inviteToken: string;
    expiresAt: Date;
    group: { id: string; name: string; contributionAmount: number };
    inviterName: string;
  }): Promise<EmailSendResult | null> {
    const { inviteeEmail, inviteToken, expiresAt, group, inviterName } = params;
    if (!inviteeEmail) {
      return null;
    }

    const inviteUrl = `${this.emailService.frontendUrl()}/invite/${inviteToken}`;
    return this.emailService.send({
      to: inviteeEmail,
      subject: `You're invited to join ${group.name} on Pocket Circle`,
      body: [
        `${inviterName} invited you to join ${group.name} on Pocket Circle.`,
        '',
        `Contribution amount: ₦${group.contributionAmount.toLocaleString('en-NG')}.`,
        '',
        'Accept the invite:',
        inviteUrl,
        '',
        `This link expires on ${expiresAt.toISOString()}.`,
      ].join('\n'),
    });
  }

  private toEmailFields(sent: EmailSendResult | null) {
    if (!sent) {
      return {
        demoMode: this.emailService.isDemoMode(),
        delivered: false,
        deliveryNote: RESEND_DEMO_NOTE,
        deliveryError: null as string | null,
        email: null as {
          to: string;
          subject: string;
          body: string;
        } | null,
      };
    }

    return {
      demoMode: sent.demoMode,
      delivered: sent.delivered,
      deliveryNote: sent.deliveryNote,
      deliveryError: sent.deliveryError,
      email: sent.payload,
    };
  }
}
