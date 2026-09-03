import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { Frequency, InviteStatus } from '../generated/prisma/enums';
import { AppModule } from '../src/app.module';
import { InvitesSchedulerService } from '../src/invites/invites.scheduler';
import { PrismaService } from '../src/prisma/prisma.service';
import {
  asBody,
  containing,
  containingObject,
  type E2eBody,
  type E2eList,
  type InviteCreateBody,
  type InviteViewBody,
  type ResetErrorBody,
  type SignupBody,
} from './as-body';

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
    const groupIds = [groupId, memberEmailsGroupId].filter((id): id is string =>
      Boolean(id),
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
      const signup = asBody<SignupBody>(res);
      expect(signup.accessToken).toBeDefined();
      return signup.accessToken;
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

    groupId = asBody<E2eBody>(res).id;
    expect(groupId).toBeDefined();
    expect(asBody<E2eBody>(res).invitesSent).toEqual([]);
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

    memberEmailsGroupId = asBody<E2eBody>(res).id;
    expect(asBody<E2eBody>(res).invitesSent).toEqual(
      expect.arrayContaining([
        containingObject({
          email: inviteeEmail,
          matchedExistingUser: true,
          demoMode: true,
          emailPayload: containingObject({
            to: inviteeEmail,
            subject: containing('invited to join'),
          }),
        }),
        containingObject({
          email: unknownEmail,
          matchedExistingUser: false,
          demoMode: true,
          emailPayload: containingObject({
            to: unknownEmail,
          }),
        }),
      ]),
    );
    expect(asBody<E2eBody>(res).invitesSent).toHaveLength(2);
    expect(
      asBody<E2eBody>(res).invitesSent.some(
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

    expect(asBody<E2eBody>(res)).toMatchObject({
      groupId,
      inviteeEmail,
      matchedExistingUser: true,
      status: InviteStatus.active,
      demoMode: true,
      deliveryNote: containing('Resend demo mode'),
      email: {
        to: inviteeEmail,
        subject: containing('invited to join'),
      },
    });
    expect(asBody<E2eBody>(res).token).toBeDefined();
    expect(asBody<E2eBody>(res).email?.body).toContain(
      `/invite/${asBody<E2eBody>(res).token}`,
    );
    createdInviteToken = asBody<E2eBody>(res).token;

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

    expect(Array.isArray(asBody<E2eList>(res))).toBe(true);
    expect(asBody<E2eList>(res).length).toBeGreaterThanOrEqual(1);

    const invite = asBody<E2eList>(res).find(
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

    expect(asBody<E2eBody>(res).message).toContain(
      'This invite was sent to a different email address',
    );
  });

  it('allows public view and matching invitee accept', async () => {
    const view = await request(app.getHttpServer())
      .get(`/invites/${createdInviteToken}`)
      .expect(200);

    expect(asBody<InviteViewBody>(view)).toMatchObject({
      token: createdInviteToken,
      status: InviteStatus.active,
      group: { id: groupId },
    });
    expect(asBody<InviteViewBody>(view).inviter?.name).toBe('Invite Admin');

    await request(app.getHttpServer())
      .post(`/invites/${createdInviteToken}/accept`)
      .set('Authorization', `Bearer ${inviteeToken}`)
      .expect(201);

    const list = await request(app.getHttpServer())
      .get(`/groups/${groupId}/invites`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);

    const accepted = asBody<E2eList>(list).find(
      (row: { token: string }) => row.token === createdInviteToken,
    );
    expect(accepted).toMatchObject({
      status: InviteStatus.accepted,
      effectiveStatus: 'accepted',
    });

    // Accepted invites remain viewable so the client can route on status.
    const viewAccepted = await request(app.getHttpServer())
      .get(`/invites/${createdInviteToken}`)
      .expect(200);

    expect(asBody<InviteViewBody>(viewAccepted)).toMatchObject({
      token: createdInviteToken,
      status: InviteStatus.accepted,
      group: { id: groupId },
    });
  });

  it('allows any logged-in user to accept a link-only invite', async () => {
    const createRes = await request(app.getHttpServer())
      .post(`/groups/${groupId}/invites`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({})
      .expect(201);

    expect(asBody<InviteCreateBody>(createRes).inviteeEmail).toBeNull();
    expect(asBody<InviteCreateBody>(createRes).email).toBeNull();

    await request(app.getHttpServer())
      .post(`/invites/${asBody<InviteCreateBody>(createRes).token}/accept`)
      .set('Authorization', `Bearer ${outsiderToken}`)
      .expect(201);
  });

  it('returns matchedExistingUser false for unknown email', async () => {
    const res = await request(app.getHttpServer())
      .post(`/groups/${groupId}/invites`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ email: `nobody.${suffix}@example.com` })
      .expect(201);

    expect(asBody<E2eBody>(res).matchedExistingUser).toBe(false);
    expect(asBody<E2eBody>(res).inviteeEmail).toBe(
      `nobody.${suffix}@example.com`,
    );
    expect(asBody<E2eBody>(res).demoMode).toBe(true);
    expect(asBody<E2eBody>(res).email).toMatchObject({
      to: `nobody.${suffix}@example.com`,
      subject: containing('invited to join'),
    });
    expect(asBody<E2eBody>(res).email?.body).toContain(
      `/invite/${asBody<E2eBody>(res).token}`,
    );
  });

  it('derives expired effectiveStatus and cron flips stored status', async () => {
    const createRes = await request(app.getHttpServer())
      .post(`/groups/${groupId}/invites`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({})
      .expect(201);

    const staleToken = asBody<InviteCreateBody>(createRes).token;
    await prisma.invite.update({
      where: { token: staleToken },
      data: { expiresAt: new Date(Date.now() - 60_000) },
    });

    const listBeforeCron = await request(app.getHttpServer())
      .get(`/groups/${groupId}/invites`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);

    const before = asBody<E2eList>(listBeforeCron).find(
      (row: { token: string }) => row.token === staleToken,
    );
    expect(before?.status).toBe(InviteStatus.active);
    expect(before?.effectiveStatus).toBe('expired');

    await scheduler.expireStaleInvites();

    const stored = await prisma.invite.findUnique({
      where: { token: staleToken },
    });
    expect(stored?.status).toBe(InviteStatus.expired);

    const listAfterCron = await request(app.getHttpServer())
      .get(`/groups/${groupId}/invites`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);

    const after = asBody<E2eList>(listAfterCron).find(
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

    const token = asBody<InviteCreateBody>(createRes).token;

    const revokeRes = await request(app.getHttpServer())
      .post(`/groups/${groupId}/invites/${token}/revoke`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(201);

    expect(asBody<InviteCreateBody>(revokeRes)).toMatchObject({
      token,
      status: InviteStatus.revoked,
      effectiveStatus: 'revoked',
    });

    const acceptRes = await request(app.getHttpServer())
      .post(`/invites/${token}/accept`)
      .set('Authorization', `Bearer ${inviteeToken}`)
      .expect(400);

    expect(asBody<ResetErrorBody>(acceptRes).message).toContain(
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
    const acceptorToken = asBody<SignupBody>(signupRes).accessToken;

    const createRes = await request(app.getHttpServer())
      .post(`/groups/${groupId}/invites`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({})
      .expect(201);

    const token = asBody<InviteCreateBody>(createRes).token;

    await request(app.getHttpServer())
      .post(`/invites/${token}/accept`)
      .set('Authorization', `Bearer ${acceptorToken}`)
      .expect(201);

    const revokeRes = await request(app.getHttpServer())
      .post(`/groups/${groupId}/invites/${token}/revoke`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(400);

    expect(asBody<ResetErrorBody>(revokeRes).message).toContain(
      "This invite has already been accepted and can't be revoked",
    );

    await prisma.user
      .delete({ where: { email: acceptorEmail } })
      .catch(() => undefined);
  });

  it('returns invite data for expired and revoked tokens', async () => {
    const expiredRes = await request(app.getHttpServer())
      .post(`/groups/${groupId}/invites`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({})
      .expect(201);
    const expiredToken = asBody<InviteCreateBody>(expiredRes).token;

    await prisma.invite.update({
      where: { token: expiredToken },
      data: {
        status: InviteStatus.expired,
        expiresAt: new Date(Date.now() - 60_000),
      },
    });

    const viewExpired = await request(app.getHttpServer())
      .get(`/invites/${expiredToken}`)
      .expect(200);

    expect(asBody<InviteViewBody>(viewExpired)).toMatchObject({
      token: expiredToken,
      status: InviteStatus.expired,
      group: { id: groupId },
    });

    const revokedRes = await request(app.getHttpServer())
      .post(`/groups/${groupId}/invites`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({})
      .expect(201);
    const revokedToken = asBody<InviteCreateBody>(revokedRes).token;

    await request(app.getHttpServer())
      .post(`/groups/${groupId}/invites/${revokedToken}/revoke`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(201);

    const viewRevoked = await request(app.getHttpServer())
      .get(`/invites/${revokedToken}`)
      .expect(200);

    expect(asBody<InviteViewBody>(viewRevoked)).toMatchObject({
      token: revokedToken,
      status: InviteStatus.revoked,
      group: { id: groupId },
    });

    await request(app.getHttpServer())
      .get('/invites/00000000-0000-0000-0000-000000000000')
      .expect(404);
  });

  it('resends an expired invite, refreshes expiry, and notifies again', async () => {
    const resendInviteeEmail = `resend.${suffix}@example.com`;
    const signupRes = await request(app.getHttpServer())
      .post('/auth/signup')
      .send({
        firstName: 'Resend',
        lastName: 'User',
        email: resendInviteeEmail,
        password,
        bankName: 'GTBank',
        bankCode: '057',
        accountNumber: '3333444455',
      })
      .expect(201);
    expect(asBody<SignupBody>(signupRes).accessToken).toBeDefined();

    const createRes = await request(app.getHttpServer())
      .post(`/groups/${groupId}/invites`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ email: resendInviteeEmail })
      .expect(201);

    const token = asBody<InviteCreateBody>(createRes).token;

    await prisma.invite.update({
      where: { token },
      data: {
        status: InviteStatus.expired,
        expiresAt: new Date(Date.now() - 60_000),
      },
    });

    const beforeCount = await prisma.notification.count({
      where: {
        type: 'group_invite',
        href: `/invite/${token}`,
      },
    });

    const beforeResend = Date.now();
    const resendRes = await request(app.getHttpServer())
      .post(`/groups/${groupId}/invites/${token}/resend`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(201);

    expect(asBody<InviteCreateBody>(resendRes)).toMatchObject({
      token,
      groupId,
      inviteeEmail: resendInviteeEmail,
      status: InviteStatus.active,
      matchedExistingUser: true,
      effectiveStatus: 'pending',
      demoMode: true,
      email: {
        to: resendInviteeEmail,
        subject: containing('invited to join'),
      },
    });
    const resent = asBody<InviteCreateBody>(resendRes);
    expect(resent.email?.body).toContain(`/invite/${token}`);
    expect(new Date(resent.expiresAt ?? 0).getTime()).toBeGreaterThan(
      beforeResend + 29 * 24 * 60 * 60 * 1000,
    );

    const afterCount = await prisma.notification.count({
      where: {
        type: 'group_invite',
        href: `/invite/${token}`,
      },
    });
    expect(afterCount).toBe(beforeCount + 1);

    const acceptRes = await request(app.getHttpServer())
      .post(`/groups/${groupId}/invites/${createdInviteToken}/resend`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(400);

    expect(asBody<ResetErrorBody>(acceptRes).message).toContain(
      'This invite has already been accepted — no need to resend',
    );

    await prisma.user
      .delete({ where: { email: resendInviteeEmail } })
      .catch(() => undefined);
  });
});
