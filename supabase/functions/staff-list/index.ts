// Public, read-only: returns {id, name} for active staff so the PIN pad can
// show a picker before any session exists. Deliberately excludes every other
// column (role, phone, pin_hash) — this is the one place staff data is
// exposed pre-login, so it stays as narrow as the UI actually needs.
import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders, jsonResponse } from "../_shared/cors.ts";

const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "GET") return jsonResponse({ error: "method_not_allowed" }, { status: 405 });

  const { data, error } = await admin
    .from("staff")
    .select("id, name")
    .eq("is_active", true)
    .order("name");

  if (error) return jsonResponse({ error: error.message }, { status: 500 });
  return jsonResponse({ staff: data });
});
