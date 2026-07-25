/** Prisma select fragment for User name fields. */
export const userNameSelect = {
  firstName: true,
  middleName: true,
  lastName: true,
} as const;

/** Common nested User shape for list/detail responses. */
export const userSummarySelect = {
  id: true,
  ...userNameSelect,
  email: true,
} as const;

/** Nested User shape that includes bank payout fields. */
export const userBankSelect = {
  id: true,
  ...userNameSelect,
  bankName: true,
  bankCode: true,
  accountNumber: true,
  bankVerified: true,
} as const;
