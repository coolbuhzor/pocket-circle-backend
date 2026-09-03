import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  ActivityType,
  ContributionStatus,
  CycleStatus,
  NotificationType,
} from '../../generated/prisma/enums';
import { ActivityService } from '../activity/activity.service';
import { getFullName, withDisplayName } from '../common/helpers/user-name';
import {
  userNameSelect,
  userSummarySelect,
} from '../common/helpers/user-select';
import { CyclesService } from '../cycles/cycles.service';
import { NotificationsService } from '../notifications/notifications.service';
import { PrismaService } from '../prisma/prisma.service';
import { StorageService, UploadedFile } from '../storage/storage.service';
import { CreateContributionDto } from './dto/create-contribution.dto';

@Injectable()
export class ContributionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    private readonly activityService: ActivityService,
    private readonly notificationsService: NotificationsService,
    private readonly cyclesService: CyclesService,
  ) {}

  async findByCycle(cycleId: string) {
    const contributions = await this.prisma.contribution.findMany({
      where: { cycleId },
      include: {
        payer: {
          select: userSummarySelect,
        },
      },
      orderBy: { submittedAt: 'desc' },
    });
    return contributions.map((c) => ({
      ...c,
      payer: withDisplayName(c.payer),
    }));
  }

  async upload(
    cycleId: string,
    payerUserId: string,
    dto: CreateContributionDto,
    file?: UploadedFile,
  ) {
    const cycle = await this.prisma.cycle.findUnique({
      where: { id: cycleId },
      include: {
        group: { select: { id: true, name: true } },
        collector: { select: { id: true, ...userNameSelect } },
      },
    });
    if (!cycle || cycle.status !== CycleStatus.active) {
      throw new NotFoundException('Active cycle not found');
    }
    if (cycle.collectorUserId === payerUserId) {
      throw new BadRequestException(
        'The collector cannot upload a contribution for their own cycle',
      );
    }

    if (!file) {
      throw new BadRequestException('Receipt file is required');
    }

    const receiptUrl = await this.storage.upload(file);
    const now = new Date();

    const existing = await this.prisma.contribution.findFirst({
      where: { cycleId, payerUserId },
    });

    const contribution = existing
      ? await this.prisma.contribution.update({
          where: { id: existing.id },
          data: {
            amount: dto.amount,
            note: dto.note,
            receiptUrl,
            status: ContributionStatus.pending,
            disputeReason: null,
            submittedAt: now,
            reviewedAt: null,
            reviewedByUserId: null,
          },
        })
      : await this.prisma.contribution.create({
          data: {
            cycleId,
            payerUserId,
            amount: dto.amount,
            note: dto.note,
            receiptUrl,
            status: ContributionStatus.pending,
            submittedAt: now,
          },
        });

    const payer = await this.prisma.user.findUnique({
      where: { id: payerUserId },
      select: userNameSelect,
    });

    await this.activityService.log(
      cycle.groupId,
      ActivityType.receipt_uploaded,
      payerUserId,
      {
        cycleId,
        actorName: payer ? getFullName(payer) : undefined,
      },
    );

    await this.notificationsService.notify(
      cycle.collectorUserId,
      NotificationType.receipt_uploaded,
      {
        groupId: cycle.groupId,
        groupName: cycle.group.name,
        actorName: payer ? getFullName(payer) : undefined,
        href: `/groups/${cycle.groupId}`,
      },
    );

    return contribution;
  }

  async confirm(contributionId: string, reviewerUserId: string) {
    const contribution = await this.prisma.contribution.findUnique({
      where: { id: contributionId },
      include: {
        cycle: {
          include: { group: { select: { id: true, name: true } } },
        },
        payer: { select: { id: true, ...userNameSelect } },
      },
    });
    if (!contribution) {
      throw new NotFoundException('Contribution not found');
    }

    const updated = await this.prisma.contribution.update({
      where: { id: contributionId },
      data: {
        status: ContributionStatus.confirmed,
        reviewedAt: new Date(),
        reviewedByUserId: reviewerUserId,
        disputeReason: null,
      },
    });

    const reviewer = await this.prisma.user.findUnique({
      where: { id: reviewerUserId },
      select: userNameSelect,
    });

    await this.activityService.log(
      contribution.cycle.groupId,
      ActivityType.payment_confirmed,
      reviewerUserId,
      {
        cycleId: contribution.cycleId,
        targetUserId: contribution.payerUserId,
        actorName: reviewer ? getFullName(reviewer) : undefined,
        targetName: getFullName(contribution.payer),
      },
    );

    await this.notificationsService.notify(
      contribution.payerUserId,
      NotificationType.payment_confirmed,
      {
        groupId: contribution.cycle.groupId,
        groupName: contribution.cycle.group.name,
        href: `/groups/${contribution.cycle.groupId}`,
      },
    );

    if (await this.cyclesService.isCycleFullyPaid(contribution.cycleId)) {
      await this.cyclesService.closeCycle(contribution.cycleId, reviewerUserId);
    }

    return updated;
  }

  async dispute(
    contributionId: string,
    reviewerUserId: string,
    reason: string,
  ) {
    const contribution = await this.prisma.contribution.findUnique({
      where: { id: contributionId },
      include: {
        cycle: {
          include: { group: { select: { id: true, name: true } } },
        },
        payer: { select: { id: true, ...userNameSelect } },
      },
    });
    if (!contribution) {
      throw new NotFoundException('Contribution not found');
    }

    const updated = await this.prisma.contribution.update({
      where: { id: contributionId },
      data: {
        status: ContributionStatus.disputed,
        disputeReason: reason,
        reviewedAt: new Date(),
        reviewedByUserId: reviewerUserId,
      },
    });

    const reviewer = await this.prisma.user.findUnique({
      where: { id: reviewerUserId },
      select: userNameSelect,
    });

    await this.activityService.log(
      contribution.cycle.groupId,
      ActivityType.payment_disputed,
      reviewerUserId,
      {
        cycleId: contribution.cycleId,
        targetUserId: contribution.payerUserId,
        actorName: reviewer ? getFullName(reviewer) : undefined,
        targetName: getFullName(contribution.payer),
        reason,
      },
    );

    await this.notificationsService.notify(
      contribution.payerUserId,
      NotificationType.payment_disputed,
      {
        groupId: contribution.cycle.groupId,
        groupName: contribution.cycle.group.name,
        reason,
        href: `/groups/${contribution.cycle.groupId}`,
      },
    );

    return updated;
  }
}
