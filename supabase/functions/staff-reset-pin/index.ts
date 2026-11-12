// Admin-only: sets a new bcrypt-hashed PIN for an existing staff row.
// Same caller-verification shape as staff-create — this function's own
// re-check of the bearer token's app_metadata.staff_role is the real guard,
// since the gateway's verify_jwt only proves the token is validly signed,
// not that the holder is an admin.
import { createClient } from "npm:@supabase/supabase-js@2";
import bcrypt from "npm:bcryptjs@2.4.3";
import { verify } from "https://deno.land/x/djwt@v3.0.2/mod.ts";
import { corsHeaders, jsonResponse } from "../_shared/cors.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const JWT_SECRET = Deno.env.get("APP_JWT_SECRET")!;

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
  let callerRole: string | undefined;
  try {
    const payload = (await verify(token, await getVerifyKey())) as {
      app_metadata?: { staff_role?: string };
    };
    callerRole = payload.app_metadata?.staff_role;
  } catch {
    return jsonResponse({ error: "unauthorized" }, { status: 401 });
  }
  if (callerRole !== "admin") {
    return jsonResponse({ error: "forbidden" }, { status: 403 });
  }

  const { staff_id, pin } = await req.json().catch(() => ({}) as Record<string, unknown>);
  if (!staff_id || !pin) {
    return jsonResponse({ error: "staff_id and pin are required" }, { status: 400 });
  }
  if (!/^\d{4,6}$/.test(String(pin))) {
    return jsonResponse({ error: "pin must be 4-6 digits" }, { status: 400 });
  }

  const pin_hash = bcrypt.hashSync(String(pin), 10);
  const { error } = await admin.from("staff").update({ pin_hash }).eq("id", staff_id);
  if (error) {
    return jsonResponse({ error: error.message }, { status: 500 });
  }

  return jsonResponse({ ok: true });
});
