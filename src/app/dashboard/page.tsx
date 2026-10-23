import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Nav } from "@/components/ui";
import { nextQuarter, currentQuarter, type Club, type Profile } from "@/lib/types";
import { RecommendationsBoard, type RecommendationRow } from "./recommendations-client";
import { ActivityFeed, type ActivityItem } from "./activity-feed";
import { ClubsBrowser, type ClubCard } from "./clubs-browser";
import { PastClubs, type PastClubCard } from "./past-clubs";

function timeAgo(iso: string): string {
  const seconds = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  const weeks = Math.floor(days / 7);
  return `${weeks}w ago`;
}

export default async function Dashboard() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles").select("*").eq("id", user.id).single<Profile>();

  const quarter = nextQuarter();
  const cq = currentQuarter();
  const isAdmin = profile?.role === "admin";

  // Live shelf: still open/active AND this quarter or a future one. A club
  // whose quarter has rolled by (quarter < cq) drops off automatically.
  const { data: clubs } = await supabase
    .from("clubs")
    .select(
      "*, books(title, author), enrollments(user_id), profiles!clubs_leader_id_fkey(business_group, department)"
    )
    .in("status", ["open", "active"])
    .gte("quarter", cq)
    .order("created_at", { ascending: false });

  type ClubRow = Club & {
    books: { title: string; author: string } | null;
    enrollments: { user_id: string }[];
    profiles: { business_group: string | null; department: string | null } | null;
  };
  const rows = (clubs ?? []) as ClubRow[];

  // Serializable cards for the client-side filter/browse UI. A club's
  // business group and department are inherited from its leader's profile.
  const cards: ClubCard[] = rows.map((club) => {
    const seatsTaken = club.enrollments?.length ?? 0;
    return {
      id: club.id,
      name: club.name,
      quarter: club.quarter,
      weeks: club.weeks,
      bookTitle: club.books?.title ?? null,
      bookAuthor: club.books?.author ?? null,
      seatsTaken,
      maxSeats: club.max_seats,
      enrolled: club.enrollments?.some((e) => e.user_id === user.id) ?? false,
      full: seatsTaken >= club.max_seats,
      businessGroup: club.profiles?.business_group ?? null,
      department: club.profiles?.department ?? null,
      // Live shelf holds only quarter >= cq, so a club is either running
      // this quarter or still upcoming.
      phase: club.quarter === cq ? "running" : "upcoming",
    };
  });

  // Past clubs (archive): completed early, or their quarter has rolled by.
  // Scoped to clubs the user actually took part in (led or enrolled);
  // admins see every past club. Ordered newest quarter first.
  const { data: enrolledRows } = await supabase
    .from("enrollments").select("club_id").eq("user_id", user.id);
  const enrolledIds = new Set((enrolledRows ?? []).map((e) => e.club_id as string));

  const { data: pastRows } = await supabase
    .from("clubs")
    .select("*, books(title, author), enrollments(user_id)")
    .or(`status.eq.completed,quarter.lt.${cq}`)
    .order("quarter", { ascending: false });

  type PastRow = Club & {
    books: { title: string; author: string } | null;
    enrollments: { user_id: string }[];
  };
  const pastCards: PastClubCard[] = ((pastRows ?? []) as PastRow[])
    .filter((c) => isAdmin || c.leader_id === user.id || enrolledIds.has(c.id))
    .map((c) => ({
      id: c.id,
      name: c.name,
      quarter: c.quarter,
      bookTitle: c.books?.title ?? null,
      bookAuthor: c.books?.author ?? null,
      members: c.enrollments?.length ?? 0,
      wasLeader: c.leader_id === user.id,
      closedEarly: c.status === "completed",
    }));

  // Global book-recommendation board (informs future clubs).
  const { data: recs, error: recsError } = await supabase
    .from("book_recommendations")
    .select("id, user_id, title, author, note, profiles!book_recommendations_user_id_fkey(full_name, email)")
    .order("created_at", { ascending: false });
  const { data: votes } = await supabase
    .from("recommendation_votes")
    .select("recommendation_id, user_id");
  if (recsError) console.error("book_recommendations read failed:", recsError);

  // Recent-joins feed for the right rail (drives the "tag along" nudge).
  const { data: activityRows } = await supabase
    .from("enrollments")
    .select("id, created_at, user_id, clubs(id, name), profiles(full_name, email)")
    .order("created_at", { ascending: false })
    .limit(12);

  type ActivityRow = {
    id: string;
    created_at: string;
    user_id: string;
    clubs: { id: string; name: string } | null;
    profiles: { full_name: string | null; email: string } | null;
  };
  const activity: ActivityItem[] = (activityRows as ActivityRow[] | null ?? [])
    .filter((r) => r.clubs && r.user_id !== user.id) // others' joins, valid clubs only
    .slice(0, 8)
    .map((r) => ({
      id: r.id,
      who: r.profiles?.full_name || r.profiles?.email || "A colleague",
      clubId: r.clubs!.id,
      clubName: r.clubs!.name,
      when: timeAgo(r.created_at),
    }));

  type RecRow = {
    id: string; user_id: string; title: string; author: string | null; note: string | null;
    profiles: { full_name: string | null; email: string } | null;
  };
  const recommendations: RecommendationRow[] = (recs as RecRow[] | null ?? []).map((r) => {
    const rowVotes = (votes ?? []).filter((v) => v.recommendation_id === r.id);
    return {
      id: r.id,
      user_id: r.user_id,
      title: r.title,
      author: r.author,
      note: r.note,
      recommender: r.profiles?.full_name || r.profiles?.email || "A colleague",
      votes: rowVotes.length,
      votedByMe: rowVotes.some((v) => v.user_id === user.id),
    };
  });

  return (
    <>
      <Nav role={profile?.role} email={profile?.email} />
      <main className="mx-auto flex max-w-6xl flex-col gap-10 px-6 py-10 lg:flex-row">
        <div className="flex-1">
        <div className="flex items-end justify-between">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.2em] text-muted">
              Current &amp; upcoming
            </p>
            <h1 className="font-display text-3xl font-extrabold">Open clubs</h1>
          </div>
          {(profile?.role === "leader" || profile?.role === "admin") && (
            <Link
              href="/leader/new-club"
              className="rounded-md bg-ink px-4 py-2 text-sm font-bold text-white hover:bg-muted"
            >
              Start a club
            </Link>
          )}
        </div>

        <ClubsBrowser clubs={cards} quarter={quarter} />

        {pastCards.length > 0 && (
          <PastClubs clubs={pastCards} isAdmin={isAdmin} />
        )}
        </div>

        <aside className="space-y-8 lg:w-80 lg:shrink-0">
          <ActivityFeed items={activity} />
          <RecommendationsBoard
            initial={recommendations}
            userId={user.id}
            isAdmin={profile?.role === "admin"}
            loadError={recsError?.message ?? null}
          />
        </aside>
      </main>
    </>
  );
}
