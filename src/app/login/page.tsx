"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { requestAccess } from "@/lib/actions";
import { BUSINESS_GROUPS, DEPARTMENTS } from "@/lib/org";
import { APP_NAME, PRIMARY_DOMAIN, DOMAINS_LABEL, isAllowedEmail } from "@/lib/config";

type Mode = "signin" | "request";

export default function LoginPage() {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>("signin");

  // sign-in
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  // request access
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [businessGroup, setBusinessGroup] = useState("");
  const [department, setDepartment] = useState("");

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [requested, setRequested] = useState(false);

  async function signIn() {
    setError("");
    const clean = email.trim().toLowerCase();
    if (!clean || !password) {
      setError("Enter your email and password.");
      return;
    }
    setBusy(true);
    const supabase = createClient();
    const { error } = await supabase.auth.signInWithPassword({ email: clean, password });
    setBusy(false);
    if (error) {
      setError("That email and password didn't match. Check with the admin if you haven't been approved yet.");
      return;
    }
    router.push("/dashboard");
    router.refresh();
  }

  async function submitRequest() {
    setError("");
    const clean = email.trim().toLowerCase();
    if (!firstName.trim() || !lastName.trim() || !clean) {
      setError("Fill in your name and work email.");
      return;
    }
    if (!businessGroup || !department) {
      setError("Pick your business group and department.");
      return;
    }
    if (!isAllowedEmail(clean)) {
      setError(`Use your ${DOMAINS_LABEL} email address.`);
      return;
    }
    setBusy(true);
    const res = await requestAccess({
      firstName,
      lastName,
      email: clean,
      businessGroup,
      department,
    });
    setBusy(false);
    if (res.error) {
      setError(res.error);
      return;
    }
    setRequested(true);
  }

  return (
    <main className="flex min-h-screen items-center justify-center px-6">
      <div className="w-full max-w-sm rounded-lg border border-line bg-white p-8">
        <p className="text-xs font-bold uppercase tracking-[0.2em] text-muted">{APP_NAME}</p>

        {requested ? (
          <>
            <h1 className="mt-1 font-display text-2xl font-extrabold">Request received</h1>
            <div className="mt-6 rounded-md bg-surface p-4 text-sm text-muted">
              You&apos;re on the list. An admin will approve you and email your sign-in
              details from an admin — watch your inbox.
            </div>
            <button
              onClick={() => {
                setRequested(false);
                setMode("signin");
                setPassword("");
              }}
              className="mt-6 w-full rounded-md border border-line px-4 py-2.5 text-sm font-bold hover:bg-surface"
            >
              Back to sign in
            </button>
          </>
        ) : mode === "signin" ? (
          <>
            <h1 className="mt-1 font-display text-2xl font-extrabold">Sign in to Book Club</h1>
            <p className="mt-2 text-sm text-muted">
              Use the email and password from your welcome message.
            </p>

            <label htmlFor="email" className="mt-6 block text-sm font-semibold">Work email</label>
            <input
              id="email"
              type="email"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder={`you@${PRIMARY_DOMAIN}`}
              className="mt-1 w-full rounded-md border border-line px-3 py-2 text-sm"
            />

            <label htmlFor="password" className="mt-4 block text-sm font-semibold">Password</label>
            <input
              id="password"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && signIn()}
              className="mt-1 w-full rounded-md border border-line px-3 py-2 text-sm"
            />

            <button
              onClick={signIn}
              disabled={busy}
              className="mt-5 w-full rounded-md bg-accent px-4 py-2.5 font-bold text-ink hover:brightness-110 disabled:opacity-60"
            >
              {busy ? "Signing in…" : "Sign in"}
            </button>
            {error && <p className="mt-3 text-sm text-red-700">{error}</p>}

            <p className="mt-6 text-center text-sm text-muted">
              New here?{" "}
              <button
                onClick={() => { setMode("request"); setError(""); }}
                className="font-semibold text-ink underline hover:text-muted"
              >
                Request access
              </button>
            </p>
          </>
        ) : (
          <>
            <h1 className="mt-1 font-display text-2xl font-extrabold">Request access</h1>
            <p className="mt-2 text-sm text-muted">
              Company addresses only. An admin approves new members and emails your
              sign-in details.
            </p>

            <div className="mt-6 grid grid-cols-2 gap-3">
              <div>
                <label htmlFor="first" className="block text-sm font-semibold">First name</label>
                <input
                  id="first"
                  type="text"
                  autoComplete="given-name"
                  value={firstName}
                  onChange={(e) => setFirstName(e.target.value)}
                  className="mt-1 w-full rounded-md border border-line px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label htmlFor="last" className="block text-sm font-semibold">Last name</label>
                <input
                  id="last"
                  type="text"
                  autoComplete="family-name"
                  value={lastName}
                  onChange={(e) => setLastName(e.target.value)}
                  className="mt-1 w-full rounded-md border border-line px-3 py-2 text-sm"
                />
              </div>
            </div>

            <label htmlFor="req-email" className="mt-4 block text-sm font-semibold">Work email</label>
            <input
              id="req-email"
              type="email"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && submitRequest()}
              placeholder={`you@${PRIMARY_DOMAIN}`}
              className="mt-1 w-full rounded-md border border-line px-3 py-2 text-sm"
            />

            <label htmlFor="req-group" className="mt-4 block text-sm font-semibold">Business group</label>
            <select
              id="req-group"
              value={businessGroup}
              onChange={(e) => setBusinessGroup(e.target.value)}
              className="mt-1 w-full rounded-md border border-line bg-white px-3 py-2 text-sm"
            >
              <option value="" disabled>Select your business group…</option>
              {BUSINESS_GROUPS.map((g) => (
                <option key={g} value={g}>{g}</option>
              ))}
            </select>

            <label htmlFor="req-dept" className="mt-4 block text-sm font-semibold">Department</label>
            <select
              id="req-dept"
              value={department}
              onChange={(e) => setDepartment(e.target.value)}
              className="mt-1 w-full rounded-md border border-line bg-white px-3 py-2 text-sm"
            >
              <option value="" disabled>Select your department…</option>
              {DEPARTMENTS.map((d) => (
                <option key={d} value={d}>{d}</option>
              ))}
            </select>
            <p className="mt-2 text-xs text-muted">
              This lets colleagues find clubs across other groups and departments to network.
            </p>

            <button
              onClick={submitRequest}
              disabled={busy}
              className="mt-5 w-full rounded-md bg-accent px-4 py-2.5 font-bold text-ink hover:brightness-110 disabled:opacity-60"
            >
              {busy ? "Sending…" : "Request access"}
            </button>
            {error && <p className="mt-3 text-sm text-red-700">{error}</p>}

            <p className="mt-6 text-center text-sm text-muted">
              Already approved?{" "}
              <button
                onClick={() => { setMode("signin"); setError(""); }}
                className="font-semibold text-ink underline hover:text-muted"
              >
                Sign in
              </button>
            </p>
          </>
        )}
      </div>
    </main>
  );
}
