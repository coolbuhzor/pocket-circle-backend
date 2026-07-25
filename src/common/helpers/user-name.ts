/** Shape accepted by display-name helpers. */
export type NameParts = {
  firstName: string;
  middleName?: string | null;
  lastName: string;
};

/**
 * Build a display name from first / middle / last.
 * Use this everywhere a User display name is needed.
 */
export function getFullName(user: NameParts): string {
  return [user.firstName, user.middleName, user.lastName]
    .map((part) => part?.trim())
    .filter((part): part is string => Boolean(part))
    .join(' ');
}

/** Attach a computed `name` field for API responses that still expose it. */
export function withDisplayName<T extends NameParts>(
  user: T,
): T & { name: string } {
  return { ...user, name: getFullName(user) };
}

function normalizeNameTokens(value: string): string[] {
  return value
    .toUpperCase()
    .trim()
    .replace(/\s+/g, ' ')
    .split(' ')
    .filter(Boolean);
}

/**
 * Loose, order-independent match between a bank-resolved account name
 * and the user's submitted first/last name. Each submitted name token
 * must appear somewhere in the resolved name.
 */
export function namesMatchLoose(
  resolvedAccountName: string,
  firstName: string,
  lastName: string,
): boolean {
  const resolvedTokens = new Set(normalizeNameTokens(resolvedAccountName));
  if (resolvedTokens.size === 0) return false;

  const required = [
    ...normalizeNameTokens(firstName),
    ...normalizeNameTokens(lastName),
  ];
  if (required.length === 0) return false;

  return required.every((token) => resolvedTokens.has(token));
}
