import { Controller, Get, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Public } from '../common/decorators/public.decorator';
import { BanksService } from './banks.service';
import { ResolveBankQueryDto } from './dto/resolve-bank-query.dto';

@ApiTags('Banks')
@Controller('banks')
export class BanksController {
  constructor(private readonly banksService: BanksService) {}

  @Public()
  @Get()
  @ApiOperation({ summary: 'List Nigerian banks (Paystack, cached)' })
  listBanks() {
    return this.banksService.listBanks();
  }

  @Public()
  @Get('resolve')
  @ApiOperation({
    summary: 'Resolve account name for a NUBAN (never blocks signup)',
  })
  async resolve(@Query() query: ResolveBankQueryDto) {
    const result = await this.banksService.resolveAccount(
      query.accountNumber,
      query.bankCode,
    );
    if (!result.resolved) {
      return { resolved: false };
    }
    return { accountName: result.accountName, resolved: true };
  }
}
