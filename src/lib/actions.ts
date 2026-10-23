"use server";
// ============================================================
// Auth / membership mutations for the admin-approval flow.
// RLS in supabase/migrations is the real enforcement; these actions
// shape the writes and gate the privileged (service-role) client.
// ============================================================
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { DOMAINS_LABEL, isAllowedEmail } from "@/lib/config";
import { generatePassword, buildWelcomeEmail, buildResetEmail } from "@/lib/welcome";

async function requireUser() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  return { supabase, user };
}

// Gate for admin-only actions. Verifies the signed-in profile has role
// 'admin' (via the RLS-scoped client) BEFORE handing back the privileged,
// RLS-bypassing admin client. Never expose the admin client without this.
async function requireAdmin() {
  const { supabase, user } = await requireUser();
  const { data } = await supabase.from("profiles").select("role").eq("id", user.id).maybeSingle();
  if (data?.role !== "admin") redirect("/dashboard");
  return { admin: createAdminClient(), user };
}

// ---------- Public sign-up: request access ----------
// Unauthenticated. Creates a pending (approved = false) account with NO
// login password — an admin sets the password when they approve. Uses the
// service-role client because there's no session yet. The handle_new_user
// trigger creates the pending profile row (with names from user_metadata);
// the optional email-domain lock is enforced here AND by enforce_email_domain.
export async function requestAccess(input: {
  firstName: string;
  lastName: string;
  email: string;
  businessGroup: string;
  department: string;
}): Promise<{ ok?: true; error?: string }> {
  const first = input.firstName?.trim() ?? "";
  const last = input.lastName?.trim() ?? "";
  const email = input.email?.trim().toLowerCase() ?? "";
  const businessGroup = input.businessGroup?.trim() ?? "";
  const department = input.department?.trim() ?? "";
  if (!first || !last || !email) return { error: "Please fill in your name and work email." };
  if (!businessGroup || !department) {
    return { error: "Please pick your business group and department." };
  }
  if (!isAllowedEmail(email)) {
    return { error: `Sign-up is limited to ${DOMAINS_LABEL} email addresses.` };
  }

  const admin = createAdminClient();
  // Create the auth user with no password (email pre-confirmed since we
  // don't use email verification). They can't sign in until approval.
  // The DB trigger inserts the matching pending profile row (names +
  // business_group/department come from this metadata).
  const { error } = await admin.auth.admin.createUser({
    email,
    email_confirm: true,
    user_metadata: {
      first_name: first,
      last_name: last,
      full_name: `${first} ${last}`,
      business_group: businessGroup,
      department,
    },
  });
  if (error) {
    const msg = error.message?.toLowerCase() ?? "";
    if (msg.includes("already") || msg.includes("registered") || msg.includes("exists")) {
      return { error: "That email has already requested access or is already a member." };
    }
    if (msg.includes("email domain")) {
      return { error: DOMAINS_LABEL ? `Sign-up is limited to ${DOMAINS_LABEL} email addresses.` : "That email domain isn't allowed." };
    }
    return { error: "Something went wrong creating your request. Please try again." };
  }
  return { ok: true };
}

// ---------- Self-service profile settings ----------
// Members keep their own name / business group / department current (e.g.
// after an internal move). Email and role are deliberately not editable:
// email is the sign-in identity, and the RLS self-update policy pins
// role + approved to their committed values.
export async function updateProfile(formData: FormData) {
  const { supabase, user } = await requireUser();
  const firstName = String(formData.get("first_name") ?? "").trim();
  const lastName = String(formData.get("last_name") ?? "").trim();
  const businessGroup = String(formData.get("business_group") ?? "");
  const department = String(formData.get("department") ?? "");
  if (!firstName || !lastName || !businessGroup || !department) return;
  await supabase
    .from("profiles")
    .update({
      first_name: firstName,
      last_name: lastName,
      full_name: `${firstName} ${lastName}`,
      business_group: businessGroup,
      department,
    })
    .eq("id", user.id); // RLS also scopes this to the caller
  revalidatePath("/", "layout");
  redirect("/profile?saved=1");
}

// Admin: hard-delete a club. Removing the club row cascades to its
// enrollments, weekly guides, ratings, and reactions (all FKs are
// ON DELETE CASCADE). The associated book row is left intact — it can be
// reused or managed from the book list. Handy for clearing out test clubs.
export async function adminDeleteClub(clubId: string) {
  const { admin } = await requireAdmin();
  await admin.from("clubs").delete().eq("id", clubId);
  revalidatePath("/admin");
  revalidatePath("/dashboard");
}

// Close out a club before its quarter ends (wrapped up early, or cancelled).
// Sets status = 'completed', which archives it and — via the enrollment RLS
// policy that requires status = 'open' — stops any new sign-ups. Guarded to
// the club's own leader or an admin; the "leaders update own clubs" RLS
// policy is the real enforcement, this just shapes the write.
export async function closeClub(clubId: string) {
  const { supabase, user } = await requireUser();
  const { data: club } = await supabase
    .from("clubs").select("leader_id").eq("id", clubId).maybeSingle();
  if (!club) return;
  const { data: me } = await supabase
    .from("profiles").select("role").eq("id", user.id).maybeSingle();
  const canManage = club.leader_id === user.id || me?.role === "admin";
  if (!canManage) return;
  await supabase.from("clubs").update({ status: "completed" }).eq("id", clubId);
  revalidatePath(`/clubs/${clubId}`);
  revalidatePath("/dashboard");
}

