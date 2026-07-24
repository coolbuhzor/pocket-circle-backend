import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  ApiBearerAuth,
  ApiBody,
  ApiConsumes,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import {
  AuthUser,
  CurrentUser,
} from '../common/decorators/current-user.decorator';
import {
  ResolveCycleFrom,
  ResolveGroupFrom,
} from '../common/decorators/group-id-param.decorator';
import { CycleCollectorGuard } from '../common/guards/cycle-collector.guard';
import { GroupMemberGuard } from '../common/guards/group-member.guard';
import type { UploadedFile as ReceiptFile } from '../storage/storage.service';
import { ContributionsService } from './contributions.service';
import { CreateContributionDto } from './dto/create-contribution.dto';
import { DisputeContributionDto } from './dto/dispute-contribution.dto';

@ApiTags('Contributions')
@ApiBearerAuth('access-token')
@Controller()
export class ContributionsController {
  constructor(private readonly contributionsService: ContributionsService) {}

  @Get('cycles/:id/contributions')
  @UseGuards(GroupMemberGuard)
  @ResolveGroupFrom('cycle')
  @ApiOperation({ summary: 'List contributions for a cycle' })
  findByCycle(@Param('id') cycleId: string) {
    return this.contributionsService.findByCycle(cycleId);
  }

  @Post('cycles/:id/contributions')
  @UseGuards(GroupMemberGuard)
  @ResolveGroupFrom('cycle')
  @UseInterceptors(FileInterceptor('receipt'))
  @ApiOperation({ summary: 'Upload a contribution receipt' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      required: ['amount'],
      properties: {
        amount: { type: 'integer', minimum: 1, example: 5000 },
        note: { type: 'string', example: 'Paid via transfer' },
        receipt: {
          type: 'string',
          format: 'binary',
          description: 'Receipt image or PDF',
        },
      },
    },
  })
  upload(
    @Param('id') cycleId: string,
    @CurrentUser() user: AuthUser,
    @Body() dto: CreateContributionDto,
    @UploadedFile() file?: ReceiptFile,
  ) {
    return this.contributionsService.upload(cycleId, user.id, dto, file);
  }

  @Post('contributions/:id/confirm')
  @UseGuards(CycleCollectorGuard)
  @ResolveCycleFrom('contribution')
  @ApiOperation({ summary: 'Confirm a contribution (collector)' })
  confirm(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.contributionsService.confirm(id, user.id);
  }

  @Post('contributions/:id/dispute')
  @UseGuards(CycleCollectorGuard)
  @ResolveCycleFrom('contribution')
  @ApiOperation({ summary: 'Dispute a contribution (collector)' })
  dispute(
    @Param('id') id: string,
    @CurrentUser() user: AuthUser,
    @Body() dto: DisputeContributionDto,
  ) {
    return this.contributionsService.dispute(id, user.id, dto.reason);
  }
}
