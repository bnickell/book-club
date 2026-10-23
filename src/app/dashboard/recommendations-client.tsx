"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export interface RecommendationRow {
  id: string;
  user_id: string;
  title: string;
  author: string | null;
  note: string | null;
  recommender: string; // display name/email
  votes: number;
  votedByMe: boolean;
}

export function RecommendationsBoard({
  initial,
  userId,
  isAdmin,
  loadError = null,
}: {
  initial: RecommendationRow[];
  userId: string;
  isAdmin: boolean;
  loadError?: string | null;
}) {
  const router = useRouter();
  const supabase = createClient();
  const [title, setTitle] = useState("");
  const [author, setAuthor] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function add() {
    if (!title.trim()) {
      setError("Add at least a title.");
      return;
    }
    setError("");
    setBusy(true);
    const { data: inserted, error } = await supabase
      .from("book_recommendations")
      .insert({
        user_id: userId,
        title: title.trim(),
        author: author.trim() || null,
        note: note.trim() || null,
      })
      .select("id")
      .single();
    if (error) {
      // Surface the real Postgres/PostgREST message — a missing table or an
      // RLS rejection is otherwise invisible and looks like the row vanished.
      console.error("book_recommendations insert failed:", error);
      setError(error.message || "Couldn't save that. Try again.");
      setBusy(false);
      return;
    }
    // Count the recommender as the first upvote so their pick starts at 1
    // and is easy to spot instead of sinking to the bottom with 0 votes.
    if (inserted) {
      const { error: voteError } = await supabase
        .from("recommendation_votes")
        .insert({ recommendation_id: inserted.id, user_id: userId });
      if (voteError) console.error("self-upvote failed:", voteError);
    }
    setBusy(false);
    setTitle("");
    setAuthor("");
    setNote("");
    router.refresh();
  }

  async function toggleVote(rec: RecommendationRow) {
    if (rec.votedByMe) {
      await supabase
        .from("recommendation_votes")
        .delete()
        .eq("recommendation_id", rec.id)
        .eq("user_id", userId);
    } else {
      await supabase
        .from("recommendation_votes")
        .insert({ recommendation_id: rec.id, user_id: userId });
    }
    router.refresh();
  }

  async function remove(id: string) {
    if (!confirm("Remove this recommendation?")) return;
    await supabase.from("book_recommendations").delete().eq("id", id);
    router.refresh();
  }

  const sorted = [...initial].sort((a, b) => b.votes - a.votes || a.title.localeCompare(b.title));

  return (
    <section>
      <h2 className="font-display text-xl font-extrabold">Books we should read</h2>
      <p className="mt-1 text-sm text-muted">
        Suggest a book for a future club and upvote the ones you&apos;d join. Leaders use this to
        decide what to open next quarter.
      </p>

      {loadError && (
        <div className="mt-4 rounded-lg border border-red-300 bg-red-50 p-3 text-sm text-red-800">
          Couldn&apos;t load recommendations: {loadError}
        </div>
      )}

      <div className="mt-4 rounded-lg border border-line bg-white p-4">
        <div>
          <label htmlFor="rec-title" className="block text-sm font-semibold">Title</label>
          <input
            id="rec-title" value={title} onChange={(e) => setTitle(e.target.value)}
            placeholder="e.g. Thinking, Fast and Slow"
            className="mt-1 w-full rounded-md border border-line px-3 py-2 text-sm"
          />
        </div>
        <label htmlFor="rec-author" className="mt-3 block text-sm font-semibold">
          Author <span className="font-normal text-muted">(optional)</span>
        </label>
        <input
          id="rec-author" value={author} onChange={(e) => setAuthor(e.target.value)}
          placeholder="e.g. Daniel Kahneman"
          className="mt-1 w-full rounded-md border border-line px-3 py-2 text-sm"
        />
        <label htmlFor="rec-note" className="mt-3 block text-sm font-semibold">
          Why this one? <span className="font-normal text-muted">(optional)</span>
        </label>
        <textarea
          id="rec-note" value={note} onChange={(e) => setNote(e.target.value)} rows={2}
          className="mt-1 w-full rounded-md border border-line px-3 py-2 text-sm"
        />
        <div className="mt-3 flex flex-col gap-2">
          <button
            onClick={add}
            disabled={busy}
            className="rounded-md bg-ink px-5 py-2 text-sm font-bold text-white hover:bg-muted disabled:opacity-60"
          >
            {busy ? "Adding…" : "Recommend book"}
          </button>
          {error && <span className="text-sm text-red-700">{error}</span>}
        </div>
      </div>

      {sorted.length > 0 && (
        <ul className="mt-4 space-y-3">
          {sorted.map((rec) => (
            <li
              key={rec.id}
              className="flex items-start gap-3 rounded-lg border border-line bg-white p-3"
            >
              <button
                onClick={() => toggleVote(rec)}
                className={`flex w-11 shrink-0 flex-col items-center rounded-md border px-2 py-1.5 text-sm font-bold transition-colors ${
                  rec.votedByMe
                    ? "border-accent bg-surface text-ink"
                    : "border-line bg-white text-muted hover:bg-surface"
                }`}
                aria-label={rec.votedByMe ? "Remove your upvote" : "Upvote"}
              >
                <span className="text-base leading-none">▲</span>
                <span>{rec.votes}</span>
              </button>
              <div className="min-w-0 flex-1">
                <p className="font-display font-bold">
                  {rec.title}
                  {rec.author && (
                    <span className="font-body text-sm font-normal text-muted"> — {rec.author}</span>
                  )}
                </p>
                {rec.note && <p className="mt-1 text-sm">{rec.note}</p>}
                <p className="mt-1 text-xs text-muted">Suggested by {rec.recommender}</p>
              </div>
              {(rec.user_id === userId || isAdmin) && (
                <button
                  onClick={() => remove(rec.id)}
                  className="shrink-0 rounded-md border border-line px-2 py-1 text-xs font-semibold text-red-700 hover:bg-surface"
                >
                  Remove
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
