import { ConfigService } from '@nestjs/config';
import { EmailService } from './email.service';
import { RESEND_DEMO_NOTE } from './email.types';

describe('EmailService', () => {
  const payload = {
    to: 'ada@example.com',
    subject: 'Hello',
    body: 'Body text',
  };

  function serviceWith(env: Record<string, string | undefined>) {
    const config = {
      get: (key: string) => env[key],
    } as ConfigService;
    return new EmailService(config);
  }

  it('defaults to demo mode when RESEND_DEMO_MODE is unset', () => {
    expect(serviceWith({}).isDemoMode()).toBe(true);
  });

  it('treats RESEND_DEMO_MODE=false as live mode', () => {
    expect(serviceWith({ RESEND_DEMO_MODE: 'false' }).isDemoMode()).toBe(false);
  });

  it('returns the payload and demo-mode note when the API key is missing', async () => {
    const result = await serviceWith({}).send(payload);
    expect(result).toMatchObject({
      demoMode: true,
      delivered: false,
      payload,
      deliveryNote: RESEND_DEMO_NOTE,
      deliveryError: 'RESEND_API_KEY is not set',
    });
  });
});
