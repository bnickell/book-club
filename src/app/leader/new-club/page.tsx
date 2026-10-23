"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Nav } from "@/components/ui";
import { quarterOptions, currentQuarter, type Profile } from "@/lib/types";

interface Recommendation {
  title: string;
  author: string;
  year: number;
  description: string;
  rationale: string;
}

type BookSource = "ai" | "manual";

export default function NewClubPage() {
  const router = useRouter();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [seats, setSeats] = useState(15);
  const [weeks, setWeeks] = useState(12);
  const [topics, setTopics] = useState("");
  const [source, setSource] = useState<BookSource>("manual");
  const [recs, setRecs] = useState<Recommendation[]>([]);
  const [picked, setPicked] = useState<Recommendation | null>(null);
  // Manual "I already have a book" fields.
  const [manualTitle, setManualTitle] = useState("");
  const [manualAuthor, setManualAuthor] = useState("");
  const [manualYear, setManualYear] = useState("");
  const [manualDescription, setManualDescription] = useState("");
  const [phase, setPhase] = useState<"form" | "recommending" | "picking" | "saving">("form");
  const [error, setError] = useState("");
  // Leaders pick which quarter to run in — run a short club this quarter, or
  // onboard now and kick off next quarter. Default to the current quarter.
  const quarterChoices = quarterOptions(4);
  const thisQuarter = currentQuarter();
  const [quarter, setQuarter] = useState(thisQuarter);
  // If the book row was created but the club insert failed, remember its id so
  // a retry reuses it instead of inserting a duplicate book. Cleared whenever
  // the chosen book changes, so an edited book is saved as a fresh row.
  const createdBookId = useRef<string | null>(null);
  useEffect(() => {
    createdBookId.current = null;
  }, [source, picked, manualTitle, manualAuthor, manualYear, manualDescription]);

  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getUser().then(async ({ data: { user } }) => {
      if (!user) return router.push("/login");
      const { data } = await supabase.from("profiles").select("*").eq("id", user.id).single();
      const p = data as Profile;
      if (p.role === "member") return router.push("/dashboard");
      setProfile(p);
    });
  }, [router]);

  async function getRecommendations() {
    if (!topics.trim()) {
      setError("Add at least one focus topic so the AI knows what to look for.");
      return;
    }
    setError("");
    setPhase("recommending");
    try {
      const res = await fetch("/api/recommend-books", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ topics: topics.split(",").map((t) => t.trim()).filter(Boolean) })
      });
      if (!res.ok) {
        setError("Couldn't get recommendations. Try again.");
        setPhase("form");
        return;
      }
      const data = await res.json();
      setRecs(data.recommendations ?? []);
      setPhase("picking");
    } catch {
      // Network drop / non-JSON body — don't leave the button stuck on
      // "Reading the catalog…". Return to the form so they can retry.
      setError("Couldn't reach the recommendation service. Check your connection and try again.");
      setPhase("form");
    }
  }

  // Resolve the book payload from whichever source the leader chose.
  function resolveBook() {
    if (source === "manual") {
      if (!manualTitle.trim() || !manualAuthor.trim()) return null;
      const year = Number.parseInt(manualYear, 10);
      return {
        title: manualTitle.trim(),
        author: manualAuthor.trim(),
        year: Number.isFinite(year) ? year : null,
        description: manualDescription.trim() || null,
        rationale: null as string | null
      };
    }
    if (!picked) return null;
    return {
      title: picked.title,
      author: picked.author,
      year: picked.year,
      description: picked.description,
      rationale: picked.rationale as string | null
    };
  }

  async function createClub() {
    const chosen = resolveBook();
    if (!name.trim() || !chosen) return;
    // Guard the numeric fields — the input min/max are only hints, and a
    // cleared field yields 0 (e.g. max_seats:0 = a club nobody can join).
    if (!Number.isInteger(seats) || seats < 3 || seats > 100) {
      setError("Max seats must be a whole number between 3 and 100.");
      return;
    }
    if (!Number.isInteger(weeks) || weeks < 4 || weeks > 13) {
      setError("Discussion weeks must be a whole number between 4 and 13.");
      return;
    }
    const backTo = source === "manual" ? "form" : "picking";
    setPhase("saving");
    setError("");
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return router.push("/login");

    // Book goes in as "suggested" — an admin reviews it from /admin. Reuse an
    // already-created book row on retry so a failed club insert doesn't spawn
    // duplicate books.
    let bookId = createdBookId.current;
    if (!bookId) {
      const { data: book, error: bookErr } = await supabase
        .from("books")
        .insert({
          title: chosen.title,
          author: chosen.author,
          year: chosen.year,
          description: chosen.description,
          topics: topics.split(",").map((t) => t.trim()).filter(Boolean),
          ai_rationale: chosen.rationale,
          suggested_by: user.id
        })
        .select()
        .single();

      if (bookErr || !book) {
        setError(bookErr?.message ?? "Couldn't save the book.");
        setPhase(backTo);
        return;
      }
      bookId = book.id;
      createdBookId.current = book.id;
    }

    const { data: club, error: clubErr } = await supabase
      .from("clubs")
      .insert({
        name: name.trim(),
        quarter,
        description: description.trim() || null,
        book_id: bookId,
        leader_id: user.id,
        max_seats: seats,
        weeks,
        status: "open"
      })
      .select()
      .single();

    if (clubErr || !club) {
      setError(clubErr?.message ?? "Couldn't create the club.");
      setPhase(backTo);
      return;
    }
    router.push(`/clubs/${club.id}`);
  }

  const manualReady = manualTitle.trim() && manualAuthor.trim();

  return (
    <>
      <Nav role={profile?.role ?? undefined} email={profile?.email} />
      <main className="mx-auto max-w-3xl px-6 py-10">
        <p className="text-xs font-bold uppercase tracking-[0.2em] text-muted">
          New club · {quarter}
        </p>
        <h1 className="mt-1 font-display text-3xl font-extrabold">Start a book club</h1>

        <div className="mt-8 space-y-5 rounded-lg border border-line bg-white p-6">
          <div>
            <label htmlFor="name" className="block text-sm font-semibold">Club name</label>
            <input
              id="name" value={name} onChange={(e) => setName(e.target.value)}
              placeholder="e.g. EMS Leadership Reading Group"
              className="mt-1 w-full rounded-md border border-line px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label htmlFor="desc" className="block text-sm font-semibold">Description (optional)</label>
            <textarea
              id="desc" value={description} onChange={(e) => setDescription(e.target.value)}
              rows={2} className="mt-1 w-full rounded-md border border-line px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label htmlFor="quarter" className="block text-sm font-semibold">Quarter</label>
            <select
              id="quarter" value={quarter} onChange={(e) => setQuarter(e.target.value)}
              className="mt-1 w-full rounded-md border border-line bg-white px-3 py-2 text-sm"
            >
              {quarterChoices.map((q) => (
                <option key={q} value={q}>
                  {q}{q === thisQuarter ? " · this quarter" : ""}
                </option>
              ))}
            </select>
            <p className="mt-1 text-xs text-muted">
              Run a short club this quarter, or pick a later one to prep now and kick off then.
            </p>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label htmlFor="seats" className="block text-sm font-semibold">Max seats</label>
              <input
                id="seats" type="number" min={3} max={100} value={seats}
                onChange={(e) => setSeats(Number(e.target.value))}
                className="mt-1 w-full rounded-md border border-line px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label htmlFor="weeks" className="block text-sm font-semibold">Discussion weeks</label>
              <input
                id="weeks" type="number" min={4} max={13} value={weeks}
                onChange={(e) => setWeeks(Number(e.target.value))}
                className="mt-1 w-full rounded-md border border-line px-3 py-2 text-sm"
              />
            </div>
          </div>
        </div>

        {/* Choose how to pick the book: bring your own, or let the AI suggest. */}
        <section className="mt-8">
          <h2 className="font-display text-xl font-extrabold">Choose this quarter&apos;s book</h2>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <button
              type="button"
              onClick={() => { setSource("manual"); setError(""); }}
              className={`rounded-lg border p-4 text-left transition-colors ${
                source === "manual"
                  ? "border-accent bg-surface"
                  : "border-line bg-white hover:border-muted"
              }`}
            >
              <p className="font-display font-bold">I already have a book</p>
              <p className="mt-1 text-xs text-muted">Enter a title you&apos;ve chosen yourself.</p>
            </button>
            <button
              type="button"
              onClick={() => { setSource("ai"); setError(""); }}
              className={`rounded-lg border p-4 text-left transition-colors ${
                source === "ai"
                  ? "border-accent bg-surface"
                  : "border-line bg-white hover:border-muted"
              }`}
            >
              <p className="font-display font-bold">Recommend books for me</p>
              <p className="mt-1 text-xs text-muted">Get AI picks based on focus topics.</p>
            </button>
          </div>
        </section>

        {source === "manual" && (
          <section className="mt-6 space-y-5 rounded-lg border border-line bg-white p-6">
            <div>
              <label htmlFor="mtitle" className="block text-sm font-semibold">Book title</label>
              <input
                id="mtitle" value={manualTitle} onChange={(e) => setManualTitle(e.target.value)}
                placeholder="e.g. The Making of a Manager"
                className="mt-1 w-full rounded-md border border-line px-3 py-2 text-sm"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label htmlFor="mauthor" className="block text-sm font-semibold">Author</label>
                <input
                  id="mauthor" value={manualAuthor} onChange={(e) => setManualAuthor(e.target.value)}
                  placeholder="e.g. Julie Zhuo"
                  className="mt-1 w-full rounded-md border border-line px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label htmlFor="myear" className="block text-sm font-semibold">
                  Year <span className="font-normal text-muted">(optional)</span>
                </label>
                <input
                  id="myear" type="number" value={manualYear}
                  onChange={(e) => setManualYear(e.target.value)}
                  placeholder="e.g. 2019"
                  className="mt-1 w-full rounded-md border border-line px-3 py-2 text-sm"
                />
              </div>
            </div>
            <div>
              <label htmlFor="mdesc" className="block text-sm font-semibold">
                Description <span className="font-normal text-muted">(optional)</span>
              </label>
              <textarea
                id="mdesc" value={manualDescription} onChange={(e) => setManualDescription(e.target.value)}
                rows={2} className="mt-1 w-full rounded-md border border-line px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label htmlFor="mtopics" className="block text-sm font-semibold">
                Focus topics <span className="font-normal text-muted">(optional, comma-separated)</span>
              </label>
              <input
                id="mtopics" value={topics} onChange={(e) => setTopics(e.target.value)}
                placeholder="e.g. leadership, product strategy"
                className="mt-1 w-full rounded-md border border-line px-3 py-2 text-sm"
              />
              <p className="mt-1 text-xs text-muted">
                Used to focus the weekly discussion guides you generate later.
              </p>
            </div>
            <button
              onClick={createClub}
              disabled={!manualReady || !name.trim() || phase === "saving"}
              className="rounded-md bg-accent px-6 py-2.5 font-bold text-ink hover:brightness-110 disabled:opacity-50"
            >
              {phase === "saving" ? "Opening the club…" : `Open club for ${quarter}`}
            </button>
            {!name.trim() && manualReady && (
              <p className="text-xs text-muted">Add a club name above to continue.</p>
            )}
          </section>
        )}

        {source === "ai" && (
          <section className="mt-6 space-y-5 rounded-lg border border-line bg-white p-6">
            <div>
              <label htmlFor="topics" className="block text-sm font-semibold">
                Focus topics <span className="font-normal text-muted">(comma-separated)</span>
              </label>
              <input
                id="topics" value={topics} onChange={(e) => setTopics(e.target.value)}
                placeholder="e.g. leadership, product strategy, cross-team communication"
                className="mt-1 w-full rounded-md border border-line px-3 py-2 text-sm"
              />
              <button
                onClick={getRecommendations}
                disabled={phase === "recommending"}
                className="mt-3 rounded-md bg-ink px-5 py-2 text-sm font-bold text-white hover:bg-muted disabled:opacity-60"
              >
                {phase === "recommending" ? "Reading the catalog…" : "Recommend books"}
              </button>
            </div>
          </section>
        )}

        {source === "ai" && recs.length > 0 && (
          <section className="mt-8">
            <h2 className="font-display text-xl font-extrabold">Pick this quarter&apos;s book</h2>
            <div className="mt-4 space-y-3">
              {recs.map((r) => (
                <button
                  key={r.title}
                  onClick={() => setPicked(r)}
                  className={`block w-full rounded-lg border p-5 text-left transition-colors ${
                    picked?.title === r.title
                      ? "border-accent bg-surface"
                      : "border-line bg-white hover:border-muted"
                  }`}
                >
                  <p className="font-display font-bold">
                    {r.title}{" "}
                    <span className="font-body text-sm font-normal text-muted">
                      — {r.author}, {r.year}
                    </span>
                  </p>
                  <p className="mt-1 text-sm">{r.description}</p>
                  <p className="mt-2 text-xs font-semibold text-muted">Why this pick: {r.rationale}</p>
                </button>
              ))}
            </div>
            <button
              onClick={createClub}
              disabled={!picked || !name.trim() || phase === "saving"}
              className="mt-6 rounded-md bg-accent px-6 py-2.5 font-bold text-ink hover:brightness-110 disabled:opacity-50"
            >
              {phase === "saving" ? "Opening the club…" : `Open club for ${quarter}`}
            </button>
            {!name.trim() && picked && (
              <p className="mt-2 text-xs text-muted">Add a club name above to continue.</p>
            )}
          </section>
        )}

        {error && <p className="mt-4 text-sm text-red-700">{error}</p>}
      </main>
    </>
  );
}
