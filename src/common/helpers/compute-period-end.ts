import { Frequency } from '../../../generated/prisma/enums';

export function computePeriodEnd(start: Date, frequency: Frequency): Date {
  const end = new Date(start);
  switch (frequency) {
    case Frequency.weekly:
      end.setDate(end.getDate() + 7);
      break;
    case Frequency.biweekly:
      end.setDate(end.getDate() + 14);
      break;
    case Frequency.monthly:
      end.setMonth(end.getMonth() + 1);
      break;
  }
  return end;
}
