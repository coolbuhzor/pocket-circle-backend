import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Role, CycleStatus } from '../../../generated/prisma/enums';
import { PrismaService } from '../../prisma/prisma.service';
import type { AuthedCycle, AuthedRequest } from '../types/authed-request';
import {
  routeParam,
  toAuthedCycle,
  toAuthedMembership,
} from '../types/authed-request';
import {
  CYCLE_ID_PARAM_KEY,
  GROUP_ID_PARAM_KEY,
  RESOLVE_CYCLE_FROM_KEY,
  ResolveCycleFrom,
} from '../decorators/group-id-param.decorator';

@Injectable()
export class CollectorOrAdminGuard implements CanActivate {
  constructor(
    private readonly prisma: PrismaService,
    private readonly reflector: Reflector,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthedRequest>();
    const userId = request.user?.id;
    if (!userId) {
      throw new ForbiddenException('Collector or admin access required');
    }

    const cycle = await this.resolveCycle(context, request);
    if (!cycle) {
      throw new NotFoundException('Cycle not found');
    }

    request.cycle = cycle;
    request.groupId = cycle.groupId;

    if (cycle.collectorUserId === userId) {
      return true;
    }

    const membership = await this.prisma.groupMember.findUnique({
      where: {
        groupId_userId: { groupId: cycle.groupId, userId },
      },
    });

    if (membership?.role === Role.admin) {
      const authedMembership = toAuthedMembership(membership);
      if (authedMembership) {
        request.membership = authedMembership;
      }
      return true;
    }

    throw new ForbiddenException('Collector or admin access required');
  }

  private async resolveCycle(
    context: ExecutionContext,
    request: AuthedRequest,
  ): Promise<AuthedCycle | null> {
    const resolveFrom =
      this.reflector.getAllAndOverride<ResolveCycleFrom>(
        RESOLVE_CYCLE_FROM_KEY,
        [context.getHandler(), context.getClass()],
      ) ?? 'param';

    if (resolveFrom === 'contribution') {
      const contributionId = routeParam(request, 'id');
      if (!contributionId) return null;
      const contribution = await this.prisma.contribution.findUnique({
        where: { id: contributionId },
        include: { cycle: true },
      });
      return toAuthedCycle(contribution?.cycle);
    }

    if (resolveFrom === 'activeByGroup') {
      const groupParam =
        this.reflector.getAllAndOverride<string>(GROUP_ID_PARAM_KEY, [
          context.getHandler(),
          context.getClass(),
        ]) ?? 'id';
      const groupId =
        routeParam(request, groupParam) ?? routeParam(request, 'groupId');
      if (!groupId) return null;
      const cycle = await this.prisma.cycle.findFirst({
        where: { groupId, status: CycleStatus.active },
      });
      return toAuthedCycle(cycle);
    }

    const paramName =
      this.reflector.getAllAndOverride<string>(CYCLE_ID_PARAM_KEY, [
        context.getHandler(),
        context.getClass(),
      ]) ?? 'id';

    const cycleId = routeParam(request, paramName);
    if (!cycleId) return null;
    const cycle = await this.prisma.cycle.findUnique({
      where: { id: cycleId },
    });
    return toAuthedCycle(cycle);
  }
}
