// Fallback for when Daraja's callback never arrives (or arrives before the
// client's realtime subscription/poll picks it up): actively asks Daraja
// for the STK push's current status and settles the local row from it.
import { createClient } from "npm:@supabase/supabase-js@2";
import { verify } from "https://deno.land/x/djwt@v3.0.2/mod.ts";
import { corsHeaders, jsonResponse } from "../_shared/cors.ts";
import { buildPassword, describeResultCode, getAccessToken, mpesaBaseUrl, nairobiTimestamp } from "../_shared/mpesa.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const JWT_SECRET = Deno.env.get("APP_JWT_SECRET")!;
const SHORTCODE = Deno.env.get("MPESA_SHORTCODE")!;
const PASSKEY = Deno.env.get("MPESA_PASSKEY")!;

const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

let verifyKey: CryptoKey | null = null;
async function getVerifyKey(): Promise<CryptoKey> {
  if (verifyKey) return verifyKey;
  verifyKey = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(JWT_SECRET),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["verify"],
  );
  return verifyKey;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return jsonResponse({ error: "method_not_allowed" }, { status: 405 });

  const token = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
  try {
    await verify(token, await getVerifyKey());
  } catch {
    return jsonResponse({ error: "unauthorized" }, { status: 401 });
  }

  const { checkout_request_id } = await req.json().catch(() => ({}) as Record<string, unknown>);
  if (!checkout_request_id) return jsonResponse({ error: "checkout_request_id is required" }, { status: 400 });

  const { data: payment, error } = await admin
    .from("payments")
    .select("id, status, mpesa_receipt_number, failure_reason")
    .eq("mpesa_checkout_request_id", checkout_request_id)
    .single();
  if (error || !payment) return jsonResponse({ error: "Payment not found" }, { status: 404 });

  if (payment.status !== "pending") {
    return jsonResponse({ status: payment.status, receipt: payment.mpesa_receipt_number, failure_reason: payment.failure_reason });
  }

  let accessToken: string;
  try {
    accessToken = await getAccessToken();
  } catch {
    return jsonResponse({ status: "pending" }); // couldn't reach Daraja — client keeps polling/waiting
  }

  const timestamp = nairobiTimestamp();
  const password = buildPassword(SHORTCODE, PASSKEY, timestamp);

  const queryRes = await fetch(`${mpesaBaseUrl()}/mpesa/stkpushquery/v1/query`, {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      BusinessShortCode: SHORTCODE,
      Password: password,
      Timestamp: timestamp,
      CheckoutRequestID: checkout_request_id,
    }),
  });
  const queryBody = await queryRes.json().catch(() => ({}) as Record<string, unknown>);

  // Daraja answers "still being processed" as a non-2xx/errorCode response,
  // not a clean ResultCode — treat anything unparseable as still pending.
  if (!queryRes.ok || queryBody.ResultCode === undefined || queryBody.ResultCode === null) {
    return jsonResponse({ status: "pending" });
  }

  const resultCode = Number(queryBody.ResultCode);
  if (resultCode === 0) {
    await admin.from("payments").update({ status: "completed", completed_at: new Date().toISOString() }).eq("id", payment.id);
    return jsonResponse({ status: "completed" });
  }

  const reason = describeResultCode(resultCode, (queryBody.ResultDesc as string) ?? "Payment failed");
  await admin.from("payments").update({ status: "failed", failure_reason: reason }).eq("id", payment.id);
  return jsonResponse({ status: "failed", failure_reason: reason });
});
