import type { Request } from 'express';
import type { Role } from '../../../generated/prisma/enums';
import type { AuthUser } from '../decorators/current-user.decorator';

export type AuthedMembership = {
  groupId: string;
  userId: string;
  role: Role;
  payoutOrder: number;
};

export type AuthedCycle = {
  id: string;
  groupId: string;
  collectorUserId: string;
};

export type AuthedRequest = Request & {
  user?: AuthUser;
  groupId?: string;
  membership?: AuthedMembership;
  cycle?: AuthedCycle;
  contribution?: unknown;
};

export function toAuthedMembership(value: unknown): AuthedMembership | null {
  if (typeof value !== 'object' || value === null) {
    return null;
  }
  const record = value as Record<string, unknown>;
  if (
    typeof record.groupId !== 'string' ||
    typeof record.userId !== 'string' ||
    typeof record.role !== 'string' ||
    typeof record.payoutOrder !== 'number'
  ) {
    return null;
  }
  return {
    groupId: record.groupId,
    userId: record.userId,
    role: record.role as AuthedMembership['role'],
    payoutOrder: record.payoutOrder,
  };
}

export function toAuthedCycle(value: unknown): AuthedCycle | null {
  if (typeof value !== 'object' || value === null) {
    return null;
  }
  const record = value as Record<string, unknown>;
  if (
    typeof record.id !== 'string' ||
    typeof record.groupId !== 'string' ||
    typeof record.collectorUserId !== 'string'
  ) {
    return null;
  }
  return {
    id: record.id,
    groupId: record.groupId,
    collectorUserId: record.collectorUserId,
  };
}

export function routeParam(
  request: AuthedRequest,
  name: string,
): string | undefined {
  const value = request.params[name];
  return typeof value === 'string' ? value : undefined;
}
