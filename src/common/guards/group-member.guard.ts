import {
  CanActivate,
  ExecutionContext,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PrismaService } from '../../prisma/prisma.service';
import {
  GROUP_ID_PARAM_KEY,
  RESOLVE_GROUP_FROM_KEY,
  ResolveGroupFrom,
} from '../decorators/group-id-param.decorator';

@Injectable()
export class GroupMemberGuard implements CanActivate {
  constructor(
    private readonly prisma: PrismaService,
    private readonly reflector: Reflector,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const userId = request.user?.id as string | undefined;
    if (!userId) {
      throw new NotFoundException('Group not found');
    }

    const groupId = await this.resolveGroupId(context, request);
    if (!groupId) {
      throw new NotFoundException('Group not found');
    }

    const membership = await this.prisma.groupMember.findUnique({
      where: { groupId_userId: { groupId, userId } },
    });

    if (!membership) {
      throw new NotFoundException('Group not found');
    }

    request.groupId = groupId;
    request.membership = membership;
    return true;
  }

  private async resolveGroupId(
    context: ExecutionContext,
    request: { params: Record<string, string> },
  ): Promise<string | null> {
    const resolveFrom =
      this.reflector.getAllAndOverride<ResolveGroupFrom>(
        RESOLVE_GROUP_FROM_KEY,
        [context.getHandler(), context.getClass()],
      ) ?? 'param';

    if (resolveFrom === 'cycle') {
      const cycleId = request.params.id;
      if (!cycleId) return null;
      const cycle = await this.prisma.cycle.findUnique({
        where: { id: cycleId },
        select: { groupId: true },
      });
      return cycle?.groupId ?? null;
    }

    if (resolveFrom === 'contribution') {
      const contributionId = request.params.id;
      if (!contributionId) return null;
      const contribution = await this.prisma.contribution.findUnique({
        where: { id: contributionId },
        select: { cycle: { select: { groupId: true } } },
      });
      return contribution?.cycle.groupId ?? null;
    }

    const paramName =
      this.reflector.getAllAndOverride<string>(GROUP_ID_PARAM_KEY, [
        context.getHandler(),
        context.getClass(),
      ]) ?? 'id';

    return request.params[paramName] ?? request.params.groupId ?? null;
  }
}
