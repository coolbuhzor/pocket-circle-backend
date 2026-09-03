import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Resend } from 'resend';
import { EmailPayload, EmailSendResult, RESEND_DEMO_NOTE } from './email.types';

const RESEND_SANDBOX_PATTERN =
  /only send testing emails to your own email|you can only send to your verified email|restricted to your own email|testing emails/i;

@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);

  constructor(private readonly config: ConfigService) {}

  isDemoMode(): boolean {
    const raw = this.config.get<string>('RESEND_DEMO_MODE');
    if (raw === undefined || raw === '') {
      return true;
    }
    return raw.toLowerCase() !== 'false';
  }

  frontendUrl(): string {
    const url = this.config.get<string>('FRONTEND_URL')?.trim();
    return (url || 'http://localhost:3000').replace(/\/$/, '');
  }

  async send(payload: EmailPayload): Promise<EmailSendResult> {
    const demoMode = this.isDemoMode();
    const apiKey = this.config.get<string>('RESEND_API_KEY')?.trim();
    const from =
      this.config.get<string>('RESEND_FROM_EMAIL')?.trim() ||
      'Pocket Circle <onboarding@resend.dev>';

    if (!apiKey) {
      this.logger.warn(
        'RESEND_API_KEY is not set; skipping delivery and returning the email payload for demo mode.',
      );
      return {
        demoMode: true,
        delivered: false,
        payload,
        deliveryNote: RESEND_DEMO_NOTE,
        deliveryError: 'RESEND_API_KEY is not set',
      };
    }

    try {
      const resend = new Resend(apiKey);
      const result = await resend.emails.send({
        from,
        to: payload.to,
        subject: payload.subject,
        text: payload.body,
      });

      if (result.error) {
        const message = result.error.message || 'Resend rejected the send';
        this.logger.warn(`Resend send failed: ${message}`);
        return {
          demoMode: demoMode || this.isSandboxRestriction(message),
          delivered: false,
          payload,
          deliveryNote: RESEND_DEMO_NOTE,
          deliveryError: this.surfaceDeliveryError(message),
        };
      }

      return {
        demoMode,
        delivered: true,
        payload,
        deliveryNote: demoMode ? RESEND_DEMO_NOTE : 'Email queued with Resend.',
        deliveryError: null,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.warn(`Resend send threw: ${message}`);
      return {
        demoMode: demoMode || this.isSandboxRestriction(message),
        delivered: false,
        payload,
        deliveryNote: RESEND_DEMO_NOTE,
        deliveryError: this.surfaceDeliveryError(message),
      };
    }
  }

  private isSandboxRestriction(message: string): boolean {
    return RESEND_SANDBOX_PATTERN.test(message);
  }

  private surfaceDeliveryError(message: string): string {
    if (this.isSandboxRestriction(message)) {
      return 'Resend sandbox restriction: test API keys can only send to the account owner’s verified address. The email payload is still returned below.';
    }
    return message;
  }
}
