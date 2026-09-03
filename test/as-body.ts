export function asBody<T>(res: { body: unknown }): T {
  return res.body as T;
}

export function containing(text: string): string {
  const matcher: unknown = expect.stringContaining(text);
  return matcher as string;
}

export function containingObject<T extends object>(value: T): T {
  const matcher: unknown = expect.objectContaining(value);
  return matcher as T;
}

export type EmailPayloadBody = {
  to: string;
  subject: string;
  body: string;
};

export type ForgotPasswordBody = {
  ok: boolean;
  demoMode: boolean;
  delivered: boolean;
  deliveryNote: string;
  deliveryError: string | null;
  email: EmailPayloadBody;
};

export type ResetErrorBody = {
  message: string;
};

export type SignupBody = {
  accessToken: string;
  user: { id: string };
};

export type InviteCreateBody = {
  token: string;
  groupId?: string;
  inviteeEmail?: string | null;
  matchedExistingUser?: boolean;
  status?: string;
  demoMode?: boolean;
  deliveryNote?: string;
  email?: EmailPayloadBody | null;
  expiresAt?: string;
  effectiveStatus?: string;
};

export type InviteListRow = {
  token: string;
  inviteeEmail?: string | null;
  status: string;
  effectiveStatus: string;
  invitedBy?: { name: string };
};

export type InviteViewBody = {
  token: string;
  status: string;
  group: { id: string };
  inviter?: { name: string };
};

export type CreateGroupBody = {
  id: string;
  invitesSent: Array<{
    email: string;
    matchedExistingUser: boolean;
    demoMode?: boolean;
    emailPayload?: EmailPayloadBody | null;
  }>;
};

export type E2eBody = SignupBody &
  InviteCreateBody &
  InviteViewBody &
  ResetErrorBody &
  CreateGroupBody & {
    length?: number;
  };

export type E2eList = InviteListRow[];
