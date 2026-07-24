import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PrismaService } from '../../prisma/prisma.service';
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
    const request = context.switchToHttp().getRequest();
    const userId = request.user?.id as string | undefined;
    if (!userId) {
      throw new ForbiddenException('Collector access required');
    }

    const cycle = await this.resolveCycle(context, request);
    if (!cycle) {
      throw new NotFoundException('Cycle not found');
    }

    if (cycle.collectorUserId !== userId) {
      throw new ForbiddenException('Collector access required');
    }

    request.cycle = cycle;
    request.groupId = cycle.groupId;
    return true;
  }

  private async resolveCycle(
    context: ExecutionContext,
    request: { params: Record<string, string>; contribution?: unknown },
  ) {
    const resolveFrom =
      this.reflector.getAllAndOverride<ResolveCycleFrom>(
        RESOLVE_CYCLE_FROM_KEY,
        [context.getHandler(), context.getClass()],
      ) ?? 'param';

    if (resolveFrom === 'contribution') {
      const contributionId = request.params.id;
      if (!contributionId) return null;
      const contribution = await this.prisma.contribution.findUnique({
        where: { id: contributionId },
        include: { cycle: true },
      });
      if (!contribution) return null;
      request.contribution = contribution;
      return contribution.cycle;
    }

    const paramName =
      this.reflector.getAllAndOverride<string>(CYCLE_ID_PARAM_KEY, [
        context.getHandler(),
        context.getClass(),
      ]) ?? 'id';

    const cycleId = request.params[paramName];
    if (!cycleId) return null;

    return this.prisma.cycle.findUnique({ where: { id: cycleId } });
  }
}
