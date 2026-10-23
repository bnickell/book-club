// One-time bootstrap for the first admin. Because access is approval-gated,
// the first admin can't be approved in-app — this sets a login password on
// an existing auth user and marks their profile approved + admin directly.
//
// Run: node --env-file=.env.local scripts/bootstrap-admin.mjs <email> [password]
// If no password is given, a readable one is generated and printed.
import { createClient } from "@supabase/supabase-js";
import { randomInt } from "node:crypto";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const svc = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !svc) { console.error("Missing NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY in env."); process.exit(1); }

const email = (process.argv[2] || "").trim().toLowerCase();
if (!email) { console.error("Usage: node --env-file=.env.local scripts/bootstrap-admin.mjs <email> [password]"); process.exit(1); }

const ADJ = ["Bright", "Quiet", "Bold", "Steady", "Curious", "Classic", "Vivid", "Noble", "Clever", "Modern"];
const NOUN = ["Chapter", "Novel", "Verse", "Sonnet", "Library", "Volume", "Preface", "Passage", "Story", "Reader"];
const password = process.argv[3] || `${ADJ[randomInt(ADJ.length)]}-${NOUN[randomInt(NOUN.length)]}-${randomInt(1000, 10000)}`;

const admin = createClient(url, svc, { auth: { autoRefreshToken: false, persistSession: false } });

// Find the auth user id (prefer the profiles row; fall back to scanning auth users).
let userId = null;
const { data: p } = await admin.from("profiles").select("id").ilike("email", email).maybeSingle();
if (p?.id) userId = p.id;
if (!userId) {
  for (let page = 1; page <= 10 && !userId; page++) {
    const { data } = await admin.auth.admin.listUsers({ page, perPage: 200 });
    const hit = data.users.find((u) => u.email?.toLowerCase() === email);
    if (hit) userId = hit.id;
    if (data.users.length < 200) break;
  }
}
if (!userId) { console.error(`No account found for ${email}. Request access on the login page first.`); process.exit(1); }

const { error: pwErr } = await admin.auth.admin.updateUserById(userId, { password });
if (pwErr) { console.error("Failed to set password:", pwErr.message); process.exit(1); }

const { error: upErr } = await admin.from("profiles")
  .update({ role: "admin", approved: true }).eq("id", userId);
if (upErr) { console.error("Password set, but failed to mark approved/admin:", upErr.message); process.exit(1); }

console.log("\n✅ Bootstrapped admin");
console.log("   email:   ", email);
console.log("   password:", password);
console.log("   role:      admin   approved: true");
console.log("\nSign in at /login with the email + password above.\n");
