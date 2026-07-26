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
  const outsiderEmail = `outsider.${suffix}@example.com`;
  const password = 'password123';

  let adminToken: string;
  let inviteeToken: string;
  let outsiderToken: string;
  let groupId: string;
  let memberEmailsGroupId: string | undefined;
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
    const groupIds = [groupId, memberEmailsGroupId].filter(
      (id): id is string => Boolean(id),
    );

    for (const id of groupIds) {
      await prisma.notification.deleteMany({ where: { groupId: id } });
      await prisma.invite.deleteMany({ where: { groupId: id } });
      await prisma.groupMember.deleteMany({ where: { groupId: id } });
      await prisma.activityEvent.deleteMany({ where: { groupId: id } });
      await prisma.cycle.deleteMany({ where: { groupId: id } });
      await prisma.group.deleteMany({ where: { id } }).catch(() => undefined);
    }

    await prisma.user.deleteMany({
      where: {
        email: { in: [adminEmail, inviteeEmail, outsiderEmail] },
      },
    });

    await app.close();
  });

  it('signs up admin, invitee, and outsider users', async () => {
    const signup = async (
      firstName: string,
      lastName: string,
      email: string,
      bankCode: string,
      accountNumber: string,
    ) => {
      const res = await request(app.getHttpServer())
        .post('/auth/signup')
        .send({
          firstName,
          lastName,
          email,
          password,
          bankName: 'GTBank',
          bankCode,
          accountNumber,
        })
        .expect(201);
      expect(res.body.accessToken).toBeDefined();
      return res.body.accessToken as string;
    };

    adminToken = await signup(
      'Invite',
      'Admin',
      adminEmail,
      '058',
      '0123456789',
    );
    inviteeToken = await signup(
      'Invitee',
      'User',
      inviteeEmail,
      '044',
      '0987654321',
    );
    outsiderToken = await signup(
      'Outsider',
      'User',
      outsiderEmail,
      '033',
      '1111222233',
    );
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
    expect(res.body.invitesSent).toEqual([]);
  });

  it('creates a group with memberEmails and reuses invite logic', async () => {
    const unknownEmail = `nobody.create.${suffix}@example.com`;

    const res = await request(app.getHttpServer())
      .post('/groups')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        name: `Member Emails Group ${suffix}`,
        contributionAmount: 2500,
        frequency: Frequency.weekly,
        memberEmails: [
          inviteeEmail,
          adminEmail,
          unknownEmail,
          inviteeEmail.toUpperCase(),
        ],
      })
      .expect(201);

    memberEmailsGroupId = res.body.id;
    expect(res.body.invitesSent).toEqual(
      expect.arrayContaining([
        { email: inviteeEmail, matchedExistingUser: true },
        { email: unknownEmail, matchedExistingUser: false },
      ]),
    );
    expect(res.body.invitesSent).toHaveLength(2);
    expect(
      res.body.invitesSent.some(
        (row: { email: string }) => row.email === adminEmail,
      ),
    ).toBe(false);

    const notification = await prisma.notification.findFirst({
      where: {
        type: 'group_invite',
        groupId: memberEmailsGroupId,
      },
    });
    expect(notification).not.toBeNull();
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

  it('rejects accept when logged-in email does not match inviteeEmail', async () => {
    const res = await request(app.getHttpServer())
      .post(`/invites/${createdInviteToken}/accept`)
      .set('Authorization', `Bearer ${outsiderToken}`)
      .expect(403);

    expect(res.body.message).toContain(
      'This invite was sent to a different email address',
    );
  });

  it('allows public view and matching invitee accept', async () => {
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

  it('allows any logged-in user to accept a link-only invite', async () => {
    const createRes = await request(app.getHttpServer())
      .post(`/groups/${groupId}/invites`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({})
      .expect(201);

    expect(createRes.body.inviteeEmail).toBeNull();

    await request(app.getHttpServer())
      .post(`/invites/${createRes.body.token}/accept`)
      .set('Authorization', `Bearer ${outsiderToken}`)
      .expect(201);
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

  it('revokes an active invite and rejects accept', async () => {
    const createRes = await request(app.getHttpServer())
      .post(`/groups/${groupId}/invites`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ email: `revoke.${suffix}@example.com` })
      .expect(201);

    const token = createRes.body.token as string;

    const revokeRes = await request(app.getHttpServer())
      .post(`/groups/${groupId}/invites/${token}/revoke`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(201);

    expect(revokeRes.body).toMatchObject({
      token,
      status: InviteStatus.revoked,
      effectiveStatus: 'revoked',
    });

    const acceptRes = await request(app.getHttpServer())
      .post(`/invites/${token}/accept`)
      .set('Authorization', `Bearer ${inviteeToken}`)
      .expect(400);

    expect(acceptRes.body.message).toContain(
      'This invite has been revoked by the group admin',
    );
  });

  it('rejects revoke when invite is already accepted', async () => {
    const acceptorEmail = `acceptor.${suffix}@example.com`;
    const signupRes = await request(app.getHttpServer())
      .post('/auth/signup')
      .send({
        firstName: 'Accept',
        lastName: 'Or',
        email: acceptorEmail,
        password,
        bankName: 'GTBank',
        bankCode: '011',
        accountNumber: '2222333344',
      })
      .expect(201);
    const acceptorToken = signupRes.body.accessToken as string;

    const createRes = await request(app.getHttpServer())
      .post(`/groups/${groupId}/invites`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({})
      .expect(201);

    const token = createRes.body.token as string;

    await request(app.getHttpServer())
      .post(`/invites/${token}/accept`)
      .set('Authorization', `Bearer ${acceptorToken}`)
      .expect(201);

    const revokeRes = await request(app.getHttpServer())
      .post(`/groups/${groupId}/invites/${token}/revoke`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(400);

    expect(revokeRes.body.message).toContain(
      "This invite has already been accepted and can't be revoked",
    );

    await prisma.user.delete({ where: { email: acceptorEmail } }).catch(() => undefined);
  });
});
