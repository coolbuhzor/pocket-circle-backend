import { InviteStatus } from '../../../generated/prisma/enums';
import { deriveInviteEffectiveStatus } from './invite-effective-status';

describe('deriveInviteEffectiveStatus', () => {
  const now = new Date('2026-07-25T12:00:00.000Z');

  it('returns accepted when stored status is accepted', () => {
    expect(
      deriveInviteEffectiveStatus(
        {
          status: InviteStatus.accepted,
          expiresAt: new Date('2026-06-01T00:00:00.000Z'),
        },
        now,
      ),
    ).toBe('accepted');
  });

  it('returns expired when stored status is expired', () => {
    expect(
      deriveInviteEffectiveStatus(
        {
          status: InviteStatus.expired,
          expiresAt: new Date('2026-08-01T00:00:00.000Z'),
        },
        now,
      ),
    ).toBe('expired');
  });

  it('returns expired when active but expiresAt is in the past', () => {
    expect(
      deriveInviteEffectiveStatus(
        {
          status: InviteStatus.active,
          expiresAt: new Date('2026-07-24T00:00:00.000Z'),
        },
        now,
      ),
    ).toBe('expired');
  });

  it('returns pending when active and not yet expired', () => {
    expect(
      deriveInviteEffectiveStatus(
        {
          status: InviteStatus.active,
          expiresAt: new Date('2026-08-01T00:00:00.000Z'),
        },
        now,
      ),
    ).toBe('pending');
  });
});
