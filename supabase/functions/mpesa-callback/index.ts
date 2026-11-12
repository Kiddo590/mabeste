// Safaricom's Daraja callback — no Supabase auth header is sent, so the
// gateway's JWT check is disabled for this function (see config.toml) and a
// shared ?token= query param stands in as the auth check instead. Always
// answers 200/ResultCode 0 so Daraja doesn't keep retrying a callback whose
// payment row we either can't find or have already settled.
import { createClient } from "npm:@supabase/supabase-js@2";
import { jsonResponse } from "../_shared/cors.ts";
import { describeResultCode } from "../_shared/mpesa.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const CALLBACK_TOKEN = Deno.env.get("MPESA_CALLBACK_TOKEN")!;

const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

const ACCEPT = { ResultCode: 0, ResultDesc: "Accepted" };

type StkCallbackItem = { Name: string; Value?: string | number };
type StkCallback = {
  CheckoutRequestID?: string;
  ResultCode?: number;
  ResultDesc?: string;
  CallbackMetadata?: { Item?: StkCallbackItem[] };
};

Deno.serve(async (req) => {
  const url = new URL(req.url);
  if (url.searchParams.get("token") !== CALLBACK_TOKEN) {
    return jsonResponse({ error: "unauthorized" }, { status: 401 });
  }
  if (req.method !== "POST") return jsonResponse(ACCEPT);

  const body = await req.json().catch(() => null);
  const callback = body?.Body?.stkCallback as StkCallback | undefined;
  if (!callback?.CheckoutRequestID) return jsonResponse(ACCEPT);

  const { data: payment } = await admin
    .from("payments")
    .select("id")
    .eq("mpesa_checkout_request_id", callback.CheckoutRequestID)
    .eq("status", "pending")
    .maybeSingle();
  // Already settled (e.g. by mpesa-query) or an unrecognized id — no-op,
  // which also makes a duplicate/retried callback idempotent.
  if (!payment) return jsonResponse(ACCEPT);

  if (callback.ResultCode === 0) {
    const items = callback.CallbackMetadata?.Item ?? [];
    const receipt = items.find((i) => i.Name === "MpesaReceiptNumber")?.Value;
    await admin
      .from("payments")
      .update({
        status: "completed",
        completed_at: new Date().toISOString(),
        mpesa_receipt_number: receipt != null ? String(receipt) : null,
      })
      .eq("id", payment.id);
  } else {
    const reason = describeResultCode(callback.ResultCode ?? -1, callback.ResultDesc ?? "Payment failed");
    await admin.from("payments").update({ status: "failed", failure_reason: reason }).eq("id", payment.id);
  }

  return jsonResponse(ACCEPT);
});
