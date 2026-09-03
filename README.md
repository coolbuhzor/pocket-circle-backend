# Pocket Circle API

NestJS API for **Pocket Circle** — coordinating Ajo / rotating savings groups in Nigeria.

The API does **not** hold or move money. It tracks groups, cycles, contributions (with receipt uploads), invites, and notifications. The Next.js app talks to this API through a same-origin BFF.

Author / maintainer: Senior Developer

## Stack

- NestJS 11 + TypeScript
- Prisma 7 + PostgreSQL (`@prisma/adapter-pg`)
- JWT auth (`@nestjs/jwt` + Passport)
- bcrypt password hashing
- Paystack (Nigerian bank list + NUBAN resolve)
- Cloudinary (receipt uploads)
- Resend (invite + password-reset emails; **demo mode by default**)
- Swagger at `/docs`

## Getting started

```bash
pnpm install
cp .env.example .env
# fill DATABASE_URL, JWT_SECRET, and the other keys documented below
pnpm exec prisma migrate deploy
pnpm start:dev
```

- API: [http://localhost:4001/api/v1](http://localhost:4001/api/v1)
- Swagger: [http://localhost:4001/docs](http://localhost:4001/docs)

`pnpm start:prod` runs `prisma migrate deploy` then `node dist/main`.

## Environment

See `.env.example`. Required / used variables:

| Variable | Purpose |
| --- | --- |
| `DATABASE_URL` | Postgres connection string (required) |
| `JWT_SECRET` | JWT signing secret (falls back to a dev default) |
| `PORT` | HTTP port (default `4001`) |
| `FRONTEND_URL` | Public origin of the Next.js app, used in invite and reset links (default `http://localhost:3000`) |
| `PAYSTACK_SECRET_KEY` | Bank list + account-name resolve |
| `CLOUDINARY_CLOUD_NAME` / `CLOUDINARY_API_KEY` / `CLOUDINARY_API_SECRET` | Receipt uploads |
| `RESEND_API_KEY` | Resend API key. If unset, emails are not delivered and the payload is still returned |
| `RESEND_FROM_EMAIL` | From address (default `Pocket Circle <onboarding@resend.dev>`) |
| `RESEND_DEMO_MODE` | Default **true**. Set to `false` only to treat sends as live |

## Project structure

```
src/auth/            # signup, login, logout, me, forgot/reset password
src/banks/           # Paystack bank list + NUBAN resolve
src/groups/          # groups + create-with-memberEmails
src/members/         # membership, reorder, make-admin
src/cycles/          # active cycle, history, close/handoff
src/contributions/   # upload receipt, confirm, dispute
src/invites/         # create / list / resend / revoke / accept
src/email/           # Resend wrapper — always returns { to, subject, body }
src/notifications/   # per-user inbox
src/activity/        # group timeline
src/reminders/       # in-app contribution reminders
src/admin/           # super-admin stats, users, groups
src/storage/         # Cloudinary
src/prisma/          # Prisma client
prisma/              # schema + migrations
test/                # Jest e2e (supertest)
```

Global prefix: `/api/v1`. `JwtAuthGuard` is global; `@Public()` skips it.

## Scripts

```bash
pnpm start:dev    # watch mode
pnpm start        # one-shot
pnpm start:prod   # migrate + run dist
pnpm build        # prisma generate && nest build
pnpm lint         # eslint (writes fixes)
pnpm test         # unit tests (Jest)
pnpm test:e2e     # e2e tests (needs DATABASE_URL)
pnpm test:cov     # coverage
```

## Auth

- `POST /api/v1/auth/signup` — bcrypt hash (cost 10), optional Paystack name match (`bankVerified` is informational)
- `POST /api/v1/auth/login` — returns `{ user, accessToken }` (7-day JWT)
- `POST /api/v1/auth/forgot-password` — email → 15-minute single-use reset token. A new request supersedes any unused token. Always returns 201 with the email payload (unknown emails get a payload without a token)
- `POST /api/v1/auth/reset-password` — `{ token, password }`. Distinct 400 messages:
  - `This reset link is invalid.`
  - `This reset link has expired.`
  - `This reset link has already been used.`
- Passwords: min 8 characters (same as signup)

## Email (Resend demo mode)

**Resend demo mode is on by default. No real email is being delivered** to arbitrary recipients.

Every successful invite or password-reset send returns:

```
{
  demoMode: true,
  delivered: false,
  deliveryNote: "Resend demo mode: no real email is being delivered. …",
  deliveryError: string | null,  // e.g. missing API key, or sandbox restriction
  email: { to, subject, body }   // the payload that was or would be sent
}
```

Resend test/sandbox keys can only send to the account owner’s verified address. That restriction is surfaced in `deliveryError` when Resend rejects the send; the payload is still returned so the UI can copy it.

Link-only invites (no `inviteeEmail`) do not compose an email (`email: null`).

## Features that exist

- Groups with weekly / biweekly / monthly frequency
- Cycles, collector handoff, contribution receipts (Cloudinary)
- Confirm / dispute payments
- Invites (email or shareable link), resend, revoke, 30-day expiry cron
- In-app notifications + activity feed
- Super-admin overview, users, groups, insights
- Scheduled stale-invite expiry

## Out of scope

- Wallets, escrow, or payment rails
- In-app password change on `PATCH /me`
- Self-leave group endpoint (admins can remove others)

Endpoint inventory: [BACKEND_API_REFERENCE.md](./BACKEND_API_REFERENCE.md)
