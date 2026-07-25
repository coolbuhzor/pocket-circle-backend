import { InviteStatus } from '../../generated/prisma/enums';
import { PrismaService } from '../prisma/prisma.service';
import { InvitesSchedulerService } from './invites.scheduler';

describe('InvitesSchedulerService', () => {
  it('expires active invites past expiresAt', async () => {
    const updateMany = jest.fn().mockResolvedValue({ count: 2 });
    const prisma = {
      invite: { updateMany },
    } as unknown as PrismaService;

    const scheduler = new InvitesSchedulerService(prisma);
    await scheduler.expireStaleInvites();

    expect(updateMany).toHaveBeenCalledWith({
      where: {
        status: InviteStatus.active,
        expiresAt: { lt: expect.any(Date) },
      },
      data: { status: InviteStatus.expired },
    });
  });
});
