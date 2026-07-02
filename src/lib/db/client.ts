import { createClient, SupabaseClient } from "@supabase/supabase-js";
import { env } from "@/lib/env";

// Backend client using the SERVICE ROLE key. This bypasses RLS and must NEVER
// be imported into a client component or shipped to the browser. It is used by
// the cron engine, the Telegram webhook, and server-side route handlers only.
let _admin: SupabaseClient | null = null;

export function db(): SupabaseClient {
  if (_admin) return _admin;
  _admin = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return _admin;
}
