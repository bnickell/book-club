"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";

export function ChangePasswordForm({ email }: { email: string }) {
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setDone(false);
    if (next.length < 8) {
      setError("Your new password needs to be at least 8 characters.");
      return;
    }
    if (next !== confirm) {
      setError("The new passwords don't match.");
      return;
    }
    if (next === current) {
      setError("Your new password needs to be different from your current one.");
      return;
    }
    setBusy(true);
    const supabase = createClient();
    // Verify the current password before changing it — an authenticated
    // session alone shouldn't let a walk-up change the password.
    const { error: signInErr } = await supabase.auth.signInWithPassword({ email, password: current });
    if (signInErr) {
      setBusy(false);
      setError("Your current password is incorrect.");
      return;
    }
    const { error: updateErr } = await supabase.auth.updateUser({ password: next });
    setBusy(false);
    if (updateErr) {
      setError(updateErr.message || "Couldn't update your password. Try again.");
      return;
    }
    setCurrent("");
    setNext("");
    setConfirm("");
    setDone(true);
  }

  return (
    <section className="mt-8">
      <h2 className="font-display text-xl font-extrabold">Change password</h2>
      <p className="mt-1 text-sm text-muted">
        Set your own password — handy after signing in with the temporary one from your welcome email.
      </p>

      {done && (
        <div className="mt-4 rounded-lg border-l-4 border-accent bg-surface p-3 text-sm font-semibold text-ink">
          Password updated.
        </div>
      )}

      <form onSubmit={submit} className="mt-4 rounded-lg border border-line bg-white p-6">
        <label htmlFor="current_password" className="block text-sm font-semibold">Current password</label>
        <input
          id="current_password" type="password" autoComplete="current-password"
          value={current} onChange={(e) => setCurrent(e.target.value)}
          className="mt-1 w-full rounded-md border border-line px-3 py-2 text-sm"
        />

        <label htmlFor="new_password" className="mt-4 block text-sm font-semibold">New password</label>
        <input
          id="new_password" type="password" autoComplete="new-password"
          value={next} onChange={(e) => setNext(e.target.value)}
          className="mt-1 w-full rounded-md border border-line px-3 py-2 text-sm"
        />

        <label htmlFor="confirm_password" className="mt-4 block text-sm font-semibold">Confirm new password</label>
        <input
          id="confirm_password" type="password" autoComplete="new-password"
          value={confirm} onChange={(e) => setConfirm(e.target.value)}
          className="mt-1 w-full rounded-md border border-line px-3 py-2 text-sm"
        />

        {error && <p className="mt-3 text-sm text-red-700">{error}</p>}

        <button
          type="submit"
          disabled={busy || !current || !next || !confirm}
          className="mt-6 w-full rounded-md bg-ink px-5 py-2.5 text-sm font-bold text-white hover:bg-muted disabled:opacity-60"
        >
          {busy ? "Updating…" : "Update password"}
        </button>
      </form>
    </section>
  );
}
