// ============================================================
// App configuration.
// ============================================================

// Display name, shown in the nav, landing page, emails and page title.
// Override with NEXT_PUBLIC_APP_NAME.
export const APP_NAME = process.env.NEXT_PUBLIC_APP_NAME || "Book Club";

// Optional sign-up domain lock. Set NEXT_PUBLIC_ALLOWED_EMAIL_DOMAINS to a
// comma-separated list (e.g. "example.com,example.org") to restrict who can
// request access. Leave it empty and anyone can request access (an admin still
// approves each person). The same list is enforced in the UI, the requestAccess
// action, and the enforce_email_domain database trigger (defense in depth) --
// keep the `allowed_email_domains` table (see the README) in sync with it.
export const ALLOWED_DOMAINS: string[] = (process.env.NEXT_PUBLIC_ALLOWED_EMAIL_DOMAINS ?? "")
  .split(",")
  .map((d) => d.trim().toLowerCase().replace(/^@/, ""))
  .filter(Boolean);
export const PRIMARY_DOMAIN = ALLOWED_DOMAINS[0] ?? "example.com"; // used for placeholders
export const DOMAINS_LABEL = ALLOWED_DOMAINS.map((d) => `@${d}`).join(" or ");
export function isAllowedEmail(email: string): boolean {
  const e = email.trim().toLowerCase();
  if (ALLOWED_DOMAINS.length === 0) return /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e);
  return ALLOWED_DOMAINS.some((d) => e.endsWith(`@${d}`));
}

// Base URL of the deployed app, used in the welcome email's sign-in link.
// Set NEXT_PUBLIC_SITE_URL in the environment.
export const APP_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";

// Emoji reactions members can leave on a released weekly guide. Single source
// of truth — the guide_reactions CHECK constraint in schema.sql mirrors it.
export const REACTIONS = ["👍", "💡", "🔥", "❤️", "🎯"] as const;
export type Reaction = (typeof REACTIONS)[number];
