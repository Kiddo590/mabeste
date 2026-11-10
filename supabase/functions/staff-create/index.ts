// Admin-only: creates a real auth.users identity (Supabase tooling/Storage
// policies expect staff.auth_user_id to reference one) plus the staff row
// with a bcrypt-hashed PIN. Login never uses this user's email/password —
// staff-login (PIN) is the only sign-in path.
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

  const { name, phone, pin, role } = await req.json().catch(() => ({}) as Record<string, unknown>);
  if (!name || !pin || !role || !["admin", "cashier"].includes(role as string)) {
    return jsonResponse({ error: "name, pin, and role ('admin'|'cashier') are required" }, { status: 400 });
  }
  if (!/^\d{4,6}$/.test(String(pin))) {
    return jsonResponse({ error: "pin must be 4-6 digits" }, { status: 400 });
  }

  const syntheticEmail = `staff-${crypto.randomUUID()}@mabeste.local`;
  const { data: authUser, error: authError } = await admin.auth.admin.createUser({
    email: syntheticEmail,
    password: crypto.randomUUID() + crypto.randomUUID(),
    email_confirm: true,
  });
  if (authError || !authUser?.user) {
    return jsonResponse({ error: authError?.message ?? "failed to create auth user" }, { status: 500 });
  }

  const pin_hash = bcrypt.hashSync(String(pin), 10);
  const { data: staff, error: staffError } = await admin
    .from("staff")
    .insert({ auth_user_id: authUser.user.id, name, phone, pin_hash, role })
    .select("id, name, role, is_active")
    .single();

  if (staffError) {
    await admin.auth.admin.deleteUser(authUser.user.id);
    return jsonResponse({ error: staffError.message }, { status: 500 });
  }

  return jsonResponse({ staff }, { status: 201 });
});
