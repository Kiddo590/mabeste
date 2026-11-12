// Shared Daraja (M-Pesa) helpers for mpesa-initiate, mpesa-callback and
// mpesa-query. Nairobi has no DST, so the timestamp Daraja wants is just
// UTC+3 by fixed offset, not a timezone database lookup.

const SANDBOX_BASE = "https://sandbox.safaricom.co.ke";
const PRODUCTION_BASE = "https://api.safaricom.co.ke";

export function mpesaBaseUrl(): string {
  return Deno.env.get("MPESA_ENV") === "production" ? PRODUCTION_BASE : SANDBOX_BASE;
}

export function nairobiTimestamp(date: Date = new Date()): string {
  const nairobi = new Date(date.getTime() + 3 * 60 * 60 * 1000);
  const pad = (n: number) => String(n).padStart(2, "0");
  return (
    `${nairobi.getUTCFullYear()}${pad(nairobi.getUTCMonth() + 1)}${pad(nairobi.getUTCDate())}` +
    `${pad(nairobi.getUTCHours())}${pad(nairobi.getUTCMinutes())}${pad(nairobi.getUTCSeconds())}`
  );
}

export function buildPassword(shortcode: string, passkey: string, timestamp: string): string {
  return btoa(`${shortcode}${passkey}${timestamp}`);
}

let cachedToken: { token: string; expiresAt: number } | null = null;

export async function getAccessToken(): Promise<string> {
  if (cachedToken && cachedToken.expiresAt > Date.now() + 5000) return cachedToken.token;

  const consumerKey = Deno.env.get("MPESA_CONSUMER_KEY")!;
  const consumerSecret = Deno.env.get("MPESA_CONSUMER_SECRET")!;
  const credentials = btoa(`${consumerKey}:${consumerSecret}`);

  const res = await fetch(`${mpesaBaseUrl()}/oauth/v1/generate?grant_type=client_credentials`, {
    headers: { Authorization: `Basic ${credentials}` },
  });
  if (!res.ok) throw new Error(`mpesa_oauth_failed_${res.status}`);
  const body = await res.json();
  const expiresInMs = (Number(body.expires_in) || 3600) * 1000;
  cachedToken = { token: body.access_token, expiresAt: Date.now() + expiresInMs };
  return cachedToken.token;
}

// Deno functions can't import from the Next.js app's lib/ directory, so this
// mirrors lib/phone.ts's normalizeKenyanPhone.
export function normalizeKenyanPhone(input: string): string | null {
  const digits = input.replace(/[^\d]/g, "");
  if (/^254[17]\d{8}$/.test(digits)) return digits;
  if (/^0[17]\d{8}$/.test(digits)) return `254${digits.slice(1)}`;
  if (/^[17]\d{8}$/.test(digits)) return `254${digits}`;
  return null;
}

const RESULT_CODE_MESSAGES: Record<number, string> = {
  1: "Insufficient funds",
  1032: "Cancelled on the customer's phone",
  1037: "Customer didn't respond in time",
  2001: "Wrong M-Pesa PIN entered",
};

export function describeResultCode(code: number, fallback: string): string {
  return RESULT_CODE_MESSAGES[code] ?? fallback;
}
