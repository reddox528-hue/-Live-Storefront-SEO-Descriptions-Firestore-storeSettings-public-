export const BREVO_API_ENDPOINT = 'https://api.brevo.com/v3/smtp/email';

export type BrevoFetchResponse = {
  ok: boolean;
  status: number;
  json: () => Promise<any>;
};

export type BrevoFetchFn = (
  url: string,
  init: {
    method: string;
    headers: Record<string, string>;
    body: string;
  }
) => Promise<BrevoFetchResponse>;

export interface BrevoSendInput {
  apiKey: string;
  senderEmail: string;
  senderName?: string;
  toEmail: string;
  toName?: string;
  replyToEmail?: string;
  subject: string;
  htmlContent: string;
  headers?: Record<string, string>;
  fetchImpl?: BrevoFetchFn;
}

export interface BrevoSendResult {
  ok: boolean;
  statusCode: number;
  messageId: string;
  status: 'sent' | 'failed';
  deliveryStatus: 'accepted_by_provider' | 'failed';
  failureReason: string;
}

export function isValidEmailAddress(email: string | undefined | null): boolean {
  if (!email) return false;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
}

export function buildBrevoPayload(input: {
  senderEmail: string;
  senderName?: string;
  toEmail: string;
  toName?: string;
  replyToEmail?: string;
  subject: string;
  htmlContent: string;
  headers?: Record<string, string>;
}): Record<string, any> {
  const cleanSenderName = String(input.senderName || 'KoraMarket Nigeria').trim() || 'KoraMarket Nigeria';
  const cleanSenderEmail = String(input.senderEmail || '').trim();
  const cleanToEmail = String(input.toEmail || '').trim();
  const cleanToName = String(input.toName || '').trim();
  const cleanReplyTo = String(input.replyToEmail || '').trim();

  const payload: Record<string, any> = {
    sender: {
      name: cleanSenderName,
      email: cleanSenderEmail,
    },
    to: [
      {
        email: cleanToEmail,
        ...(cleanToName ? { name: cleanToName } : {}),
      },
    ],
    subject: String(input.subject || 'Order Notification'),
    htmlContent: String(input.htmlContent || `<p>${String(input.subject || 'Order Notification')}</p>`),
  };

  if (isValidEmailAddress(cleanReplyTo)) {
    payload.replyTo = { email: cleanReplyTo };
  }

  if (input.headers && Object.keys(input.headers).length > 0) {
    payload.headers = input.headers;
  }

  return payload;
}

export async function sendBrevoTransactionalEmail(input: BrevoSendInput): Promise<BrevoSendResult> {
  const apiKey = String(input.apiKey || '').trim();
  if (!apiKey) {
    return {
      ok: false,
      statusCode: 0,
      messageId: '',
      status: 'failed',
      deliveryStatus: 'failed',
      failureReason:
        'Email provider not configured: BREVO_API_KEY secret is not set in Firebase Functions.',
    };
  }

  const senderEmail = String(input.senderEmail || '').trim();
  if (!isValidEmailAddress(senderEmail)) {
    return {
      ok: false,
      statusCode: 0,
      messageId: '',
      status: 'failed',
      deliveryStatus: 'failed',
      failureReason:
        'Verified sender email is not configured. Set Sender Email in Admin Email Settings or BREVO_FROM_EMAIL env var.',
    };
  }

  const toEmail = String(input.toEmail || '').trim();
  if (!isValidEmailAddress(toEmail)) {
    return {
      ok: false,
      statusCode: 0,
      messageId: '',
      status: 'failed',
      deliveryStatus: 'failed',
      failureReason: `Invalid recipient email address: "${toEmail}".`,
    };
  }

  const fetchFn: BrevoFetchFn | undefined =
    input.fetchImpl || (typeof (globalThis as any).fetch === 'function' ? (globalThis as any).fetch : undefined);

  if (!fetchFn) {
    return {
      ok: false,
      statusCode: 0,
      messageId: '',
      status: 'failed',
      deliveryStatus: 'failed',
      failureReason: 'Server runtime fetch API unavailable for Brevo HTTP request.',
    };
  }

  const payload = buildBrevoPayload({
    senderEmail,
    senderName: input.senderName,
    toEmail,
    toName: input.toName,
    replyToEmail: input.replyToEmail,
    subject: input.subject,
    htmlContent: input.htmlContent,
    headers: input.headers,
  });

  try {
    const res = await fetchFn(BREVO_API_ENDPOINT, {
      method: 'POST',
      headers: {
        accept: 'application/json',
        'content-type': 'application/json',
        'api-key': apiKey,
      },
      body: JSON.stringify(payload),
    });

    const json: any = await res.json().catch(() => ({}));
    if (!res.ok) {
      const apiErr = json?.message || json?.code || json?.error || `Brevo HTTP ${res.status}`;
      return {
        ok: false,
        statusCode: res.status,
        messageId: '',
        status: 'failed',
        deliveryStatus: 'failed',
        failureReason: String(apiErr),
      };
    }

    // Brevo accepted the transactional send request and returned a messageId.
    // Final inbox delivery status is updated separately via brevoWebhook events.
    return {
      ok: true,
      statusCode: res.status,
      messageId: String(json?.messageId || '').trim(),
      status: 'sent',
      deliveryStatus: 'accepted_by_provider',
      failureReason: '',
    };
  } catch (err: any) {
    return {
      ok: false,
      statusCode: 0,
      messageId: '',
      status: 'failed',
      deliveryStatus: 'failed',
      failureReason: err?.message || 'Network exception communicating with Brevo API.',
    };
  }
}

export function mapBrevoWebhookEventToDeliveryStatus(
  eventName: string | undefined | null
): 'delivered' | 'bounced' | 'accepted_by_provider' | null {
  const normalized = String(eventName || '').trim().toLowerCase();
  if (!normalized) return null;
  if (normalized === 'delivered') return 'delivered';
  if (
    normalized === 'hard_bounce' ||
    normalized === 'soft_bounce' ||
    normalized === 'blocked' ||
    normalized === 'spam' ||
    normalized === 'invalid_email' ||
    normalized === 'unsubscribed' ||
    normalized === 'error'
  ) {
    return 'bounced';
  }
  if (normalized === 'deferred' || normalized === 'request' || normalized === 'sent') {
    return 'accepted_by_provider';
  }
  return null;
}
