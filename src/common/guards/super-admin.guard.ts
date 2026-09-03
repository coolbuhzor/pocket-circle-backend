import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import type { AuthedRequest } from '../types/authed-request';

@Injectable()
export class SuperAdminGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<AuthedRequest>();
    if (req.user?.isSuperAdmin === true) {
      return true;
    }
    throw new ForbiddenException('Super admin access required');
  }
}
