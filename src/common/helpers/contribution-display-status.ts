import { ContributionStatus } from '../../../generated/prisma/enums';

export type ContributionDisplayStatus =
  | 'paid'
  | 'disputed'
  | 'pending'
  | 'overdue';

export function deriveContributionDisplayStatus(
  contribution: { status: ContributionStatus } | null | undefined,
  periodEnd: Date,
  now: Date = new Date(),
): ContributionDisplayStatus {
  if (contribution?.status === ContributionStatus.confirmed) {
    return 'paid';
  }
  if (contribution?.status === ContributionStatus.disputed) {
    return 'disputed';
  }
  if (contribution?.status === ContributionStatus.pending) {
    return 'pending';
  }
  if (now <= periodEnd) {
    return 'pending';
  }
  return 'overdue';
}
