import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../src/app.module';
import {
  RESET_TOKEN_EXPIRED,
  RESET_TOKEN_INVALID,
  RESET_TOKEN_USED,
} from '../src/auth/password-reset.constants';
import { RESEND_DEMO_NOTE } from '../src/email/email.types';
import { PrismaService } from '../src/prisma/prisma.service';
import {
  asBody,
  type ForgotPasswordBody,
  type ResetErrorBody,
  type SignupBody,
} from './as-body';

function tokenFromResetEmail(body: string): string {
  const match = body.match(/reset-password\?token=([A-Za-z0-9_-]+)/);
  if (!match) {
    throw new Error(`Reset token missing from email body:\n${body}`);
  }
  return decodeURIComponent(match[1]);
}

describe('Password reset (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;

  const suffix = Date.now();
  const email = `reset.${suffix}@example.com`;
  const originalPassword = 'password123';
  const nextPassword = 'password456';

  let userId: string;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
        transformOptions: { enableImplicitConversion: true },
      }),
    );
    await app.init();
    prisma = app.get(PrismaService);
  });

  afterAll(async () => {
    if (userId) {
      await prisma.passwordResetToken.deleteMany({ where: { userId } });
    }
    await prisma.user.deleteMany({ where: { email } }).catch(() => undefined);
    await app.close();
  });

  it('signs up a user', async () => {
    const res = await request(app.getHttpServer())
      .post('/auth/signup')
      .send({
        firstName: 'Reset',
        lastName: 'User',
        email,
        password: originalPassword,
        bankName: 'GTBank',
        bankCode: '058',
        accountNumber: '0123456789',
      })
      .expect(201);

    const signup = asBody<SignupBody>(res);
    userId = signup.user.id;
    expect(userId).toBeDefined();
  });

  it('returns demo-mode payload for an unknown email without leaking a token', async () => {
    const res = await request(app.getHttpServer())
      .post('/auth/forgot-password')
      .send({ email: `nobody.${suffix}@example.com` })
      .expect(201);

    const payload = asBody<ForgotPasswordBody>(res);
    expect(payload.ok).toBe(true);
    expect(payload.demoMode).toBe(true);
    expect(payload.deliveryNote).toBe(RESEND_DEMO_NOTE);
    expect(payload.email).toMatchObject({
      to: `nobody.${suffix}@example.com`,
      subject: 'Reset your Pocket Circle password',
    });
    expect(payload.email.body).not.toMatch(/reset-password\?token=/);
  });

  it('emails a copyable demo payload and resets the password from the token', async () => {
    const forgot = await request(app.getHttpServer())
      .post('/auth/forgot-password')
      .send({ email })
      .expect(201);

    const forgotBody = asBody<ForgotPasswordBody>(forgot);
    expect(forgotBody).toMatchObject({
      ok: true,
      demoMode: true,
      deliveryNote: RESEND_DEMO_NOTE,
      email: {
        to: email,
        subject: 'Reset your Pocket Circle password',
      },
    });
    expect(typeof forgotBody.email.body).toBe('string');
    expect(forgotBody.email.body).toContain('/reset-password?token=');

    const token = tokenFromResetEmail(forgotBody.email.body);

    await request(app.getHttpServer())
      .post('/auth/reset-password')
      .send({ token, password: nextPassword })
      .expect(201);

    await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email, password: originalPassword })
      .expect(401);

    const login = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email, password: nextPassword })
      .expect(201);
    expect(asBody<SignupBody>(login).accessToken).toBeDefined();
  });

  it('rejects a reused token with a distinct already-used message', async () => {
    const forgot = await request(app.getHttpServer())
      .post('/auth/forgot-password')
      .send({ email })
      .expect(201);
    const token = tokenFromResetEmail(
      asBody<ForgotPasswordBody>(forgot).email.body,
    );

    await request(app.getHttpServer())
      .post('/auth/reset-password')
      .send({ token, password: 'password789' })
      .expect(201);

    const reused = await request(app.getHttpServer())
      .post('/auth/reset-password')
      .send({ token, password: 'password000' })
      .expect(400);

    expect(asBody<ResetErrorBody>(reused).message).toBe(RESET_TOKEN_USED);

    await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email, password: 'password789' })
      .expect(201);
  });

  it('rejects an invalid token with a distinct invalid message', async () => {
    const res = await request(app.getHttpServer())
      .post('/auth/reset-password')
      .send({ token: 'not-a-real-reset-token', password: 'password123' })
      .expect(400);

    expect(asBody<ResetErrorBody>(res).message).toBe(RESET_TOKEN_INVALID);
  });

  it('rejects an expired token with a distinct expired message', async () => {
    const forgot = await request(app.getHttpServer())
      .post('/auth/forgot-password')
      .send({ email })
      .expect(201);
    const token = tokenFromResetEmail(
      asBody<ForgotPasswordBody>(forgot).email.body,
    );

    await prisma.passwordResetToken.updateMany({
      where: { userId, usedAt: null, supersededAt: null },
      data: { expiresAt: new Date(Date.now() - 60_000) },
    });

    const expired = await request(app.getHttpServer())
      .post('/auth/reset-password')
      .send({ token, password: 'password111' })
      .expect(400);

    expect(asBody<ResetErrorBody>(expired).message).toBe(RESET_TOKEN_EXPIRED);
  });

  it('invalidates an unused token when a newer reset is requested', async () => {
    const first = await request(app.getHttpServer())
      .post('/auth/forgot-password')
      .send({ email })
      .expect(201);
    const oldToken = tokenFromResetEmail(
      asBody<ForgotPasswordBody>(first).email.body,
    );

    const second = await request(app.getHttpServer())
      .post('/auth/forgot-password')
      .send({ email })
      .expect(201);
    const newToken = tokenFromResetEmail(
      asBody<ForgotPasswordBody>(second).email.body,
    );

    expect(newToken).not.toBe(oldToken);

    const superseded = await request(app.getHttpServer())
      .post('/auth/reset-password')
      .send({ token: oldToken, password: 'password222' })
      .expect(400);
    expect(asBody<ResetErrorBody>(superseded).message).toBe(RESET_TOKEN_USED);

    await request(app.getHttpServer())
      .post('/auth/reset-password')
      .send({ token: newToken, password: 'password333' })
      .expect(201);

    await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email, password: 'password333' })
      .expect(201);
  });
});
