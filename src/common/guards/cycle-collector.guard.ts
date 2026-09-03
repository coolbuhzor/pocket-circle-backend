import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PrismaService } from '../../prisma/prisma.service';
import type { AuthedCycle, AuthedRequest } from '../types/authed-request';
import { routeParam, toAuthedCycle } from '../types/authed-request';
import {
  CYCLE_ID_PARAM_KEY,
  RESOLVE_CYCLE_FROM_KEY,
  ResolveCycleFrom,
} from '../decorators/group-id-param.decorator';

@Injectable()
export class CycleCollectorGuard implements CanActivate {
  constructor(
    private readonly prisma: PrismaService,
    private readonly reflector: Reflector,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthedRequest>();
    const userId = request.user?.id;
    if (!userId) {
      throw new ForbiddenException('Collector access required');
    }

    const cycle = await this.resolveCycle(context, request);
    if (!cycle) {
      throw new NotFoundException('Cycle not found');
    }

    const collectorUserId: string = cycle.collectorUserId;
    const groupId: string = cycle.groupId;

    if (collectorUserId !== userId) {
      throw new ForbiddenException('Collector access required');
    }

    request.cycle = {
      id: cycle.id,
      groupId,
      collectorUserId,
    };
    request.groupId = groupId;
    return true;
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
      if (!contribution) return null;
      request.contribution = contribution;
      return toAuthedCycle(contribution.cycle);
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
