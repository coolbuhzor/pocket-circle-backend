# Pocket Circle — Backend API Reference

Inventory of the NestJS API as implemented. Global prefix: `/api/v1`.  
`JwtAuthGuard` is registered as a global `APP_GUARD`; routes marked `@Public()` skip it.

---

## 1. Endpoint list

### Auth

| Method | Full path | Auth required? | Guard(s) applied | Request body shape | Success response shape |
|---|---|---|---|---|---|
| POST | `/api/v1/auth/signup` | No | none (`@Public`) | `SignupDto: { firstName, lastName, middleName?, email, password (min 8), bankName, bankCode, accountNumber (10 digits) }` | `{ user: UserPublic, accessToken: string }` |
| POST | `/api/v1/auth/login` | No | none (`@Public`) | `LoginDto: { email: string, password: string }` | `{ user: UserPublic, accessToken: string }` |
| POST | `/api/v1/auth/forgot-password` | No | none (`@Public`) | `{ email: string }` | `{ ok: true, demoMode, delivered, deliveryNote, deliveryError, email: { to, subject, body } }` |
| POST | `/api/v1/auth/reset-password` | No | none (`@Public`) | `{ token: string, password: string (min 8) }` | `{ ok: true }` — 400 with distinct messages for invalid / expired / already-used tokens |
| POST | `/api/v1/auth/logout` | Yes | `JwtAuthGuard` (global) | none | `{ ok: true }` |
| GET | `/api/v1/me` | Yes | `JwtAuthGuard` (global) | none | `UserPublic` |
| PATCH | `/api/v1/me` | Yes | `JwtAuthGuard` (global) | `UpdateMeDto: { firstName?, lastName?, middleName?, email?, bankName?, bankCode?, accountNumber? (10 digits), notifyEmail?, notifyWhatsApp? }` | `UserPublic` |

`UserPublic` (from `AuthService` `userPublicSelect` — password never returned):

```
{
  id: string
  firstName: string
  lastName: string
  middleName: string | null
  name: string
  email: string
  bankName: string
  bankCode: string
  accountNumber: string
  bankVerified: boolean
  notifyEmail: boolean
  notifyWhatsApp: boolean
  isSuperAdmin: boolean
  lastLoginAt: Date | null
  createdAt: Date
}
```

---

### Users

| Method | Full path | Auth required? | Guard(s) applied | Request body shape | Success response shape |
|---|---|---|---|---|---|
| GET | `/api/v1/users` | Yes | `JwtAuthGuard` (global) | none (query: `ids?: string` — comma-separated UUIDs) | `Array<{ id: string, name: string, email: string, bankName: string, accountNumber: string, createdAt: Date }>` |

---

### Groups

Shared success shape for create / list / get / update — `GroupsService.enrichGroup()`:

```
GroupDetail: {
  id: string
  name: string
  contributionAmount: number
  frequency: Frequency
  createdAt: Date
  memberCount: number
  members: Array<{
    userId: string
    role: Role
    payoutOrder: number
    user: { id: string, name: string, email: string, bankName: string, accountNumber: string }
    contribution: {
      id: string
      payerUserId: string
      amount: number
      status: ContributionStatus
      receiptUrl: string | null
      note: string | null
      disputeReason: string | null
      submittedAt: Date | null
    } | null
    displayStatus: 'paid' | 'disputed' | 'pending' | 'overdue' | null
    isCollector: boolean
  }>
  activeCycle: {
    id: string
    groupId: string
    cycleNumber: number
    collectorUserId: string
    periodStart: Date
    periodEnd: Date
    status: CycleStatus
    collector: { id: string, name: string, bankName: string, accountNumber: string }
    contributions: Array<{
      id: string
      payerUserId: string
      amount: number
      status: ContributionStatus
      receiptUrl: string | null
      note: string | null
      disputeReason: string | null
      submittedAt: Date | null
    }>
  } | null
  myContributionStatus: 'paid' | 'disputed' | 'pending' | 'overdue' | null
  whoseTurn: {
    userId: string
    name: string
    bankName: string
    accountNumber: string
  } | null
}
```

