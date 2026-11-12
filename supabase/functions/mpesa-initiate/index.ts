// Starts an STK Push prompt on the customer's phone for a tab's balance (or
// a smaller amount). Any logged-in staff member may call this — unlike
// staff-create/staff-reset-pin there's no admin gate, since sending a
// payment prompt during normal service isn't an admin-only action.
import { createClient } from "npm:@supabase/supabase-js@2";
import { verify } from "https://deno.land/x/djwt@v3.0.2/mod.ts";
import { corsHeaders, jsonResponse } from "../_shared/cors.ts";
import { buildPassword, getAccessToken, mpesaBaseUrl, nairobiTimestamp, normalizeKenyanPhone } from "../_shared/mpesa.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const JWT_SECRET = Deno.env.get("APP_JWT_SECRET")!;
const CALLBACK_TOKEN = Deno.env.get("MPESA_CALLBACK_TOKEN")!;
const SHORTCODE = Deno.env.get("MPESA_SHORTCODE")!;
const PASSKEY = Deno.env.get("MPESA_PASSKEY")!;
const TRANSACTION_TYPE = Deno.env.get("MPESA_TRANSACTION_TYPE") ?? "CustomerPayBillOnline";
const PARTY_B = Deno.env.get("MPESA_PARTY_B") ?? SHORTCODE;

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
  let staffId: string | undefined;
  try {
    const payload = (await verify(token, await getVerifyKey())) as { app_metadata?: { staff_id?: string } };
    staffId = payload.app_metadata?.staff_id;
  } catch {
    return jsonResponse({ error: "unauthorized" }, { status: 401 });
  }
  if (!staffId) return jsonResponse({ error: "unauthorized" }, { status: 401 });

  const { tab_id, phone, amount: requestedAmount } = await req.json().catch(() => ({}) as Record<string, unknown>);
  if (!tab_id || !phone) return jsonResponse({ error: "tab_id and phone are required" }, { status: 400 });

  const normalizedPhone = normalizeKenyanPhone(String(phone));
  if (!normalizedPhone) return jsonResponse({ error: "Enter a valid Safaricom number" }, { status: 400 });

  const { data: tab, error: tabError } = await admin
    .from("tabs")
    .select("id, status, table_id, label")
    .eq("id", tab_id)
    .single();
  if (tabError || !tab) return jsonResponse({ error: "Tab not found" }, { status: 404 });
  if (!["open", "pending_payment"].includes(tab.status)) {
    return jsonResponse({ error: "This tab is already settled" }, { status: 409 });
  }

  const { data: totals, error: totalsError } = await admin
    .from("tab_totals")
    .select("balance")
    .eq("tab_id", tab_id)
    .single();
  if (totalsError || !totals) return jsonResponse({ error: "Couldn't compute the balance" }, { status: 500 });

  // Never trust the browser's number for the amount actually charged.
  const balance = Number(totals.balance);
  const requested = requestedAmount ? Number(requestedAmount) : balance;
  const amount = Math.round(Math.min(requested, balance));
  if (!Number.isFinite(amount) || amount < 1) {
    return jsonResponse({ error: "Nothing to pay" }, { status: 400 });
  }

  let tableLabel = tab.label as string | null;
  if (!tableLabel && tab.table_id) {
    const { data: tableRow } = await admin.from("tables").select("label").eq("id", tab.table_id).single();
    tableLabel = tableRow?.label ?? null;
  }
  const accountReference = (tableLabel ?? "Mabeshte").slice(0, 12);

  let accessToken: string;
  try {
    accessToken = await getAccessToken();
  } catch {
    return jsonResponse({ error: "Couldn't reach M-Pesa — try again shortly" }, { status: 502 });
  }

  const timestamp = nairobiTimestamp();
  const password = buildPassword(SHORTCODE, PASSKEY, timestamp);
  const callbackUrl = `${SUPABASE_URL}/functions/v1/mpesa-callback?token=${CALLBACK_TOKEN}`;

  const stkRes = await fetch(`${mpesaBaseUrl()}/mpesa/stkpush/v1/processrequest`, {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      BusinessShortCode: SHORTCODE,
      Password: password,
      Timestamp: timestamp,
      TransactionType: TRANSACTION_TYPE,
      Amount: amount,
      PartyA: normalizedPhone,
      PartyB: PARTY_B,
      PhoneNumber: normalizedPhone,
      CallBackURL: callbackUrl,
      AccountReference: accountReference,
      TransactionDesc: "Mabeshte POS",
    }),
  });
  const stkBody = await stkRes.json().catch(() => ({}) as Record<string, unknown>);
  if (!stkRes.ok || stkBody.ResponseCode !== "0") {
    const message = (stkBody.errorMessage ?? stkBody.ResponseDescription ?? "M-Pesa request failed") as string;
    return jsonResponse({ error: message }, { status: 502 });
  }

  const paymentId = crypto.randomUUID();
  const { error: insertError } = await admin.from("payments").insert({
    id: paymentId,
    tab_id,
    method: "mpesa",
    amount,
    status: "pending",
    mpesa_checkout_request_id: stkBody.CheckoutRequestID,
    recorded_by: staffId,
  });
  if (insertError) return jsonResponse({ error: insertError.message }, { status: 500 });

  await admin.from("tabs").update({ customer_phone: normalizedPhone, status: "pending_payment" }).eq("id", tab_id);

  return jsonResponse({
    payment_id: paymentId,
    checkout_request_id: stkBody.CheckoutRequestID,
    customer_message: stkBody.CustomerMessage ?? "Check your phone and enter your M-Pesa PIN",
  });
});
