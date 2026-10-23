import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { askClaude, parseJson } from "@/lib/anthropic";

// A full 12–13 week guide can push toward max_tokens (8000), and Anthropic's
// token rate varies with load — at slower moments the call exceeds 60s and
// Vercel kills the function (seen as a 499 "client disconnected" on Anthropic's
// side). Pro allows up to 300s; give the generation real headroom.
// NOTE: requires the Vercel Pro plan (Hobby caps at 60s).
export const maxDuration = 300;

interface GuideWeek {
  week_number: number;
  theme: string;
  reading_assignment: string;
  summary: string;
  discussion_questions: string[];
  talking_points: string[];
}

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const { clubId } = await request.json();
  const { data: club } = await supabase
    .from("clubs")
    .select("id, leader_id, weeks, books(title, author, description)")
    .eq("id", clubId)
    .single();
  if (!club) return NextResponse.json({ error: "Club not found" }, { status: 404 });

  const { data: profile } = await supabase
    .from("profiles").select("role").eq("id", user.id).single();
  const authorized = club.leader_id === user.id || profile?.role === "admin";
  if (!authorized) return NextResponse.json({ error: "Club leader only" }, { status: 403 });

  const book = club.books as unknown as { title: string; author: string } | null;
  if (!book) return NextResponse.json({ error: "Attach a book first" }, { status: 400 });

  try {
    const text = await askClaude({
      maxTokens: 8000,
      system: `You create weekly discussion guides for a workplace book club.
The audience is a mixed group of
managers and individual contributors meeting once per week over a quarter.
Divide the book into sensible weekly reading assignments and, for each week, produce
a theme, a 2-3 sentence summary of that section, 4 discussion questions, and 4
talking points the club leader can use to steer conversation (including at least one
that ties back to day-to-day work).
Respond ONLY with a JSON array, no markdown, no preamble. Each element:
{"week_number": 1, "theme": "", "reading_assignment": "e.g. Chapters 1-3",
"summary": "", "discussion_questions": ["", "", "", ""], "talking_points": ["", "", "", ""]}`,
      prompt: `Book: "${book.title}" by ${book.author}. Number of weeks: ${club.weeks}. Produce exactly ${club.weeks} weeks.`
    });

    const weeks = parseJson<GuideWeek[]>(text);
    const rows = weeks.map((w) => ({ ...w, club_id: club.id }));
    if (rows.length === 0) {
      // Never let an empty/garbled model response wipe the existing quarter.
      return NextResponse.json(
        { error: "Guide generation failed", detail: "The model returned no weeks." },
        { status: 502 }
      );
    }

    const { error } = await supabase
      .from("weekly_guides")
      .upsert(rows, { onConflict: "club_id,week_number" });
    if (error) throw error;

    // Regenerate is a replace, not a merge: if a previous run produced more
    // weeks than this one, drop the leftovers so the quarter isn't a mix of
    // two generations. Surviving weeks (1..N) keep their released state.
    const { error: pruneErr } = await supabase
      .from("weekly_guides")
      .delete()
      .eq("club_id", club.id)
      .gt("week_number", rows.length);
    if (pruneErr) throw pruneErr;

    return NextResponse.json({ ok: true, weeks: rows.length });
  } catch (err) {
    // Surface the real cause — this is an internal tool and the generic
    // message was hiding whether the failure was the model, JSON parsing,
    // or the database write.
    const detail = err instanceof Error ? err.message : String(err);
    console.error("generate-guide failed:", err);
    return NextResponse.json(
      { error: "Guide generation failed", detail },
      { status: 500 }
    );
  }
}
