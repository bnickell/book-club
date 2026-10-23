import { redirect, notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Nav, Badge } from "@/components/ui";
import { EnrollButton, GenerateGuidesButton, CloseClubButton } from "./actions-client";
import { GuideList } from "./guide-client";
import { RatingWidget } from "./rating-client";
import { LeaderRoster } from "./roster-client";
import { clubPhase, type BookStatus, type Club, type ClubRating, type Profile, type WeeklyGuide } from "@/lib/types";

export default async function ClubPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles").select("*").eq("id", user.id).single<Profile>();

  const { data: club } = await supabase
    .from("clubs")
    .select("*, books(*), profiles!clubs_leader_id_fkey(full_name, email)")
    .eq("id", id)
    .single();
  if (!club) notFound();

  const typedClub = club as Club & {
    books: { title: string; author: string; description: string | null; ai_rationale: string | null; status: BookStatus } | null;
    profiles: { full_name: string | null; email: string } | null;
  };

  const { data: enrollments } = await supabase
    .from("enrollments")
    .select("user_id, profiles(full_name, email)")
    .eq("club_id", id);

  // RLS returns released-only for members; all weeks for leader/admin.
  const { data: guidesData } = await supabase
    .from("weekly_guides")
    .select("*")
    .eq("club_id", id)
    .order("week_number");
  const guides = (guidesData ?? []) as WeeklyGuide[];

  // Reactions for the visible guides → counts + which ones the current user picked.
  const guideIds = guides.map((g) => g.id);
  const reactionCounts: Record<string, Record<string, number>> = {};
  const myReactions: Record<string, string[]> = {};
  if (guideIds.length) {
    const { data: reactions } = await supabase
      .from("guide_reactions")
      .select("guide_id, emoji, user_id")
      .in("guide_id", guideIds);
    for (const r of reactions ?? []) {
      (reactionCounts[r.guide_id] ??= {});
      reactionCounts[r.guide_id][r.emoji] = (reactionCounts[r.guide_id][r.emoji] ?? 0) + 1;
      if (r.user_id === user.id) (myReactions[r.guide_id] ??= []).push(r.emoji);
    }
  }

  const enrolled = enrollments?.some((e) => e.user_id === user.id) ?? false;
  const isLeader = typedClub.leader_id === user.id || profile?.role === "admin";
  const isAdmin = profile?.role === "admin";
  // Quarterly lifecycle: a past club (quarter rolled by, or closed early) is
  // read-only — no enrolling, no guide generation, no closing.
  const phase = clubPhase(typedClub);
  const isPast = phase === "past";
  const seatsTaken = enrollments?.length ?? 0;
  const full = seatsTaken >= typedClub.max_seats;
  // Only attendees claim seats; admins/leaders manage clubs, they don't take seats.
  const canClaimSeat = profile?.role === "member";

  // Ratings: the current user's own row (to prefill), and — admins only — all rows.
  const { data: myRating } = await supabase
    .from("club_ratings").select("*").eq("club_id", id).eq("user_id", user.id).maybeSingle<ClubRating>();

  let allRatings: (ClubRating & { profiles: { full_name: string | null; email: string } | null })[] = [];
  if (isAdmin) {
    const { data } = await supabase
      .from("club_ratings")
      .select("*, profiles(full_name, email)")
      .eq("club_id", id)
      .order("created_at", { ascending: false });
    allRatings = (data ?? []) as typeof allRatings;
  }

  const avg = (nums: (number | null)[]) => {
    const vals = nums.filter((n): n is number => typeof n === "number");
    return vals.length ? (vals.reduce((a, b) => a + b, 0) / vals.length).toFixed(1) : "—";
  };

  return (
    <>
      <Nav role={profile?.role} email={profile?.email} />
      <main className="mx-auto max-w-4xl px-6 py-10">
        <div className="flex items-center gap-2">
          <Badge tone="dark">{typedClub.quarter}</Badge>
          {isPast ? <Badge>Archived</Badge> : <Badge>{typedClub.status}</Badge>}
        </div>
        <h1 className="mt-2 font-display text-3xl font-extrabold">{typedClub.name}</h1>
        <p className="mt-1 text-sm text-muted">
          Led by {typedClub.profiles?.full_name || typedClub.profiles?.email} ·{" "}
          {seatsTaken}/{typedClub.max_seats} seats
        </p>

        {typedClub.books && (
          <section className="mt-6 rounded-lg border border-line bg-white p-6">
            <p className="text-xs font-bold uppercase tracking-[0.2em] text-muted">
              This quarter&apos;s book
            </p>
            <h2 className="mt-1 font-display text-xl font-bold">
              {typedClub.books.title}
              <span className="ml-2 font-body text-base font-normal text-muted">
                by {typedClub.books.author}
              </span>
            </h2>
            {typedClub.books.description && (
              <p className="mt-3 text-sm leading-relaxed">{typedClub.books.description}</p>
            )}
            {/* Admin book review is advisory — the club runs regardless — but a
                rejection is the leader's cue to swap in a different book. */}
            {isLeader && typedClub.books.status === "rejected" && (
              <p className="mt-4 rounded-md border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-800">
                An admin didn&apos;t approve this book. The club still runs, but
                please choose a different book for this quarter.
              </p>
            )}
            {isLeader && typedClub.books.status === "suggested" && (
              <p className="mt-4 rounded-md bg-surface px-4 py-3 text-sm text-muted">
                This book is pending admin review.
              </p>
            )}
          </section>
        )}

        {typedClub.description && <p className="mt-5 text-sm">{typedClub.description}</p>}

        {canClaimSeat && !enrolled && typedClub.status === "open" && !full && !isPast && (
          <div className="mt-6">
            <EnrollButton clubId={typedClub.id} />
          </div>
        )}
        {canClaimSeat && enrolled && (
          <p className="mt-6 rounded-md bg-surface px-4 py-3 text-sm font-semibold">
            You&apos;re enrolled in this club. See you at the first discussion.
          </p>
        )}

        <section className="mt-10">
          <div className="flex items-center justify-between">
            <h2 className="font-display text-2xl font-extrabold">Weekly discussion guides</h2>
            {isLeader && !isPast && (
              <div className="flex items-center gap-3">
                <CloseClubButton clubId={typedClub.id} />
                {typedClub.books && (
                  <GenerateGuidesButton clubId={typedClub.id} hasGuides={guides.length > 0} />
                )}
              </div>
            )}
          </div>

          {guides.length === 0 ? (
            <p className="mt-3 rounded-md border border-dashed border-line bg-white p-6 text-sm text-muted">
              {isLeader
                ? "No guides yet. Once a book is attached, generate a full quarter of weekly themes, talking points, and discussion questions — then release them to members week by week."
                : "Guides appear here once the club leader releases them."}
            </p>
          ) : (
            <GuideList
              guides={guides}
              clubId={typedClub.id}
              userId={user.id}
              isLeader={isLeader}
              reactionCounts={reactionCounts}
              myReactions={myReactions}
            />
          )}
        </section>

        {enrolled && (
          <section className="mt-10">
            <RatingWidget clubId={typedClub.id} userId={user.id} existing={myRating ?? null} />
          </section>
        )}

        {isAdmin && (
          <section className="mt-10">
            <h2 className="font-display text-xl font-extrabold">Member ratings</h2>
            <p className="mt-1 text-sm text-muted">Admin-only. Leaders don&apos;t see this.</p>
            <div className="mt-4 rounded-lg border border-line bg-white p-6">
              <div className="flex gap-8">
                <div>
                  <p className="font-display text-3xl font-extrabold">{avg(allRatings.map((r) => r.book_rating))}</p>
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted">Book · avg</p>
                </div>
                <div>
                  <p className="font-display text-3xl font-extrabold">{avg(allRatings.map((r) => r.club_rating))}</p>
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted">Club · avg</p>
                </div>
                <div>
                  <p className="font-display text-3xl font-extrabold">{allRatings.length}</p>
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted">Responses</p>
                </div>
              </div>

              {allRatings.length > 0 && (
                <ul className="mt-5 space-y-3 border-t border-surface pt-4">
                  {allRatings.map((r) => (
                    <li key={r.id} className="text-sm">
                      <span className="font-semibold">{r.profiles?.full_name || r.profiles?.email}</span>
                      <span className="ml-2 text-muted">
                        Book {r.book_rating ?? "—"}★ · Club {r.club_rating ?? "—"}★
                      </span>
                      {r.comment && <p className="mt-0.5 text-muted">&ldquo;{r.comment}&rdquo;</p>}
                    </li>
                  ))}
                </ul>
              )}
              {allRatings.length === 0 && (
                <p className="mt-4 text-sm text-muted">No ratings submitted yet.</p>
              )}
            </div>
          </section>
        )}

        <section className="mt-10">
          <h2 className="font-display text-xl font-extrabold">Roster</h2>
          {isLeader ? (
            <LeaderRoster
              members={(enrollments ?? []).map((e) => {
                const p = e.profiles as unknown as { full_name: string | null; email: string } | null;
                return { name: p?.full_name || p?.email || "Member", email: p?.email ?? "" };
              })}
            />
          ) : (
            <ul className="mt-3 grid gap-2 text-sm sm:grid-cols-2">
              {enrollments?.map((e) => {
                const p = e.profiles as unknown as { full_name: string | null; email: string } | null;
                return (
                  <li key={e.user_id} className="rounded-md bg-white px-4 py-2">
                    {p?.full_name || p?.email}
                  </li>
                );
              })}
              {seatsTaken === 0 && <li className="text-muted">No sign-ups yet.</li>}
            </ul>
          )}
        </section>
      </main>
    </>
  );
}
