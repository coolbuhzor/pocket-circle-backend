import { Injectable, NotFoundException } from '@nestjs/common';
import { NotificationType } from '../../generated/prisma/enums';
import { PrismaService } from '../prisma/prisma.service';

type NotifyOptions = {
  groupId?: string;
  title?: string;
  body?: string;
  href?: string;
  reason?: string;
  actorName?: string;
  groupName?: string;
};

@Injectable()
export class NotificationsService {
  constructor(private readonly prisma: PrismaService) {}

  async notify(
    userId: string,
    type: NotificationType,
    options: NotifyOptions = {},
  ) {
    const { title, body } = this.format(type, options);
    return this.prisma.notification.create({
      data: {
        userId,
        groupId: options.groupId,
        type,
        title: options.title ?? title,
        body: options.body ?? body,
        href: options.href,
      },
    });
  }

  findForUser(userId: string) {
    return this.prisma.notification.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
    });
  }

  async unreadCount(userId: string) {
    const count = await this.prisma.notification.count({
      where: { userId, read: false },
    });
    return { count };
  }

  async markRead(userId: string, id: string) {
    const notification = await this.prisma.notification.findFirst({
      where: { id, userId },
    });
    if (!notification) {
      throw new NotFoundException('Notification not found');
    }
    return this.prisma.notification.update({
      where: { id },
      data: { read: true },
    });
  }

  async markAllRead(userId: string) {
    await this.prisma.notification.updateMany({
      where: { userId, read: false },
      data: { read: true },
    });
    return { ok: true };
  }

  private format(
    type: NotificationType,
    options: NotifyOptions,
  ): { title: string; body: string } {
    const actor = options.actorName ?? 'Someone';
    const group = options.groupName ?? 'your group';

    switch (type) {
      case NotificationType.your_turn:
        return {
          title: "It's your turn",
          body: `You're the collector for ${group}. Share your bank details and confirm payments.`,
        };
      case NotificationType.receipt_uploaded:
        return {
          title: 'Receipt uploaded',
          body: `${actor} uploaded a payment receipt in ${group}.`,
        };
      case NotificationType.payment_confirmed:
        return {
          title: 'Payment confirmed',
          body: `Your payment in ${group} was confirmed.`,
        };
      case NotificationType.payment_disputed:
        return {
          title: 'Payment disputed',
          body: options.reason
            ? `Your payment in ${group} was flagged: ${options.reason}`
            : `Your payment in ${group} was flagged.`,
        };
      case NotificationType.reminder:
        return {
          title: 'Payment reminder',
          body: `${actor} sent you a reminder to contribute in ${group}.`,
        };
      case NotificationType.invite_accepted:
        return {
          title: 'Invite accepted',
          body: `${actor} accepted your invite to ${group}.`,
        };
      case NotificationType.cycle_started:
        return {
          title: 'New cycle started',
          body: `A new cycle has started in ${group}.`,
        };
      default:
        return { title: 'Notification', body: 'You have a new notification.' };
    }
  }
}
