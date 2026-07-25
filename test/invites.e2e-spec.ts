import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { Frequency, InviteStatus } from '../generated/prisma/enums';
import { AppModule } from '../src/app.module';
import { InvitesSchedulerService } from '../src/invites/invites.scheduler';
import { PrismaService } from '../src/prisma/prisma.service';

describe('Invites (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let scheduler: InvitesSchedulerService;

  const suffix = Date.now();
  const adminEmail = `admin.invite.${suffix}@example.com`;
  const inviteeEmail = `invitee.${suffix}@example.com`;
  const password = 'password123';

  let adminToken: string;
  let inviteeToken: string;
  let groupId: string;
  let createdInviteToken: string;

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
    scheduler = app.get(InvitesSchedulerService);
  });

  afterAll(async () => {
    if (groupId) {
      await prisma.notification.deleteMany({ where: { groupId } });
      await prisma.invite.deleteMany({ where: { groupId } });
      await prisma.groupMember.deleteMany({ where: { groupId } });
      await prisma.activityEvent.deleteMany({ where: { groupId } });
      await prisma.group.deleteMany({ where: { id: groupId } }).catch(() => undefined);
    }

    await prisma.user.deleteMany({
      where: { email: { in: [adminEmail, inviteeEmail] } },
    });

    await app.close();
  });

  it('signs up admin and invitee users', async () => {
    const adminRes = await request(app.getHttpServer())
      .post('/auth/signup')
      .send({
        name: 'Invite Admin',
        email: adminEmail,
        password,
        bankName: 'GTBank',
        accountNumber: '0123456789',
      })
      .expect(201);

    adminToken = adminRes.body.accessToken;
    expect(adminToken).toBeDefined();

    const inviteeRes = await request(app.getHttpServer())
      .post('/auth/signup')
      .send({
        name: 'Invitee User',
        email: inviteeEmail,
        password,
        bankName: 'Access',
        accountNumber: '0987654321',
      })
      .expect(201);

    inviteeToken = inviteeRes.body.accessToken;
    expect(inviteeToken).toBeDefined();
  });

  it('creates a group as admin', async () => {
    const res = await request(app.getHttpServer())
      .post('/groups')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        name: `Invite Test Group ${suffix}`,
        contributionAmount: 5000,
        frequency: Frequency.monthly,
      })
      .expect(201);

    groupId = res.body.id;
    expect(groupId).toBeDefined();
  });

  it('creates an invite for an existing user and notifies them', async () => {
    const res = await request(app.getHttpServer())
      .post(`/groups/${groupId}/invites`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ email: inviteeEmail })
      .expect(201);

    expect(res.body).toMatchObject({
      groupId,
      inviteeEmail,
      matchedExistingUser: true,
      status: InviteStatus.active,
    });
    expect(res.body.token).toBeDefined();
    createdInviteToken = res.body.token;

    const notification = await prisma.notification.findFirst({
      where: {
        type: 'group_invite',
        groupId,
        href: `/invite/${createdInviteToken}`,
      },
    });
    expect(notification).not.toBeNull();
    expect(notification?.title).toContain('invited to join');
  });

  it('lists group invites with pending effectiveStatus', async () => {
    const res = await request(app.getHttpServer())
      .get(`/groups/${groupId}/invites`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);

    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body.length).toBeGreaterThanOrEqual(1);

    const invite = res.body.find(
      (row: { token: string }) => row.token === createdInviteToken,
    );
    expect(invite).toMatchObject({
      token: createdInviteToken,
      inviteeEmail,
      status: InviteStatus.active,
      effectiveStatus: 'pending',
      invitedBy: { name: 'Invite Admin' },
    });
  });

  it('allows public view and invitee accept', async () => {
    const view = await request(app.getHttpServer())
      .get(`/invites/${createdInviteToken}`)
      .expect(200);

    expect(view.body.group.id).toBe(groupId);
    expect(view.body.inviter.name).toBe('Invite Admin');

    await request(app.getHttpServer())
      .post(`/invites/${createdInviteToken}/accept`)
      .set('Authorization', `Bearer ${inviteeToken}`)
      .expect(201);

    const list = await request(app.getHttpServer())
      .get(`/groups/${groupId}/invites`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);

    const accepted = list.body.find(
      (row: { token: string }) => row.token === createdInviteToken,
    );
    expect(accepted).toMatchObject({
      status: InviteStatus.accepted,
      effectiveStatus: 'accepted',
    });
  });

  it('returns matchedExistingUser false for unknown email', async () => {
    const res = await request(app.getHttpServer())
      .post(`/groups/${groupId}/invites`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ email: `nobody.${suffix}@example.com` })
      .expect(201);

    expect(res.body.matchedExistingUser).toBe(false);
    expect(res.body.inviteeEmail).toBe(`nobody.${suffix}@example.com`);
  });

  it('derives expired effectiveStatus and cron flips stored status', async () => {
    const createRes = await request(app.getHttpServer())
      .post(`/groups/${groupId}/invites`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({})
      .expect(201);

    const staleToken = createRes.body.token as string;
    await prisma.invite.update({
      where: { token: staleToken },
      data: { expiresAt: new Date(Date.now() - 60_000) },
    });

    const listBeforeCron = await request(app.getHttpServer())
      .get(`/groups/${groupId}/invites`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);

    const before = listBeforeCron.body.find(
      (row: { token: string }) => row.token === staleToken,
    );
    expect(before.status).toBe(InviteStatus.active);
    expect(before.effectiveStatus).toBe('expired');

    await scheduler.expireStaleInvites();

    const stored = await prisma.invite.findUnique({
      where: { token: staleToken },
    });
    expect(stored?.status).toBe(InviteStatus.expired);

    const listAfterCron = await request(app.getHttpServer())
      .get(`/groups/${groupId}/invites`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);

    const after = listAfterCron.body.find(
      (row: { token: string }) => row.token === staleToken,
    );
    expect(after).toMatchObject({
      status: InviteStatus.expired,
      effectiveStatus: 'expired',
    });
  });

  it('rejects non-admin listing of invites', async () => {
    await request(app.getHttpServer())
      .get(`/groups/${groupId}/invites`)
      .set('Authorization', `Bearer ${inviteeToken}`)
      .expect(403);
  });
});