// Approve a pending member: generate a temporary password, set it on their
// auth user, flip approved = true, and return the credentials + a ready-to-
// paste welcome email so the admin can send it from their own mailbox.
export async function adminApproveMember(userId: string): Promise<
  | { ok: true; name: string; to: string; subject: string; body: string; password: string }
  | { ok: false; error: string }
> {
  const { admin } = await requireAdmin();
  const { data: p } = await admin.from("profiles")
    .select("email, first_name, full_name, approved").eq("id", userId).maybeSingle();
  if (!p) return { ok: false, error: "Member not found." };
  if (p.approved) return { ok: false, error: "That member is already approved." };

  const password = generatePassword();
  const { error: pwErr } = await admin.auth.admin.updateUserById(userId, { password });
  if (pwErr) return { ok: false, error: "Couldn't set the password. Please try again." };

  const { error: upErr } = await admin.from("profiles").update({ approved: true }).eq("id", userId);
  if (upErr) return { ok: false, error: "Couldn't mark the member approved. Please try again." };

  const firstName =
    (p.first_name as string) || (p.full_name as string)?.split(" ")[0] || "there";
  const { subject, body } = buildWelcomeEmail(firstName, p.email as string, password);
  revalidatePath("/admin");
  return {
    ok: true,
    name: (p.full_name as string) || (p.email as string),
    to: p.email as string,
    subject,
    body,
    password,
  };
}

// Reset an already-approved member's password (they lost it / got locked
// out). Generates a fresh temp password, sets it on their auth user, and
// returns a ready-to-paste reset email — same Outlook flow as approval.
// Does NOT touch the approved flag. Members can then set their own password
// from their profile page.
export async function adminResetPassword(userId: string): Promise<
  | { ok: true; name: string; to: string; subject: string; body: string; password: string }
  | { ok: false; error: string }
> {
  const { admin } = await requireAdmin();
  const { data: p } = await admin.from("profiles")
    .select("email, first_name, full_name, approved").eq("id", userId).maybeSingle();
  if (!p) return { ok: false, error: "Member not found." };
  if (!p.approved) {
    return { ok: false, error: "This member isn't approved yet — use Approve to send their first password." };
  }

  const password = generatePassword();
  const { error: pwErr } = await admin.auth.admin.updateUserById(userId, { password });
  if (pwErr) return { ok: false, error: "Couldn't set the password. Please try again." };

  const firstName =
    (p.first_name as string) || (p.full_name as string)?.split(" ")[0] || "there";
  const { subject, body } = buildResetEmail(firstName, p.email as string, password);
  return {
    ok: true,
    name: (p.full_name as string) || (p.email as string),
    to: p.email as string,
    subject,
    body,
    password,
  };
}

// Dismiss a pending request (spam / mistake): removes the auth user, which
// cascades the profile row. Guarded so it can only ever touch a not-yet-
// approved account.
export async function adminRejectMember(userId: string) {
  const { admin } = await requireAdmin();
  const { data: p } = await admin.from("profiles").select("approved").eq("id", userId).maybeSingle();
  if (!p || p.approved) return; // never delete an approved member here
  await admin.auth.admin.deleteUser(userId);
  revalidatePath("/admin");
}

// Admin: last sign-in time per member, read from Supabase auth (auth.users).
// Supabase stamps last_sign_in_at on every password sign-in — a lightweight
// engagement signal, no schema change needed. Requires the service-role
// client to read auth users. Returns a map of user id → ISO timestamp (or
// null for members who've never signed in).
export async function adminLastLogins(): Promise<Record<string, string | null>> {
  const { admin } = await requireAdmin();
  const map: Record<string, string | null> = {};
  for (let page = 1; page <= 20; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 });
    if (error) break;
    for (const u of data.users) map[u.id] = u.last_sign_in_at ?? null;
    if (data.users.length < 200) break;
  }
  return map;
}

// Change a member's role. Server-side guard: an admin can never change their
// OWN role, so the program can't lose its last admin to a mis-click or a
// crafted request — the UI disables the self-row select, but this is the
// real enforcement.
export async function adminSetMemberRole(userId: string, role: "member" | "leader" | "admin") {
  const { admin, user } = await requireAdmin();
  if (userId === user.id) return;
  if (!["member", "leader", "admin"].includes(role)) return;
  await admin.from("profiles").update({ role }).eq("id", userId);
  revalidatePath("/admin");
}

// Fully delete a member. Removing the auth user cascades to the profile row
// and everything owned by it — enrollments, and any clubs they lead (FKs are
// ON DELETE CASCADE). Cannot delete yourself (guards against lockout).
export async function adminDeleteMember(userId: string) {
  const { admin, user } = await requireAdmin();
  if (userId === user.id) return;
  await admin.auth.admin.deleteUser(userId);
  revalidatePath("/admin");
}
