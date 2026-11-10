// Verifies a staff PIN and mints a Supabase-compatible JWT (HS256, signed with
// the project's shared JWT secret) carrying { staff_id, staff_role } under
// app_metadata, which RLS reads via current_staff_id()/current_staff_role()
// (supabase/migrations/0001_init.sql). A custom flow instead of Supabase's
// native email/password or OTP auth, because both assume a real password or
// an SMS round-trip — neither fits a PIN typed on a shared till, and an SMS
// round-trip fails at the exact moment (no connectivity) this app needs to
// keep working.
import { createClient } from "npm:@supabase/supabase-js@2";
import bcrypt from "npm:bcryptjs@2.4.3";
import { create, getNumericDate } from "https://deno.land/x/djwt@v3.0.2/mod.ts";
import { corsHeaders, jsonResponse } from "../_shared/cors.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
// Not auto-injected by the platform, and can't be named SUPABASE_* (that
// prefix is reserved) — set explicitly:
// `supabase secrets set APP_JWT_SECRET=<value>` (local: from `supabase status`;
// hosted: Project Settings -> API -> JWT Keys -> Legacy JWT Secret).
const JWT_SECRET = Deno.env.get("APP_JWT_SECRET")!;

const SESSION_HOURS = 14; // re-enter PIN after this; see lib/auth/session.ts
const MAX_ATTEMPTS = 5;
const LOCKOUT_MINUTES = 15;

const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

let signingKey: CryptoKey | null = null;
async function getSigningKey(): Promise<CryptoKey> {
  if (signingKey) return signingKey;
  signingKey = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(JWT_SECRET),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  return signingKey;
}

// Best-effort per-instance throttle only (Edge Function instances aren't
// guaranteed to share memory) — the real backstop is staff.is_active, which
// an admin can flip from the admin screen regardless of this map's state.
const failedAttempts = new Map<string, { count: number; lockedUntil?: number }>();

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return jsonResponse({ error: "method_not_allowed" }, { status: 405 });

  const { staff_id, pin } = await req.json().catch(() => ({}) as Record<string, unknown>);
  if (!staff_id || !pin) {
    return jsonResponse({ error: "staff_id and pin are required" }, { status: 400 });
  }

  const throttle = failedAttempts.get(staff_id as string);
  if (throttle?.lockedUntil && throttle.lockedUntil > Date.now()) {
    return jsonResponse({ error: "locked", retry_after_ms: throttle.lockedUntil - Date.now() }, { status: 429 });
  }

  const { data: staff, error } = await admin
    .from("staff")
    .select("id, auth_user_id, name, role, pin_hash, is_active")
    .eq("id", staff_id)
    .maybeSingle();

  if (error || !staff || !staff.is_active || !bcrypt.compareSync(String(pin), staff.pin_hash)) {
    const key = staff_id as string;
    const prevCount = failedAttempts.get(key)?.count ?? 0;
    const count = prevCount + 1;
    failedAttempts.set(
      key,
      count >= MAX_ATTEMPTS ? { count: 0, lockedUntil: Date.now() + LOCKOUT_MINUTES * 60_000 } : { count },
    );
    return jsonResponse({ error: "invalid_credentials" }, { status: 401 });
  }

  failedAttempts.delete(staff_id as string);

  const key = await getSigningKey();
  const token = await create(
    { alg: "HS256", typ: "JWT" },
    {
      sub: staff.auth_user_id,
      role: "authenticated",
      aud: "authenticated",
      iat: getNumericDate(0),
      exp: getNumericDate(60 * 60 * SESSION_HOURS),
      app_metadata: { staff_id: staff.id, staff_role: staff.role },
    },
    key,
  );

  return jsonResponse({
    access_token: token,
    expires_at: Date.now() + SESSION_HOURS * 60 * 60 * 1000,
    staff: { id: staff.id, name: staff.name, role: staff.role },
  });
});
