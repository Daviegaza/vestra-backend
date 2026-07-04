import crypto from 'crypto';

/**
 * Safaricom Daraja 3.0 STK Push helpers. Only the request builders
 * live here — HTTP dispatch is wired in the route handler so tests
 * can stub `fetch` cleanly.
 *
 * NOTE: this is a stub scaffold. Live use requires:
 *  - DARAJA_CONSUMER_KEY / SECRET
 *  - DARAJA_SHORTCODE + DARAJA_PASSKEY
 *  - DARAJA_CALLBACK_URL (must be publicly reachable HTTPS)
 *  - DARAJA_ENV = "sandbox" | "production"
 * All financial POSTs that trigger STK Push MUST use
 * Idempotency-Key to prevent double-charge on retries.
 */

export interface DarajaConfig {
  consumerKey?: string;
  consumerSecret?: string;
  shortcode?: string;
  passkey?: string;
  callbackUrl?: string;
  env: 'sandbox' | 'production';
}

export function readDarajaConfig(): DarajaConfig {
  return {
    consumerKey: process.env.DARAJA_CONSUMER_KEY,
    consumerSecret: process.env.DARAJA_CONSUMER_SECRET,
    shortcode: process.env.DARAJA_SHORTCODE,
    passkey: process.env.DARAJA_PASSKEY,
    callbackUrl: process.env.DARAJA_CALLBACK_URL,
    env: (process.env.DARAJA_ENV as 'sandbox' | 'production') || 'sandbox',
  };
}

export function isDarajaConfigured(cfg: DarajaConfig = readDarajaConfig()): boolean {
  return Boolean(
    cfg.consumerKey && cfg.consumerSecret && cfg.shortcode && cfg.passkey && cfg.callbackUrl,
  );
}

function darajaBaseUrl(env: DarajaConfig['env']): string {
  return env === 'production'
    ? 'https://api.safaricom.co.ke'
    : 'https://sandbox.safaricom.co.ke';
}

interface AccessTokenResponse {
  access_token: string;
  expires_in: string;
}

let cachedToken: { token: string; expiresAt: number } | null = null;

export async function getDarajaAccessToken(cfg: DarajaConfig = readDarajaConfig()): Promise<string> {
  if (!isDarajaConfigured(cfg)) throw new Error('Daraja not configured');
  if (cachedToken && cachedToken.expiresAt > Date.now() + 30_000) return cachedToken.token;

  const auth = Buffer.from(`${cfg.consumerKey}:${cfg.consumerSecret}`).toString('base64');
  const res = await fetch(`${darajaBaseUrl(cfg.env)}/oauth/v1/generate?grant_type=client_credentials`, {
    headers: { Authorization: `Basic ${auth}` },
  });
  if (!res.ok) throw new Error(`Daraja auth failed: ${res.status}`);
  const body = (await res.json()) as AccessTokenResponse;
  cachedToken = {
    token: body.access_token,
    expiresAt: Date.now() + Number(body.expires_in) * 1000,
  };
  return body.access_token;
}

function timestamp(now = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return (
    now.getFullYear().toString() +
    pad(now.getMonth() + 1) +
    pad(now.getDate()) +
    pad(now.getHours()) +
    pad(now.getMinutes()) +
    pad(now.getSeconds())
  );
}

export interface StkPushInput {
  amount: number;
  msisdn: string; // 2547XXXXXXXX
  accountReference: string;
  transactionDesc: string;
}

export interface StkPushResponse {
  MerchantRequestID: string;
  CheckoutRequestID: string;
  ResponseCode: string;
  ResponseDescription: string;
  CustomerMessage: string;
}

export async function stkPush(
  input: StkPushInput,
  cfg: DarajaConfig = readDarajaConfig(),
): Promise<StkPushResponse> {
  if (!isDarajaConfigured(cfg)) throw new Error('Daraja not configured');
  const ts = timestamp();
  const password = Buffer.from(`${cfg.shortcode}${cfg.passkey}${ts}`).toString('base64');
  const token = await getDarajaAccessToken(cfg);

  const res = await fetch(`${darajaBaseUrl(cfg.env)}/mpesa/stkpush/v1/processrequest`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      BusinessShortCode: cfg.shortcode,
      Password: password,
      Timestamp: ts,
      TransactionType: 'CustomerPayBillOnline',
      Amount: Math.round(input.amount),
      PartyA: input.msisdn,
      PartyB: cfg.shortcode,
      PhoneNumber: input.msisdn,
      CallBackURL: cfg.callbackUrl,
      AccountReference: input.accountReference.slice(0, 12),
      TransactionDesc: input.transactionDesc.slice(0, 13),
    }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`STK push failed: ${res.status} ${text}`);
  }
  return (await res.json()) as StkPushResponse;
}

/**
 * Daraja does not sign callbacks by default. Recommended defense:
 * bind the callback URL to an unguessable secret path (e.g.
 * `/mpesa/callback/<CALLBACK_SECRET>`) and additionally verify by
 * fetching transaction status via /mpesa/stkpushquery.
 */
export function verifyCallbackSecret(pathSecret: string): boolean {
  const expected = process.env.DARAJA_CALLBACK_SECRET;
  if (!expected) return false;
  try {
    return crypto.timingSafeEqual(
      Buffer.from(pathSecret.padEnd(64, '0').slice(0, 64)),
      Buffer.from(expected.padEnd(64, '0').slice(0, 64)),
    );
  } catch {
    return false;
  }
}

/**
 * Normalize a Kenyan phone into 254XXXXXXXXX format required by Daraja.
 * Accepts: +254712345678, 254712345678, 0712345678.
 */
export function normalizeMsisdn(raw: string): string | null {
  const digits = raw.replace(/\D/g, '');
  if (digits.length === 12 && digits.startsWith('254')) return digits;
  if (digits.length === 10 && digits.startsWith('0')) return '254' + digits.slice(1);
  if (digits.length === 9 && (digits.startsWith('7') || digits.startsWith('1'))) return '254' + digits;
  return null;
}
