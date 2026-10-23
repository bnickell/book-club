// One-shot: create the first admin account (auth user + profile) AND set a
// login password, in one go. Use when no account exists yet and you can't
// reach the request-access form (e.g. new code not deployed).
//
// Run: node --env-file=.env.local scripts/provision-admin.mjs <email> "<First>" "<Last>" [password]
import { createClient } from "@supabase/supabase-js";
import { randomInt } from "node:crypto";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const svc = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !svc) { console.error("Missing NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY in env."); process.exit(1); }

const email = (process.argv[2] || "").trim().toLowerCase();
const first = (process.argv[3] || "").trim();
const last = (process.argv[4] || "").trim();
if (!email || !first || !last) {
  console.error('Usage: node --env-file=.env.local scripts/provision-admin.mjs <email> "<First>" "<Last>" [password]');
  process.exit(1);
}

const ADJ = ["Bright", "Quiet", "Bold", "Steady", "Curious", "Classic", "Vivid", "Noble", "Clever", "Modern"];
const NOUN = ["Chapter", "Novel", "Verse", "Sonnet", "Library", "Volume", "Preface", "Passage", "Story", "Reader"];
const password = process.argv[5] || `${ADJ[randomInt(ADJ.length)]}-${NOUN[randomInt(NOUN.length)]}-${randomInt(1000, 10000)}`;

const admin = createClient(url, svc, { auth: { autoRefreshToken: false, persistSession: false } });

// Create the auth user with a password + email pre-confirmed. The
// handle_new_user trigger inserts the matching profile row.
const { data, error } = await admin.auth.admin.createUser({
  email,
  password,
  email_confirm: true,
  user_metadata: { first_name: first, last_name: last, full_name: `${first} ${last}` },
});
if (error || !data?.user) { console.error("Failed to create user:", error?.message); process.exit(1); }

// Force admin + approved regardless of whether they were the first user.
const { error: upErr } = await admin.from("profiles")
  .update({ role: "admin", approved: true }).eq("id", data.user.id);
if (upErr) { console.error("User created, but failed to mark admin/approved:", upErr.message); process.exit(1); }

console.log("\n✅ Provisioned admin");
console.log("   email:   ", email);
console.log("   password:", password);
console.log("   role:      admin   approved: true");
console.log("\nSign in at /login with the email + password above (once the new code is deployed).\n");
