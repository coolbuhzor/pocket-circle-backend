export type EmailPayload = {
  to: string;
  subject: string;
  body: string;
};

export type EmailSendResult = {
  demoMode: boolean;
  delivered: boolean;
  payload: EmailPayload;
  deliveryNote: string;
  deliveryError: string | null;
};

export const RESEND_DEMO_NOTE =
  'Resend demo mode: no real email is being delivered. Resend test/sandbox keys can only send to the account owner’s verified address.';
