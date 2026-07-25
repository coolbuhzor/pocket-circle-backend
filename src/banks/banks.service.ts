import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export type BankListItem = { name: string; code: string };

export type ResolveAccountSuccess = {
  resolved: true;
  accountName: string;
};

export type ResolveAccountFailure = {
  resolved: false;
};

export type ResolveAccountResult =
  | ResolveAccountSuccess
  | ResolveAccountFailure;

const BANKS_CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const PAYSTACK_BASE = 'https://api.paystack.co';

@Injectable()
export class BanksService {
  private readonly logger = new Logger(BanksService.name);
  private banksCache: { fetchedAt: number; banks: BankListItem[] } | null =
    null;

  constructor(private readonly config: ConfigService) {}

  private getSecretKey(): string | undefined {
    return this.config.get<string>('PAYSTACK_SECRET_KEY')?.trim() || undefined;
  }

  async listBanks(): Promise<BankListItem[]> {
    const now = Date.now();
    if (
      this.banksCache &&
      now - this.banksCache.fetchedAt < BANKS_CACHE_TTL_MS
    ) {
      return this.banksCache.banks;
    }

    const secret = this.getSecretKey();
    if (!secret) {
      this.logger.warn('PAYSTACK_SECRET_KEY is not set; returning empty bank list');
      return [];
    }

    try {
      const res = await fetch(`${PAYSTACK_BASE}/bank?country=nigeria`, {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${secret}`,
          Accept: 'application/json',
        },
      });

      if (!res.ok) {
        this.logger.warn(`Paystack bank list failed: ${res.status}`);
        return this.banksCache?.banks ?? [];
      }

      const json = (await res.json()) as {
        status?: boolean;
        data?: Array<{ name?: string; code?: string; active?: boolean }>;
      };

      const banks = (json.data ?? [])
        .filter(
          (bank): bank is { name: string; code: string; active?: boolean } =>
            typeof bank.name === 'string' &&
            typeof bank.code === 'string' &&
            bank.active !== false,
        )
        .map((bank) => ({ name: bank.name, code: bank.code }));

      this.banksCache = { fetchedAt: now, banks };
      return banks;
    } catch (error) {
      this.logger.warn(
        `Paystack bank list error: ${error instanceof Error ? error.message : error}`,
      );
      return this.banksCache?.banks ?? [];
    }
  }

  /**
   * Resolve a NUBAN account name via Paystack.
   * Never throws for Paystack/business failures — returns `{ resolved: false }`.
   */
  async resolveAccount(
    accountNumber: string,
    bankCode: string,
  ): Promise<ResolveAccountResult> {
    const secret = this.getSecretKey();
    if (!secret) {
      return { resolved: false };
    }

    try {
      const qs = new URLSearchParams({
        account_number: accountNumber,
        bank_code: bankCode,
      });
      const res = await fetch(`${PAYSTACK_BASE}/bank/resolve?${qs.toString()}`, {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${secret}`,
          Accept: 'application/json',
        },
      });

      if (!res.ok) {
        return { resolved: false };
      }

      const json = (await res.json()) as {
        status?: boolean;
        data?: { account_name?: string };
      };

      const accountName = json.data?.account_name?.trim();
      if (!json.status || !accountName) {
        return { resolved: false };
      }

      return { resolved: true, accountName };
    } catch (error) {
      this.logger.warn(
        `Paystack resolve error: ${error instanceof Error ? error.message : error}`,
      );
      return { resolved: false };
    }
  }
}
