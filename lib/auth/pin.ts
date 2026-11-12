// Login itself is inherently online-only (it's the one step that must reach
// staff-login to mint a session) — plain fetch rather than supabase-js,
// since there's no session yet for the accessToken callback to return.
import { setSession, getSession, type StaffSession } from "@/lib/auth/session";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

export class PinLoginError extends Error {
  code: string;
  retryAfterMs?: number;
  constructor(code: string, retryAfterMs?: number) {
    super(code);
    this.code = code;
    this.retryAfterMs = retryAfterMs;
  }
}

export interface StaffListEntry {
  id: string;
  name: string;
}

export async function listStaffForPicker(): Promise<StaffListEntry[]> {
  const res = await fetch(`${SUPABASE_URL}/functions/v1/staff-list`, {
    headers: { Authorization: `Bearer ${ANON_KEY}` },
  });
  if (!res.ok) throw new Error("network_error");
  const body = await res.json();
  return body.staff;
}

export async function loginWithPin(staffId: string, pin: string): Promise<StaffSession> {
  let res: Response;
  try {
    res = await fetch(`${SUPABASE_URL}/functions/v1/staff-login`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${ANON_KEY}` },
      body: JSON.stringify({ staff_id: staffId, pin }),
    });
  } catch {
    throw new PinLoginError("network_error");
  }

  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new PinLoginError(body.error ?? "login_failed", body.retry_after_ms);

  const session: StaffSession = {
    access_token: body.access_token,
    staff_id: body.staff.id,
    staff_name: body.staff.name,
    staff_role: body.staff.role,
    expires_at: body.expires_at,
  };
  setSession(session);
  return session;
}

export async function createStaff(input: {
  name: string;
  phone?: string;
  pin: string;
  role: "admin" | "cashier";
}): Promise<void> {
  const session = getSession();
  if (!session) throw new Error("Not logged in");

  const res = await fetch(`${SUPABASE_URL}/functions/v1/staff-create`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` },
    body: JSON.stringify(input),
  });

  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error ?? "Failed to create staff");
}
