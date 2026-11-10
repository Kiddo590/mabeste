// Cached staff session (from a successful PIN login). Stored in localStorage,
// not Dexie: it's small, synchronous, and needs no sync/outbox logic of its
// own. Offline, the app keeps operating on cached Dexie data regardless of
// session state (see plan: "lib/sync/syncEngine.ts") — this module only
// gates (a) which role-specific UI to show and (b) whether Supabase calls can
// carry a valid token.
export interface StaffSession {
  access_token: string;
  staff_id: string;
  staff_name: string;
  staff_role: "admin" | "cashier";
  expires_at: number; // epoch ms
}

export const STORAGE_KEY = "mabeste_pos_session";

const listeners = new Set<() => void>();

function notify(): void {
  listeners.forEach((l) => l());
}

/** For useStaffSession (useSyncExternalStore) — see lib/auth/useStaffSession.ts. */
export function subscribeSession(callback: () => void): () => void {
  listeners.add(callback);
  return () => listeners.delete(callback);
}

if (typeof window !== "undefined") {
  // Cross-tab updates; same-tab writers call notify() themselves below.
  window.addEventListener("storage", (e) => {
    if (e.key === STORAGE_KEY) notify();
  });
}

export function getSession(): StaffSession | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as StaffSession) : null;
  } catch {
    return null;
  }
}

export function setSession(session: StaffSession): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(session));
  } catch {
    // Storage unavailable (private browsing, quota) — session won't persist
    // across reloads, but the current page keeps working.
  }
  notify();
}

export function clearSession(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // ignore
  }
  notify();
}

export function isSessionExpired(session: StaffSession | null): boolean {
  return !session || session.expires_at <= Date.now();
}

/** Used as the Supabase client's `accessToken` callback — see lib/supabase/client.ts. */
export function getCachedAccessToken(): string | null {
  const session = getSession();
  return session && !isSessionExpired(session) ? session.access_token : null;
}
