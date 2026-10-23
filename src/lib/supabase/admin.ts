import "server-only";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";

// ============================================================
// Privileged, service-role client for ADMIN-only server actions and
// public sign-up (which has no session yet). Bypasses Row Level Security,
// so it must NEVER be imported into a client component, and every admin
// action that uses it MUST verify the caller first (see requireAdmin()
// in lib/actions.ts).
//
// Requires SUPABASE_SERVICE_ROLE_KEY (server-only secret) —
// Supabase → Settings → API → service_role key.
// ============================================================
export function createAdminClient() {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) {
    throw new Error(
      "SUPABASE_SERVICE_ROLE_KEY is not set. Admin actions need the service_role key from Supabase → Settings → API."
    );
  }
  return createSupabaseClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
