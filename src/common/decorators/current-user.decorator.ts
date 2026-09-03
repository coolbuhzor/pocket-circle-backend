import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import type { AuthedRequest } from '../types/authed-request';

export type AuthUser = {
  id: string;
  email: string;
  isSuperAdmin: boolean;
};

export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): AuthUser => {
    const request = ctx.switchToHttp().getRequest<AuthedRequest>();
    if (!request.user) {
      throw new Error('Authenticated user missing from request');
    }
    return request.user;
  },
);
