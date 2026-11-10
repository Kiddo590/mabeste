import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "./types";
import { getCachedAccessToken } from "@/lib/auth/session";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

let client: SupabaseClient<Database> | null = null;

/**
 * Supabase client wired to our custom PIN-login JWT instead of GoTrue's
 * session (there is no GoTrue session — staff never sign in through
 * Supabase Auth directly; see supabase/functions/staff-login). The
 * `accessToken` callback is supabase-js's bring-your-own-JWT hook, normally
 * used for third-party auth providers.
 */
export function getSupabaseClient(): SupabaseClient<Database> {
  if (client) return client;
  client = createClient<Database>(url, anonKey, {
    accessToken: async () => getCachedAccessToken(),
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return client;
}
