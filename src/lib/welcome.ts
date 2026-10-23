import "server-only";
import { randomInt } from "node:crypto";
import { APP_NAME, APP_URL } from "@/lib/config";

// ============================================================
// Credentials + welcome email for the admin-approval flow.
// When an admin approves a member we generate a temporary password
// (set on the auth user) and a ready-to-paste welcome email, so the
// admin can send it from their own mailbox. This avoids depending on an SMTP
// provider and sidesteps corporate mail filters that mangle auth emails.
// ============================================================

// Deliberately unambiguous word lists (no look-alike words) so the
// generated password is easy to read off an email and type by hand.
const ADJECTIVES = [
  "Bright", "Quiet", "Bold", "Steady", "Curious", "Classic", "Vivid", "Noble",
  "Clever", "Golden", "Modern", "Timeless", "Lively", "Fresh", "Keen", "Prime",
];
const NOUNS = [
  "Chapter", "Novel", "Prologue", "Verse", "Sonnet", "Paragraph", "Library", "Volume",
  "Preface", "Passage", "Story", "Folio", "Margin", "Spine", "Reader", "Author",
];

// e.g. "Bright-Chapter-4820". Readable and easy to type; it's a temporary
// password for a casual club, gated behind admin approval (and the optional
// email-domain lock).
export function generatePassword(): string {
  const adj = ADJECTIVES[randomInt(ADJECTIVES.length)];
  const noun = NOUNS[randomInt(NOUNS.length)];
  const digits = randomInt(1000, 10000); // 4 digits, no leading zero
  return `${adj}-${noun}-${digits}`;
}

// Password-reset counterpart to the welcome email — for a member who's
// already in but got locked out. Same paste-into-Outlook flow.
export function buildResetEmail(firstName: string, email: string, password: string) {
  const name = firstName?.trim() || "there";
  const subject = `Your ${APP_NAME} password has been reset 🔑`;
  const body = `Hi ${name},

Your ${APP_NAME} password has been reset. Here are your new sign-in details:

  Sign in:   ${APP_URL}/login
  Email:     ${email}
  Password:  ${password}

Once you're back in, you can set your own password anytime from your
profile page.

Happy reading,
The ${APP_NAME} crew`;
  return { subject, body };
}

export function buildWelcomeEmail(firstName: string, email: string, password: string) {
  const name = firstName?.trim() || "there";
  const subject = `You're in — welcome to the ${APP_NAME}! 📚`;
  const body = `Hi ${name},

You're approved — welcome to the ${APP_NAME}! 🎉

Here's how to get in:

  Sign in:   ${APP_URL}/login
  Email:     ${email}
  Password:  ${password}

Once you sign in, browse the open clubs and claim a seat in whichever
read looks good. Discussion guides show up on each club page as the
quarter gets going.

Happy reading,
The ${APP_NAME} crew`;
  return { subject, body };
}
