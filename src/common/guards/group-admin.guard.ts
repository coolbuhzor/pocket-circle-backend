import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Role } from '../../../generated/prisma/enums';
import { GroupMemberGuard } from './group-member.guard';

@Injectable()
export class GroupAdminGuard
  extends GroupMemberGuard
  implements CanActivate
{
  async canActivate(context: ExecutionContext): Promise<boolean> {
    const allowed = await super.canActivate(context);
    if (!allowed) {
      throw new NotFoundException('Group not found');
    }

    const request = context.switchToHttp().getRequest();
    if (request.membership?.role !== Role.admin) {
      throw new ForbiddenException('Admin access required');
    }
    return true;
  }
}
