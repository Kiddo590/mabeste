import { getSession } from "@/lib/auth/session";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;

export interface MpesaInitiateResult {
  payment_id: string;
  checkout_request_id: string;
  customer_message: string;
}

export interface MpesaStatusResult {
  status: "pending" | "completed" | "failed";
  receipt?: string | null;
  failure_reason?: string | null;
}

export async function initiateMpesaPayment(input: {
  tab_id: string;
  phone: string;
  amount?: number;
}): Promise<MpesaInitiateResult> {
  const session = getSession();
  if (!session) throw new Error("Not logged in");

  const res = await fetch(`${SUPABASE_URL}/functions/v1/mpesa-initiate`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` },
    body: JSON.stringify(input),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error ?? "Couldn't send the M-Pesa request");
  return body;
}

export async function queryMpesaPayment(checkoutRequestId: string): Promise<MpesaStatusResult> {
  const session = getSession();
  if (!session) throw new Error("Not logged in");

  const res = await fetch(`${SUPABASE_URL}/functions/v1/mpesa-query`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` },
    body: JSON.stringify({ checkout_request_id: checkoutRequestId }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error ?? "Couldn't check payment status");
  return body;
}