| Method | Full path | Auth required? | Guard(s) applied | Request body shape | Success response shape |
|---|---|---|---|---|---|
| GET | `/api/v1/groups` | Yes | `JwtAuthGuard` (global) | none | `GroupDetail[]` |
| POST | `/api/v1/groups` | Yes | `JwtAuthGuard` (global) | `CreateGroupDto: { name: string, contributionAmount: number, frequency: 'weekly' \| 'biweekly' \| 'monthly' }` | `GroupDetail` |
| GET | `/api/v1/groups/:id` | Yes | `JwtAuthGuard` (global), `GroupMemberGuard` | none | `GroupDetail` |
| PATCH | `/api/v1/groups/:id` | Yes | `JwtAuthGuard` (global), `GroupAdminGuard` | `UpdateGroupDto: { name?: string, contributionAmount?: number, frequency?: 'weekly' \| 'biweekly' \| 'monthly' }` | `GroupDetail` |
| DELETE | `/api/v1/groups/:id` | Yes | `JwtAuthGuard` (global), `GroupAdminGuard` | none | `{ ok: true }` |

---

### Members

Controller prefix: `groups/:id/members`. Class-level `GroupAdminGuard`.

| Method | Full path | Auth required? | Guard(s) applied | Request body shape | Success response shape |
|---|---|---|---|---|---|
| POST | `/api/v1/groups/:id/members/reorder` | Yes | `JwtAuthGuard` (global), `GroupAdminGuard` | `ReorderMembersDto: { userIds: string[] }` (UUIDs, every member exactly once) | `Array<{ groupId: string, userId: string, role: Role, payoutOrder: number, user: { id: string, name: string, email: string } }>` |
| POST | `/api/v1/groups/:id/members/:userId/make-admin` | Yes | `JwtAuthGuard` (global), `GroupAdminGuard` | none | `{ groupId: string, userId: string, role: Role, payoutOrder: number, user: { id: string, name: string, email: string } }` |
| DELETE | `/api/v1/groups/:id/members/:userId` | Yes | `JwtAuthGuard` (global), `GroupAdminGuard` | none | `{ ok: true }` |

---

### Cycles

| Method | Full path | Auth required? | Guard(s) applied | Request body shape | Success response shape |
|---|---|---|---|---|---|
| GET | `/api/v1/groups/:id/cycles` | Yes | `JwtAuthGuard` (global), `GroupMemberGuard` | none | `Array<Cycle & { collector: { id: string, name: string, bankName: string, accountNumber: string } }>` (completed only) |
| GET | `/api/v1/groups/:id/cycles/active` | Yes | `JwtAuthGuard` (global), `GroupMemberGuard` | none | `Cycle & { collector: { id: string, name: string, email: string, bankName: string, accountNumber: string }, contributions: Contribution[] }` |
| POST | `/api/v1/groups/:id/cycles/close` | Yes | `JwtAuthGuard` (global), `CollectorOrAdminGuard` (`@ResolveCycleFrom('activeByGroup')`) | none | `{ completedCycle: Cycle, activeCycle: Cycle & { collector: { id: string, name: string, bankName: string, accountNumber: string } } }` |
| GET | `/api/v1/cycles/:id/summary` | Yes | `JwtAuthGuard` (global), `GroupMemberGuard` (`@ResolveGroupFrom('cycle')`) | none | `{ cycle: { id: string, groupId: string, cycleNumber: number, collectorUserId: string, periodStart: Date, periodEnd: Date, status: CycleStatus, contributionAmount: number }, members: Array<{ userId: string, name: string, email: string, amount: number, contribution: Contribution \| null, displayStatus: 'paid' \| 'disputed' \| 'pending' \| 'overdue' }> }` |

`Cycle` (Prisma model fields):

```
{
  id: string
  groupId: string
  cycleNumber: number
  collectorUserId: string
  periodStart: Date
  periodEnd: Date
  status: CycleStatus
}
```

---

### Contributions

`Contribution` (Prisma model — returned by upload / confirm / dispute):

```
{
  id: string
  cycleId: string
  payerUserId: string
  amount: number
  receiptUrl: string | null
  note: string | null
  status: ContributionStatus
  disputeReason: string | null
  submittedAt: Date | null
  reviewedAt: Date | null
  reviewedByUserId: string | null
}
```

