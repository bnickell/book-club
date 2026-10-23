import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { updateProfile } from "@/lib/actions";
import { BUSINESS_GROUPS, DEPARTMENTS } from "@/lib/org";
import { Nav } from "@/components/ui";
import { ChangePasswordForm } from "./change-password-client";
import type { Profile } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function ProfilePage({
  searchParams,
}: {
  searchParams: Promise<{ saved?: string }>;
}) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles").select("*").eq("id", user.id).single<Profile>();
  if (!profile) redirect("/login");
  const { saved } = await searchParams;

  return (
    <>
      <Nav role={profile.role} email={profile.email} />
      <main className="mx-auto max-w-lg px-6 py-10">
        <h1 className="font-display text-3xl font-extrabold">Your profile</h1>
        <p className="mt-1 text-sm text-muted">
          Keep your business group and department current — colleagues use them to
          find clubs across the org.
        </p>

        {saved && (
          <div className="mt-5 rounded-lg border-l-4 border-accent bg-surface p-3 text-sm font-semibold text-ink">
            Profile updated.
          </div>
        )}

        <form action={updateProfile} className="mt-6 rounded-lg border border-line bg-white p-6">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="first_name" className="block text-sm font-semibold">First name</label>
              <input
                id="first_name" name="first_name" type="text" required
                autoComplete="given-name"
                defaultValue={profile.first_name ?? ""}
                className="mt-1 w-full rounded-md border border-line px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label htmlFor="last_name" className="block text-sm font-semibold">Last name</label>
              <input
                id="last_name" name="last_name" type="text" required
                autoComplete="family-name"
                defaultValue={profile.last_name ?? ""}
                className="mt-1 w-full rounded-md border border-line px-3 py-2 text-sm"
              />
            </div>
          </div>

          <label htmlFor="business_group" className="mt-4 block text-sm font-semibold">Business group</label>
          <select
            id="business_group" name="business_group" required
            defaultValue={profile.business_group ?? ""}
            className="mt-1 w-full rounded-md border border-line bg-white px-3 py-2 text-sm"
          >
            <option value="" disabled>Select your business group…</option>
            {BUSINESS_GROUPS.map((g) => (
              <option key={g} value={g}>{g}</option>
            ))}
          </select>

          <label htmlFor="department" className="mt-4 block text-sm font-semibold">Department</label>
          <select
            id="department" name="department" required
            defaultValue={profile.department ?? ""}
            className="mt-1 w-full rounded-md border border-line bg-white px-3 py-2 text-sm"
          >
            <option value="" disabled>Select your department…</option>
            {DEPARTMENTS.map((d) => (
              <option key={d} value={d}>{d}</option>
            ))}
          </select>

          {/* Email is the sign-in identity and can't be changed here. */}
          <label htmlFor="profile-email" className="mt-4 block text-sm font-semibold">Email</label>
          <input
            id="profile-email" value={profile.email} disabled readOnly
            className="mt-1 w-full cursor-not-allowed rounded-md border border-line bg-canvas px-3 py-2 text-sm opacity-60"
          />
          <p className="mt-1 text-xs text-muted">
            Tied to your sign-in — can&apos;t be changed here.
          </p>

          <button className="mt-6 w-full rounded-md bg-ink px-5 py-2.5 text-sm font-bold text-white hover:bg-muted">
            Save changes
          </button>
        </form>

        <ChangePasswordForm email={profile.email} />
      </main>
    </>
  );
}
