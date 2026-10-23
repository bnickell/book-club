"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { REACTIONS } from "@/lib/config";
import { Badge } from "@/components/ui";
import type { WeeklyGuide } from "@/lib/types";

// Reaction data passed from the server page, keyed by guide id.
type ReactionCounts = Record<string, Record<string, number>>; // guideId -> emoji -> count
type MyReactions = Record<string, string[]>;                   // guideId -> emojis I picked

export function GuideList({
  guides,
  clubId,
  userId,
  isLeader,
  reactionCounts,
  myReactions,
}: {
  guides: WeeklyGuide[];
  clubId: string;
  userId: string;
  isLeader: boolean;
  reactionCounts: ReactionCounts;
  myReactions: MyReactions;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const supabase = createClient();

  const hasHidden = guides.some((g) => !g.released);

  async function setReleased(guideId: string, released: boolean) {
    setBusy(true);
    await supabase.from("weekly_guides").update({ released }).eq("id", guideId);
    setBusy(false);
    router.refresh();
  }

  async function releaseAll(released: boolean) {
    setBusy(true);
    await supabase.from("weekly_guides").update({ released }).eq("club_id", clubId);
    setBusy(false);
    router.refresh();
  }

  async function releaseNext() {
    const next = guides
      .filter((g) => !g.released)
      .sort((a, b) => a.week_number - b.week_number)[0];
    if (!next) return;
    await setReleased(next.id, true);
  }

  return (
    <>
      {isLeader && guides.length > 0 && (
        <div className="mt-3 flex flex-wrap items-center gap-2 rounded-md border border-line bg-surface/50 px-4 py-3 text-sm">
          <span className="font-semibold text-muted">Release to members:</span>
          <button
            onClick={releaseNext}
            disabled={busy || !hasHidden}
            className="rounded-md bg-ink px-3 py-1.5 text-xs font-bold text-white hover:bg-muted disabled:opacity-40"
          >
            Release next week
          </button>
          <button
            onClick={() => releaseAll(true)}
            disabled={busy || !hasHidden}
            className="rounded-md bg-accent px-3 py-1.5 text-xs font-bold text-ink hover:brightness-110 disabled:opacity-40"
          >
            Release all
          </button>
          <button
            onClick={() => releaseAll(false)}
            disabled={busy || guides.every((g) => !g.released)}
            className="rounded-md border border-line px-3 py-1.5 text-xs font-bold disabled:opacity-40"
          >
            Hide all
          </button>
        </div>
      )}

      <div className="mt-4 space-y-4">
        {guides.map((g) => (
          <GuideCard
            key={g.id}
            guide={g}
            isLeader={isLeader}
            busy={busy}
            counts={reactionCounts[g.id] ?? {}}
            mine={myReactions[g.id] ?? []}
            onToggleRelease={() => setReleased(g.id, !g.released)}
            userId={userId}
            onRefresh={() => router.refresh()}
          />
        ))}
      </div>
    </>
  );
}

function GuideCard({
  guide,
  isLeader,
  busy,
  counts,
  mine,
  onToggleRelease,
  userId,
  onRefresh,
}: {
  guide: WeeklyGuide;
  isLeader: boolean;
  busy: boolean;
  counts: Record<string, number>;
  mine: string[];
  onToggleRelease: () => void;
  userId: string;
  onRefresh: () => void;
}) {
  const [pickerOpen, setPickerOpen] = useState(false);
  const [reactBusy, setReactBusy] = useState(false);
  const supabase = createClient();

  async function toggleReaction(emoji: string) {
    setReactBusy(true);
    if (mine.includes(emoji)) {
      await supabase
        .from("guide_reactions")
        .delete()
        .eq("guide_id", guide.id)
        .eq("user_id", userId)
        .eq("emoji", emoji);
    } else {
      await supabase.from("guide_reactions").insert({ guide_id: guide.id, user_id: userId, emoji });
    }
    setReactBusy(false);
    setPickerOpen(false);
    onRefresh();
  }

  const tallies = REACTIONS.filter((e) => (counts[e] ?? 0) > 0);

  return (
    <details className="rounded-lg border border-line bg-white">
      <summary className="flex cursor-pointer select-none items-center justify-between gap-3 px-5 py-4 font-semibold">
        <span className="flex items-center gap-3">
          <span className="inline-block w-16 text-xs font-bold uppercase tracking-wide text-muted">
            Week {guide.week_number}
          </span>
          {guide.theme}
        </span>
        <span className="flex shrink-0 items-center gap-2">
          {isLeader &&
            (guide.released ? (
              <Badge tone="accent">Released</Badge>
            ) : (
              <Badge tone="neutral">Hidden</Badge>
            ))}
          {isLeader && (
            <button
              onClick={(e) => {
                e.preventDefault();
                onToggleRelease();
              }}
              disabled={busy}
              className="rounded-md border border-line px-2.5 py-1 text-xs font-bold hover:bg-surface disabled:opacity-40"
            >
              {guide.released ? "Hide" : "Release"}
            </button>
          )}
        </span>
      </summary>

      <div className="border-t border-surface px-5 py-4 text-sm">
        {guide.reading_assignment && (
          <p className="mb-3">
            <strong>Reading:</strong> {guide.reading_assignment}
          </p>
        )}
        {guide.summary && <p className="mb-4">{guide.summary}</p>}
        <p className="font-bold">Discussion questions</p>
        <ul className="mt-1 list-disc space-y-1 pl-5">
          {guide.discussion_questions.map((q, i) => (
            <li key={i}>{q}</li>
          ))}
        </ul>
        <p className="mt-4 font-bold">Talking points for the leader</p>
        <ul className="mt-1 list-disc space-y-1 pl-5">
          {guide.talking_points.map((t, i) => (
            <li key={i}>{t}</li>
          ))}
        </ul>

        {/* Reactions — collapsed picker that expands to the palette. */}
        <div className="mt-5 flex flex-wrap items-center gap-2 border-t border-surface pt-4">
          {tallies.map((emoji) => {
            const active = mine.includes(emoji);
            return (
              <button
                key={emoji}
                onClick={() => toggleReaction(emoji)}
                disabled={reactBusy}
                className={`flex items-center gap-1 rounded-full border px-2.5 py-1 text-sm ${
                  active ? "border-accent bg-surface" : "border-line bg-white hover:bg-surface"
                }`}
                title={active ? "Remove your reaction" : "Add your reaction"}
              >
                <span>{emoji}</span>
                <span className="text-xs font-semibold text-muted">{counts[emoji]}</span>
              </button>
            );
          })}

          {pickerOpen ? (
            <span className="flex items-center gap-1 rounded-full border border-line bg-white px-1.5 py-0.5">
              {REACTIONS.map((emoji) => (
                <button
                  key={emoji}
                  onClick={() => toggleReaction(emoji)}
                  disabled={reactBusy}
                  className={`rounded-full px-1.5 py-0.5 text-lg hover:bg-surface ${
                    mine.includes(emoji) ? "bg-surface" : ""
                  }`}
                >
                  {emoji}
                </button>
              ))}
              <button
                onClick={() => setPickerOpen(false)}
                className="px-1 text-xs font-semibold text-muted"
                aria-label="Close reactions"
              >
                ✕
              </button>
            </span>
          ) : (
            <button
              onClick={() => setPickerOpen(true)}
              className="rounded-full border border-dashed border-line px-3 py-1 text-xs font-semibold text-muted hover:bg-surface"
            >
              ＋ React
            </button>
          )}
        </div>
      </div>
    </details>
  );
}