| Method | Full path | Auth required? | Guard(s) applied | Request body shape | Success response shape |
|---|---|---|---|---|---|
| GET | `/api/v1/cycles/:id/contributions` | Yes | `JwtAuthGuard` (global), `GroupMemberGuard` (`@ResolveGroupFrom('cycle')`) | none | `Array<Contribution & { payer: { id: string, name: string, email: string } }>` |
| POST | `/api/v1/cycles/:id/contributions` | Yes | `JwtAuthGuard` (global), `GroupMemberGuard` (`@ResolveGroupFrom('cycle')`) | multipart — see §2; DTO fields: `CreateContributionDto: { amount: number, note?: string }` + file field `receipt` | `Contribution` (with `receiptUrl` set) |
| POST | `/api/v1/contributions/:id/confirm` | Yes | `JwtAuthGuard` (global), `CycleCollectorGuard` (`@ResolveCycleFrom('contribution')`) | none | `Contribution` |
| POST | `/api/v1/contributions/:id/dispute` | Yes | `JwtAuthGuard` (global), `CycleCollectorGuard` (`@ResolveCycleFrom('contribution')`) | `DisputeContributionDto: { reason: string }` | `Contribution` |

---

### Reminders

| Method | Full path | Auth required? | Guard(s) applied | Request body shape | Success response shape |
|---|---|---|---|---|---|
| POST | `/api/v1/cycles/:id/reminders` | Yes | `JwtAuthGuard` (global), `CycleCollectorGuard` | `SendReminderDto: { toUserId: string }` | `{ activity: ActivityEvent, notification: Notification }` |

---

### Invites

| Method | Full path | Auth required? | Guard(s) applied | Request body shape | Success response shape |
|---|---|---|---|---|---|
| POST | `/api/v1/groups/:id/invites` | Yes | `JwtAuthGuard` (global), `GroupAdminGuard` | none | `Invite: { token: string, groupId: string, invitedByUserId: string, expiresAt: Date, status: InviteStatus }` |
| GET | `/api/v1/invites/:token` | No | none (`@Public`) | none | `{ token: string, expiresAt: Date, group: { id: string, name: string, contributionAmount: number }, inviter: { id: string, name: string } }` |
| POST | `/api/v1/invites/:token/accept` | Yes | `JwtAuthGuard` (global) | none | `{ groupId: string, userId: string, role: Role, payoutOrder: number, user: { id: string, name: string, email: string } }` |

---

### Activity

| Method | Full path | Auth required? | Guard(s) applied | Request body shape | Success response shape |
|---|---|---|---|---|---|
| GET | `/api/v1/groups/:id/activity` | Yes | `JwtAuthGuard` (global), `GroupMemberGuard` | none | `Array<ActivityEvent & { actor: { id: string, name: string }, target: { id: string, name: string } \| null }>` |

`ActivityEvent` (Prisma):

```
{
  id: string
  groupId: string
  type: ActivityType
  actorUserId: string
  targetUserId: string | null
  cycleId: string | null
  message: string
  createdAt: Date
}
```

---

### Notifications

`Notification` (Prisma):

```
{
  id: string
  userId: string
  groupId: string | null
  type: NotificationType
  title: string
  body: string
  href: string | null
  read: boolean
  createdAt: Date
}
```

| Method | Full path | Auth required? | Guard(s) applied | Request body shape | Success response shape |
|---|---|---|---|---|---|
| GET | `/api/v1/notifications` | Yes | `JwtAuthGuard` (global) | none | `Notification[]` |
| GET | `/api/v1/notifications/unread-count` | Yes | `JwtAuthGuard` (global) | none | `{ count: number }` |
| POST | `/api/v1/notifications/read-all` | Yes | `JwtAuthGuard` (global) | none | `{ ok: true }` |
| POST | `/api/v1/notifications/:id/read` | Yes | `JwtAuthGuard` (global) | none | `Notification` |

---

### Admin

All routes: `JwtAuthGuard` + `SuperAdminGuard` (controller-level). Query DTO for list endpoints:

```
AdminListQueryDto: { search?: string, page?: number (default 1), limit?: number (default 20, max 100) }
```

