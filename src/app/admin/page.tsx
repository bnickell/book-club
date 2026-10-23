"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { adminApproveMember, adminRejectMember, adminDeleteMember, adminSetMemberRole, adminDeleteClub, adminResetPassword, adminLastLogins } from "@/lib/actions";
import { Nav, Badge } from "@/components/ui";
import type { Book, Profile, UserRole } from "@/lib/types";

type AdminClub = {
  id: string;
  name: string;
  quarter: string;
  status: string;
  max_seats: number;
  books: { title: string } | null;
  enrollments: { user_id: string }[];
  profiles: { full_name: string | null; email: string } | null;
};

type ApprovalResult = { name: string; to: string; subject: string; body: string; password: string };

function CopyRow({ label, value, multiline }: { label: string; value: string; multiline?: boolean }) {
  const [copied, setCopied] = useState(false);
  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard can be blocked (permissions/iframe) — leave the text
      // visible so the admin can select and copy it manually.
      alert("Clipboard blocked — select the text and copy it manually.");
    }
  }
  return (
    <div>
      <div className="flex items-center justify-between">
        <span className="text-xs font-bold uppercase tracking-wide text-muted">{label}</span>
        <button onClick={copy} className="rounded border border-line px-2 py-0.5 text-xs font-semibold hover:bg-surface">
          {copied ? "Copied ✓" : "Copy"}
        </button>
      </div>
      {multiline ? (
        <pre className="mt-1 whitespace-pre-wrap rounded-md bg-surface p-3 text-xs text-ink">{value}</pre>
      ) : (
        <p className="mt-1 break-all rounded-md bg-surface px-3 py-2 text-sm text-ink">{value}</p>
      )}
    </div>
  );
}

// Relative label ("3 days ago") plus the absolute date on hover, for the
// engagement view. Null timestamp → the given "never" label.
function formatSince(iso: string | null | undefined, neverLabel: string): { label: string; title: string } {
  if (!iso) return { label: neverLabel, title: "Nothing recorded yet" };
  const then = new Date(iso);
  const title = then.toLocaleString();
  const days = Math.floor((Date.now() - then.getTime()) / 86_400_000);
  if (days <= 0) return { label: "Today", title };
  if (days === 1) return { label: "Yesterday", title };
  if (days < 7) return { label: `${days} days ago`, title };
  if (days < 30) return { label: `${Math.floor(days / 7)}w ago`, title };
  if (days < 365) return { label: `${Math.floor(days / 30)}mo ago`, title };
  return { label: `${Math.floor(days / 365)}y ago`, title };
}

