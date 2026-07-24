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
    const request = context.switchToHttp().getRequest();
    const userId = request.user?.id as string | undefined;
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
      request.membership = membership;
      return true;
    }

    throw new ForbiddenException('Collector or admin access required');
  }

  private async resolveCycle(
    context: ExecutionContext,
    request: { params: Record<string, string> },
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
      return contribution?.cycle ?? null;
    }

    if (resolveFrom === 'activeByGroup') {
      const groupParam =
        this.reflector.getAllAndOverride<string>(GROUP_ID_PARAM_KEY, [
          context.getHandler(),
          context.getClass(),
        ]) ?? 'id';
      const groupId =
        request.params[groupParam] ?? request.params.groupId ?? null;
      if (!groupId) return null;
      return this.prisma.cycle.findFirst({
        where: { groupId, status: CycleStatus.active },
      });
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