| Method | Full path | Auth required? | Guard(s) applied | Request body shape | Success response shape |
|---|---|---|---|---|---|
| GET | `/api/v1/admin/users` | Yes (super admin) | `JwtAuthGuard`, `SuperAdminGuard` | none (query: `AdminListQueryDto`) | `{ data: Array<{ id: string, name: string, email: string, createdAt: Date, lastLoginAt: Date \| null, groupCount: number, totalContributed: number, totalCollected: number }>, meta: { page: number, limit: number, total: number, totalPages: number } }` |
| GET | `/api/v1/admin/users/:id` | Yes (super admin) | `JwtAuthGuard`, `SuperAdminGuard` | none | `{ id, name, email, bankName, accountNumber, notifyEmail, notifyWhatsApp, isSuperAdmin, lastLoginAt, createdAt, groups: Array<{ groupId, role, payoutOrder, group: { id, name, contributionAmount, frequency } }>, contributions: Array<Contribution & { cycle: { id, cycleNumber, groupId, periodStart, periodEnd, group: { id, name } } }> }` |
| GET | `/api/v1/admin/groups` | Yes (super admin) | `JwtAuthGuard`, `SuperAdminGuard` | none (query: `AdminListQueryDto`) | `{ data: Array<{ id, name, contributionAmount, frequency, memberCount, currentCycleNumber: number \| null, currentCollectorName: string \| null, totalConfirmedCollected: number, createdAt }>, meta: { page, limit, total, totalPages } }` |
| GET | `/api/v1/admin/groups/:id` | Yes (super admin) | `JwtAuthGuard`, `SuperAdminGuard` | none | Full Prisma `Group` with `members` (incl. `user`), `cycles` (incl. `collector`, `contributions` with `payer`/`reviewer`), and `activity` (incl. `actor`/`target`) |
| GET | `/api/v1/admin/stats/overview` | Yes (super admin) | `JwtAuthGuard`, `SuperAdminGuard` | none | `{ totalUsers: number, totalGroups: number, totalActiveCycles: number, totalCompletedCycles: number, totalConfirmedVolume: number, totalPendingAmount: number, totalDisputedAmount: number, totalOverdueCount: number }` |
| GET | `/api/v1/admin/stats/growth` | Yes (super admin) | `JwtAuthGuard`, `SuperAdminGuard` | none | `{ byDay: { users: Array<{ date: string, count: number }>, groups: Array<{ date: string, count: number }> }, byMonth: { users: Array<{ month: string, count: number }>, groups: Array<{ month: string, count: number }> } }` |
| GET | `/api/v1/admin/stats/financial` | Yes (super admin) | `JwtAuthGuard`, `SuperAdminGuard` | none | `{ byGroup: Array<{ groupId: string, groupName: string, totalConfirmedVolume: number }>, byFrequency: Array<{ frequency: string, totalConfirmedVolume: number }> }` |
| GET | `/api/v1/admin/stats/engagement` | Yes (super admin) | `JwtAuthGuard`, `SuperAdminGuard` | none | `{ inviteAcceptanceRate: number, averageGroupSize: number, averageCompletedCyclesPerGroup: number, disputeRate: number, averageTimeToPaymentMs: number \| null, averageTimeToPaymentHours: number \| null }` |

---

## 2. File upload endpoints

| Method | Path | Content-Type | File field name | Accepted types | Response URL field |
|---|---|---|---|---|---|
| POST | `/api/v1/cycles/:id/contributions` | `multipart/form-data` | `receipt` | **Not restricted in code.** Swagger describes “Receipt image or PDF”; `CloudinaryStorageService` accepts any buffer (`resource_type: 'auto'`), with image-specific quality transforms when `mimetype` starts with `image/`. Service layer requires the file (`BadRequestException` if missing). | Stored on the returned `Contribution` as `receiptUrl` (Cloudinary `secure_url` / derived image URL) |

Other multipart fields on the same request: `amount` (required integer), `note` (optional string).

---

## 3. Enums

Exact values from `prisma/schema.prisma`:

### `Role`
- `admin`
- `member`

### `Frequency`
- `weekly`
- `biweekly`
- `monthly`

### `CycleStatus`
- `active`
- `completed`

### `ContributionStatus`
- `pending`
- `confirmed`
- `disputed`

### `InviteStatus`
- `active`
- `expired`
- `accepted`

