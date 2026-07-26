import { InviteStatus } from '../../../generated/prisma/enums';

export type InviteEffectiveStatus =
  | 'accepted'
  | 'revoked'
  | 'expired'
  | 'pending';

export function deriveInviteEffectiveStatus(
  invite: { status: InviteStatus; expiresAt: Date },
  now: Date = new Date(),
): InviteEffectiveStatus {
  if (invite.status === InviteStatus.accepted) {
    return 'accepted';
  }
  if (invite.status === InviteStatus.revoked) {
    return 'revoked';
  }
  if (
    invite.status === InviteStatus.expired ||
    invite.expiresAt.getTime() < now.getTime()
  ) {
    return 'expired';
  }
  return 'pending';
}
