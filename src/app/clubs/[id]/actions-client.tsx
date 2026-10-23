"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { closeClub } from "@/lib/actions";

export function EnrollButton({ clubId }: { clubId: string }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const router = useRouter();

  async function enroll() {
    setBusy(true);
    setError("");
    const res = await fetch("/api/enroll", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ clubId })
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setError(body.error ?? "Enrollment failed. Try again.");
      setBusy(false);
      return;
    }
    router.refresh();
  }

  return (
    <div>
      <button
        onClick={enroll}
        disabled={busy}
        className="rounded-md bg-accent px-6 py-2.5 font-bold text-ink hover:brightness-110 disabled:opacity-60"
      >
        {busy ? "Claiming your seat…" : "Claim a seat"}
      </button>
      {error && <p className="mt-2 text-sm text-red-700">{error}</p>}
    </div>
  );
}

export function GenerateGuidesButton({ clubId, hasGuides }: { clubId: string; hasGuides: boolean }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const router = useRouter();

  async function generate() {
    setBusy(true);
    setError("");
    const res = await fetch("/api/generate-guide", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ clubId })
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setError(
        [body.error ?? "Generation failed. Try again.", body.detail]
          .filter(Boolean)
          .join(" — ")
      );
      setBusy(false);
      return;
    }
    router.refresh();
  }

  return (
    <div className="text-right">
      <button
        onClick={generate}
        disabled={busy}
        className="rounded-md bg-ink px-4 py-2 text-sm font-bold text-white hover:bg-muted disabled:opacity-60"
      >
        {busy ? "Writing the quarter…" : hasGuides ? "Regenerate guides" : "Generate weekly guides"}
      </button>
      {busy && (
        <p className="mt-1 text-xs text-muted">
          This can take a minute or two — please keep this page open while we write the full quarter.
        </p>
      )}
      {error && <p className="mt-1 text-xs text-red-700">{error}</p>}
    </div>
  );
}

export function CloseClubButton({ clubId }: { clubId: string }) {
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  function close() {
    const ok = window.confirm(
      "Close out this club? It moves to your past clubs and stops new sign-ups. This can't be undone."
    );
    if (!ok) return;
    startTransition(async () => {
      await closeClub(clubId);
      router.refresh();
    });
  }

  return (
    <button
      onClick={close}
      disabled={pending}
      className="rounded-md border border-line px-4 py-2 text-sm font-bold text-muted hover:border-muted hover:text-ink disabled:opacity-60"
    >
      {pending ? "Closing…" : "Close out club"}
    </button>
  );
}
