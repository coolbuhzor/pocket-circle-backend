import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Role } from '../../../generated/prisma/enums';
import { GroupMemberGuard } from './group-member.guard';
import type { AuthedRequest } from '../types/authed-request';

@Injectable()
export class GroupAdminGuard extends GroupMemberGuard implements CanActivate {
  async canActivate(context: ExecutionContext): Promise<boolean> {
    const allowed = await super.canActivate(context);
    if (!allowed) {
      throw new NotFoundException('Group not found');
    }

    const request = context.switchToHttp().getRequest<AuthedRequest>();
    if (request.membership?.role !== Role.admin) {
      throw new ForbiddenException('Admin access required');
    }
    return true;
  }
}
