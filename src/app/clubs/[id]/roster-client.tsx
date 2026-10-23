"use client";

import { useState } from "react";

type RosterMember = { name: string; email: string };

// Leader-only roster: shows each member's email and gives one-click copy
// buttons so the leader can drop the list straight into an Outlook invite.
export function LeaderRoster({ members }: { members: RosterMember[] }) {
  const [copied, setCopied] = useState<"emails" | "list" | null>(null);

  const emails = members.map((m) => m.email).filter(Boolean);
  // Semicolons are what Outlook's To/CC fields expect.
  const emailLine = emails.join("; ");
  const nameList = members.map((m) => `${m.name} <${m.email}>`).join("\n");

  async function copy(kind: "emails" | "list", text: string) {
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
      setCopied(kind);
      setTimeout(() => setCopied(null), 1500);
    } catch {
      alert("Clipboard was blocked — select the addresses below and copy them manually.");
    }
  }

  if (members.length === 0) {
    return <p className="mt-3 text-sm text-muted">No sign-ups yet.</p>;
  }

  return (
    <div className="mt-3">
      <div className="flex flex-wrap items-center gap-2">
        <button
          onClick={() => copy("emails", emailLine)}
          className="rounded-md bg-ink px-3 py-1.5 text-xs font-bold text-white hover:bg-muted"
        >
          {copied === "emails" ? "Copied ✓" : "Copy emails for Outlook"}
        </button>
        <button
          onClick={() => copy("list", nameList)}
          className="rounded-md border border-line px-3 py-1.5 text-xs font-bold hover:bg-surface"
        >
          {copied === "list" ? "Copied ✓" : "Copy name + email list"}
        </button>
        <span className="text-xs text-muted">
          Paste into the To field of a meeting invite.
        </span>
      </div>

      <ul className="mt-3 grid gap-2 text-sm sm:grid-cols-2">
        {members.map((m) => (
          <li key={m.email || m.name} className="rounded-md bg-white px-4 py-2">
            <span className="font-semibold">{m.name}</span>
            {m.email && <span className="ml-2 text-muted">{m.email}</span>}
          </li>
        ))}
      </ul>
    </div>
  );
}