### `ActivityType`
- `member_joined`
- `receipt_uploaded`
- `payment_confirmed`
- `payment_disputed`
- `reminder_sent`
- `cycle_started`
- `cycle_completed`
- `turn_changed`

### `NotificationType`
- `your_turn`
- `receipt_uploaded`
- `payment_confirmed`
- `payment_disputed`
- `reminder`
- `invite_accepted`
- `cycle_started`

**Not a Prisma enum** — derived display status used in group/member/cycle responses (`deriveContributionDisplayStatus`):

- `paid`
- `disputed`
- `pending`
- `overdue`

---

## 4. Auth mechanics

**Login / signup success**

Both `POST /api/v1/auth/login` and `POST /api/v1/auth/signup` return:

```json
{
  "user": { /* UserPublic */ },
  "accessToken": "<jwt>"
}
```

The token field name is `accessToken`. JWT payload is `{ sub: userId, email }`, signed with `JWT_SECRET` (fallback `dev-jwt-secret-change-me`), expiry `7d`. Successful login also updates `user.lastLoginAt`.

**Subsequent requests**

Send the JWT as a Bearer token:

```http
Authorization: Bearer <accessToken>
```

Extracted via Passport JWT (`ExtractJwt.fromAuthHeaderAsBearerToken()`).

**401 Unauthorized**

`JwtAuthGuard.handleRequest` throws Nest’s `UnauthorizedException` when the token is missing/invalid or the user cannot be resolved. Typical JSON body:

```json
{
  "statusCode": 401,
  "message": "Authentication required",
  "error": "Unauthorized"
}
```

Other auth-related 401 messages from this codebase:

- `"Invalid email or password"` — failed login
- `"User not found"` — JWT `sub` no longer maps to a user (`JwtStrategy.validate`)

**Logout**

`POST /api/v1/auth/logout` requires a valid JWT but does not revoke/blacklist tokens server-side; it returns `{ ok: true }`. Clients should discard `accessToken`.

**Super admin**

Same login as any user. `user.isSuperAdmin` (and JWT-validated `req.user.isSuperAdmin`) gates `/api/v1/admin/*`. Non–super-admins receive `403` with message `"Super admin access required"`. There is no API to set `isSuperAdmin`.

---

## 5. Known gaps or inconsistencies

### Gaps

- **No in-app password change** — `UpdateMeDto` cannot update `password`; use `POST /auth/forgot-password` then `POST /auth/reset-password`.
- **No self-leave / leave-group endpoint** — `DELETE /groups/:id/members/:userId` explicitly rejects removing yourself; no alternate leave route exists.
- **No avatar field** — original Users module brief mentioned resolving “names/avatars”; the schema and `GET /users` responses have no avatar URL.
- **No API to grant/revoke `isSuperAdmin`** — intentional (DB-only), not a missing feature to add via HTTP.
- **Marketing / landing routes** — original auth notes carved out “landing/marketing pages”; only a public health check exists at `GET /api/v1/` (`AppController`), outside the module groups above.

### Inconsistencies

- **Invite path wording in the original prompt** — Auth section said public `/invite/:token` (singular); modules section and implementation use `/api/v1/invites/:token` (plural).
- **Receipt MIME types** — Swagger documents “image or PDF,” but neither the controller nor `CloudinaryStorageService` enforce a whitelist; any uploaded buffer may be accepted.
- **Receipt required vs optional in OpenAPI** — multipart schema marks only `amount` as required; `ContributionsService.upload` still requires `receipt` and returns 400 if omitted.
- **Storage vs original contract** — original build prompt specified local `uploads/` storage; runtime uses Cloudinary (`receiptUrl` is a remote URL). Callers should not assume a relative `/uploads/...` path.
- **`UpdateGroupDto.contributionAmount`** — lacks `@Type(() => Number)` present on `CreateGroupDto`; relies on global `enableImplicitConversion` for string→number coercion.
- **Admin double JWT guard** — `AdminController` re-applies `JwtAuthGuard` even though it is already global; behavior is correct but redundant.
- **Derived vs stored contribution status** — API consumers must distinguish Prisma `ContributionStatus` (`pending` \| `confirmed` \| `disputed`) from UI display status (`paid` \| `disputed` \| `pending` \| `overdue`). Confirmed maps to display `paid`.
)
