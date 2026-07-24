import { SetMetadata } from '@nestjs/common';

export const GROUP_ID_PARAM_KEY = 'groupIdParam';
export const GroupIdParam = (paramName = 'id') =>
  SetMetadata(GROUP_ID_PARAM_KEY, paramName);

export type ResolveGroupFrom = 'param' | 'cycle' | 'contribution';
export const RESOLVE_GROUP_FROM_KEY = 'resolveGroupFrom';
export const ResolveGroupFrom = (from: ResolveGroupFrom) =>
  SetMetadata(RESOLVE_GROUP_FROM_KEY, from);

export type ResolveCycleFrom = 'param' | 'contribution' | 'activeByGroup';
export const RESOLVE_CYCLE_FROM_KEY = 'resolveCycleFrom';
export const ResolveCycleFrom = (from: ResolveCycleFrom) =>
  SetMetadata(RESOLVE_CYCLE_FROM_KEY, from);

export const CYCLE_ID_PARAM_KEY = 'cycleIdParam';
export const CycleIdParam = (paramName = 'id') =>
  SetMetadata(CYCLE_ID_PARAM_KEY, paramName);
