"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import type { ClubRating } from "@/lib/types";

function Stars({
  value,
  onChange,
  label,
}: {
  value: number;
  onChange: (v: number) => void;
  label: string;
}) {
  return (
    <div className="flex items-center gap-3">
      <span className="w-16 text-sm font-semibold">{label}</span>
      <div className="flex gap-1">
        {[1, 2, 3, 4, 5].map((n) => (
          <button
            key={n}
            type="button"
            onClick={() => onChange(n === value ? 0 : n)}
            aria-label={`${label} ${n} star${n > 1 ? "s" : ""}`}
            className={`text-2xl leading-none transition-colors ${
              n <= value ? "text-accent" : "text-line hover:text-muted"
            }`}
          >
            ★
          </button>
        ))}
      </div>
    </div>
  );
}

export function RatingWidget({
  clubId,
  userId,
  existing,
}: {
  clubId: string;
  userId: string;
  existing: ClubRating | null;
}) {
  const router = useRouter();
  const supabase = createClient();
  const [book, setBook] = useState(existing?.book_rating ?? 0);
  const [club, setClub] = useState(existing?.club_rating ?? 0);
  const [comment, setComment] = useState(existing?.comment ?? "");
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);

  async function save() {
    setBusy(true);
    setSaved(false);
    const { error } = await supabase.from("club_ratings").upsert(
      {
        club_id: clubId,
        user_id: userId,
        book_rating: book || null,
        club_rating: club || null,
        comment: comment.trim() || null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "club_id,user_id" }
    );
    setBusy(false);
    if (!error) {
      setSaved(true);
      router.refresh();
    }
  }

  return (
    <div className="rounded-lg border border-line bg-white p-6">
      <p className="text-xs font-bold uppercase tracking-[0.2em] text-muted">Your feedback</p>
      <h2 className="mt-1 font-display text-xl font-bold">Rate the book &amp; club</h2>
      <p className="mt-1 text-sm text-muted">
        Only program admins see this — it helps them shape future clubs. Your leader can&apos;t see it.
      </p>

      <div className="mt-4 space-y-3">
        <Stars value={book} onChange={setBook} label="Book" />
        <Stars value={club} onChange={setClub} label="Club" />
      </div>

      <label htmlFor="rating-comment" className="mt-4 block text-sm font-semibold">
        Comment <span className="font-normal text-muted">(optional)</span>
      </label>
      <textarea
        id="rating-comment"
        value={comment}
        onChange={(e) => setComment(e.target.value)}
        rows={2}
        placeholder="What worked, what you'd change…"
        className="mt-1 w-full rounded-md border border-line px-3 py-2 text-sm"
      />

      <div className="mt-3 flex items-center gap-3">
        <button
          onClick={save}
          disabled={busy || (!book && !club && !comment.trim())}
          className="rounded-md bg-accent px-5 py-2 text-sm font-bold text-ink hover:brightness-110 disabled:opacity-50"
        >
          {busy ? "Saving…" : existing ? "Update feedback" : "Submit feedback"}
        </button>
        {saved && <span className="text-sm font-semibold text-muted">Saved ✓</span>}
      </div>
    </div>
  );
}