export default function AdminPage() {
  const router = useRouter();
  const [me, setMe] = useState<Profile | null>(null);
  const [people, setPeople] = useState<Profile[]>([]);
  const [pending, setPending] = useState<Profile[]>([]);
  const [books, setBooks] = useState<Book[]>([]);
  const [clubs, setClubs] = useState<AdminClub[]>([]);
  const [lastLogins, setLastLogins] = useState<Record<string, string | null>>({});
  const [busyId, setBusyId] = useState<string | null>(null);
  const [result, setResult] = useState<ApprovalResult | null>(null);

  const load = useCallback(async () => {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return router.push("/login");
    const { data: profile } = await supabase.from("profiles").select("*").eq("id", user.id).single();
    const p = profile as Profile;
    if (p.role !== "admin") return router.push("/dashboard");
    setMe(p);
    const [{ data: profiles }, { data: allBooks }, { data: allClubs }] = await Promise.all([
      supabase.from("profiles").select("*").order("email"),
      supabase.from("books").select("*").order("created_at", { ascending: false }),
      supabase
        .from("clubs")
        .select("id, name, quarter, status, max_seats, books(title), enrollments(user_id), profiles!clubs_leader_id_fkey(full_name, email)")
        .order("quarter", { ascending: false })
    ]);
    const all = (profiles ?? []) as Profile[];
    setPending(all.filter((x) => !x.approved));
    setPeople(all.filter((x) => x.approved));
    setBooks((allBooks ?? []) as Book[]);
    setClubs((allClubs ?? []) as unknown as AdminClub[]);
    // Last sign-in times (engagement signal) come from auth via a guarded action.
    setLastLogins(await adminLastLogins());
  }, [router]);

  useEffect(() => { load(); }, [load]);

  async function approve(id: string) {
    setBusyId(id);
    const res = await adminApproveMember(id);
    setBusyId(null);
    if (res.ok) {
      setResult({ name: res.name, to: res.to, subject: res.subject, body: res.body, password: res.password });
      load();
    } else {
      alert(res.error);
    }
  }

  async function dismiss(id: string) {
    if (!confirm("Dismiss this pending request? Their account will be removed.")) return;
    setBusyId(id);
    await adminRejectMember(id);
    setBusyId(null);
    load();
  }

  async function remove(id: string, label: string) {
    if (!confirm(`Delete ${label}? This removes their account, enrollments, and any clubs they lead.`)) return;
    setBusyId(id);
    await adminDeleteMember(id);
    setBusyId(null);
    load();
  }

  async function resetPw(id: string, label: string) {
    if (!confirm(`Reset the password for ${label}? This sets a new temporary password and gives you an email to send them.`)) return;
    setBusyId(id);
    const res = await adminResetPassword(id);
    setBusyId(null);
    if (res.ok) {
      setResult({ name: res.name, to: res.to, subject: res.subject, body: res.body, password: res.password });
    } else {
      alert(res.error);
    }
  }

  async function removeClub(id: string, label: string) {
    if (!confirm(`Delete "${label}"? This permanently removes the club, its roster, and all its weekly guides. This can't be undone.`)) return;
    setBusyId(id);
    await adminDeleteClub(id);
    setBusyId(null);
    load();
  }

  async function setRole(id: string, role: UserRole) {
    // Guarded server action — enforces "can't change your own role" on the
    // server, not just via the disabled select in the UI.
    await adminSetMemberRole(id, role);
    load();
  }

  async function setBookStatus(id: string, status: "approved" | "rejected") {
    const supabase = createClient();
    await supabase.from("books").update({ status }).eq("id", id);
    load();
  }

  return (
    <>
      <Nav role={me?.role ?? undefined} email={me?.email} />
      <main className="mx-auto max-w-4xl px-6 py-10">
        <h1 className="font-display text-3xl font-extrabold">Program admin</h1>

        <section className="mt-8">
          <h2 className="font-display text-xl font-extrabold">Access requests</h2>
          <p className="mt-1 text-sm text-muted">
            Approve to generate a password and a ready-to-send welcome email — paste it into a new
            message from your own Outlook. Dismiss to remove spam or mistaken requests.
          </p>

          {result && (
            <div className="mt-4 rounded-lg border border-accent bg-white p-5">
              <div className="flex items-start justify-between">
                <p className="font-display font-bold">Email for {result.name}</p>
                <button onClick={() => setResult(null)} className="text-sm text-muted hover:text-ink">Dismiss</button>
              </div>
              <p className="mt-1 text-xs text-muted">
                Send this from your own mailbox. The password below is set on their account.
              </p>
              <div className="mt-4 space-y-3">
                <CopyRow label="To" value={result.to} />
                <CopyRow label="Subject" value={result.subject} />
                <CopyRow label="Body" value={result.body} multiline />
                <CopyRow label="Password" value={result.password} />
              </div>
            </div>
          )}

          <div className="mt-4 space-y-3">
            {pending.length === 0 && (
              <p className="rounded-md border border-dashed border-line bg-white p-5 text-sm text-muted">
                No requests waiting.
              </p>
            )}
            {pending.map((p) => (
              <div key={p.id} className="flex items-center justify-between rounded-lg border border-line bg-white p-5">
                <div className="text-sm">
                  <p className="font-semibold">{p.full_name || `${p.first_name ?? ""} ${p.last_name ?? ""}`.trim() || p.email}</p>
                  <p className="text-xs text-muted">{p.email}</p>
                  {(p.business_group || p.department) && (
                    <p className="mt-0.5 text-xs text-muted">
                      {[p.business_group, p.department].filter(Boolean).join(" · ")}
                    </p>
                  )}
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => approve(p.id)}
                    disabled={busyId === p.id}
                    className="rounded-md bg-accent px-3 py-1.5 text-xs font-bold text-ink disabled:opacity-60"
                  >
                    {busyId === p.id ? "Approving…" : "Approve"}
                  </button>
                  <button
                    onClick={() => dismiss(p.id)}
                    disabled={busyId === p.id}
                    className="rounded-md border border-line px-3 py-1.5 text-xs font-bold disabled:opacity-60"
                  >
                    Dismiss
                  </button>
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className="mt-10">
          <h2 className="font-display text-xl font-extrabold">Book evaluations</h2>
          <p className="mt-1 text-sm text-muted">
            Leaders&apos; picks land here. Approve to confirm the selection or reject to send them back to the shortlist.
          </p>
          <div className="mt-4 space-y-3">
            {books.filter((b) => b.status === "suggested").length === 0 && (
              <p className="rounded-md border border-dashed border-line bg-white p-5 text-sm text-muted">
                Nothing waiting for review.
              </p>
            )}
            {books.map((b) => (
              <div key={b.id} className="rounded-lg border border-line bg-white p-5">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="font-display font-bold">
                      {b.title}{" "}
                      <span className="font-body text-sm font-normal text-muted">— {b.author}</span>
                    </p>
                    {b.ai_rationale && (
                      <p className="mt-1 text-xs text-muted">AI rationale: {b.ai_rationale}</p>
                    )}
                    <div className="mt-2 flex flex-wrap gap-1">
                      {b.topics.map((t) => <Badge key={t}>{t}</Badge>)}
                    </div>
                  </div>
                  <div className="shrink-0 text-right">
                    <Badge tone={b.status === "approved" ? "accent" : b.status === "rejected" ? "neutral" : "dark"}>
                      {b.status}
                    </Badge>
                    {b.status === "suggested" && (
                      <div className="mt-2 flex gap-2">
                        <button
                          onClick={() => setBookStatus(b.id, "approved")}
                          className="rounded-md bg-accent px-3 py-1.5 text-xs font-bold text-ink"
                        >
                          Approve
                        </button>
                        <button
                          onClick={() => setBookStatus(b.id, "rejected")}
                          className="rounded-md border border-line px-3 py-1.5 text-xs font-bold"
                        >
                          Reject
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className="mt-10">
          <h2 className="font-display text-xl font-extrabold">Clubs</h2>
          <p className="mt-1 text-sm text-muted">
            Every club across all quarters. Deleting removes the club, its roster, and its
            weekly guides for good — use it to clear out test clubs.
          </p>
          <div className="mt-4 space-y-3">
            {clubs.length === 0 && (
              <p className="rounded-md border border-dashed border-line bg-white p-5 text-sm text-muted">
                No clubs yet.
              </p>
            )}
            {clubs.map((c) => (
              <div key={c.id} className="flex items-center justify-between gap-4 rounded-lg border border-line bg-white p-5">
                <div className="min-w-0 text-sm">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge tone="dark">{c.quarter}</Badge>
                    <Badge>{c.status}</Badge>
                  </div>
                  <p className="mt-1.5 font-display font-bold">{c.name}</p>
                  <p className="text-xs text-muted">
                    {c.books?.title ? <>Reading <em>{c.books.title}</em> · </> : null}
                    Led by {c.profiles?.full_name || c.profiles?.email || "—"} ·{" "}
                    {c.enrollments?.length ?? 0}/{c.max_seats} seats
                  </p>
                </div>
                <button
                  onClick={() => removeClub(c.id, c.name)}
                  disabled={busyId === c.id}
                  className="shrink-0 rounded-md border border-line px-3 py-1.5 text-xs font-bold text-red-700 hover:bg-surface disabled:opacity-40"
                >
                  {busyId === c.id ? "Deleting…" : "Delete"}
                </button>
              </div>
            ))}
          </div>
        </section>

        <section className="mt-10">
          <h2 className="font-display text-xl font-extrabold">People &amp; roles</h2>
          <p className="mt-1 text-sm text-muted">
            Everyone starts as an attendee. Promote managers to leader so they can open clubs.
            &ldquo;Last seen&rdquo; is their most recent activity in the app; &ldquo;last login&rdquo;
            is the last time they signed in — together, a quick engagement read.
          </p>
          <div className="mt-4 overflow-hidden rounded-lg border border-line bg-white">
            {people.map((p) => {
              const login = formatSince(lastLogins[p.id], "Never signed in");
              const active = formatSince(p.last_seen_at, "Not yet");
              return (
              <div key={p.id} className="flex items-center justify-between border-b border-surface px-5 py-3 last:border-0">
                <div className="text-sm">
                  <p className="font-semibold">{p.full_name || p.email}</p>
                  {p.full_name && <p className="text-xs text-muted">{p.email}</p>}
                  <p className="mt-0.5 text-xs text-muted">
                    <span title={active.title}>Last seen: <span className={p.last_seen_at ? "font-semibold" : "italic"}>{active.label}</span></span>
                    <span className="mx-1.5 text-line">·</span>
                    <span title={login.title}>Last login: <span className={lastLogins[p.id] ? "font-semibold" : "italic"}>{login.label}</span></span>
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <select
                    value={p.role}
                    onChange={(e) => setRole(p.id, e.target.value as UserRole)}
                    disabled={p.id === me?.id}
                    className="rounded-md border border-line px-2 py-1 text-sm"
                    aria-label={`Role for ${p.email}`}
                  >
                    <option value="member">Attendee</option>
                    <option value="leader">Club leader</option>
                    <option value="admin">Admin</option>
                  </select>
                  <button
                    onClick={() => resetPw(p.id, p.full_name || p.email)}
                    disabled={busyId === p.id}
                    className="rounded-md border border-line px-2 py-1 text-xs font-semibold hover:bg-surface disabled:opacity-40"
                    title="Reset this member's password"
                  >
                    {busyId === p.id ? "…" : "Reset password"}
                  </button>
                  <button
                    onClick={() => remove(p.id, p.full_name || p.email)}
                    disabled={p.id === me?.id || busyId === p.id}
                    className="rounded-md border border-line px-2 py-1 text-xs font-semibold text-red-700 hover:bg-surface disabled:opacity-40"
                    title={p.id === me?.id ? "You can't delete yourself" : "Delete member"}
                  >
                    Delete
                  </button>
                </div>
              </div>
              );
            })}
          </div>
        </section>
      </main>
    </>
  );
}
