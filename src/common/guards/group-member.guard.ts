import {
  CanActivate,
  ExecutionContext,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PrismaService } from '../../prisma/prisma.service';
import type { AuthedRequest } from '../types/authed-request';
import { routeParam, toAuthedMembership } from '../types/authed-request';
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
    const request = context.switchToHttp().getRequest<AuthedRequest>();
    const userId = request.user?.id;
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
    const authedMembership = toAuthedMembership(membership);
    if (!authedMembership) {
      throw new NotFoundException('Group not found');
    }
    request.membership = authedMembership;
    return true;
  }

  private async resolveGroupId(
    context: ExecutionContext,
    request: AuthedRequest,
  ): Promise<string | null> {
    const resolveFrom =
      this.reflector.getAllAndOverride<ResolveGroupFrom>(
        RESOLVE_GROUP_FROM_KEY,
        [context.getHandler(), context.getClass()],
      ) ?? 'param';

    if (resolveFrom === 'cycle') {
      const cycleId = routeParam(request, 'id');
      if (!cycleId) return null;
      const cycle = await this.prisma.cycle.findUnique({
        where: { id: cycleId },
        select: { groupId: true },
      });
      const groupId = (cycle as unknown as { groupId?: string } | null)
        ?.groupId;
      return typeof groupId === 'string' ? groupId : null;
    }

    if (resolveFrom === 'contribution') {
      const contributionId = routeParam(request, 'id');
      if (!contributionId) return null;
      const contribution = await this.prisma.contribution.findUnique({
        where: { id: contributionId },
        select: { cycle: { select: { groupId: true } } },
      });
      const groupId = (
        contribution as unknown as { cycle?: { groupId?: string } } | null
      )?.cycle?.groupId;
      return typeof groupId === 'string' ? groupId : null;
    }

    const paramName =
      this.reflector.getAllAndOverride<string>(GROUP_ID_PARAM_KEY, [
        context.getHandler(),
        context.getClass(),
      ]) ?? 'id';

    return (
      routeParam(request, paramName) ?? routeParam(request, 'groupId') ?? null
    );
  }
}
