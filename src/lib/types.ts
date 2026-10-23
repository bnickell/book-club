export type UserRole = "admin" | "leader" | "member";
export type BookStatus = "suggested" | "approved" | "rejected";
export type ClubStatus = "draft" | "open" | "active" | "completed";

export interface Profile {
  id: string;
  email: string;
  first_name: string | null;
  last_name: string | null;
  full_name: string | null;
  business_group: string | null;
  department: string | null;
  role: UserRole;
  approved: boolean;
  last_seen_at: string | null;
}

export interface Book {
  id: string;
  title: string;
  author: string;
  year: number | null;
  description: string | null;
  topics: string[];
  ai_rationale: string | null;
  status: BookStatus;
}

export interface Club {
  id: string;
  name: string;
  quarter: string;
  description: string | null;
  book_id: string | null;
  leader_id: string;
  max_seats: number;
  weeks: number;
  status: ClubStatus;
}

export interface WeeklyGuide {
  id: string;
  club_id: string;
  week_number: number;
  theme: string;
  reading_assignment: string | null;
  summary: string | null;
  discussion_questions: string[];
  talking_points: string[];
  released: boolean;
}

export interface ClubRating {
  id: string;
  club_id: string;
  user_id: string;
  book_rating: number | null;
  club_rating: number | null;
  comment: string | null;
  created_at: string;
}

export interface BookRecommendation {
  id: string;
  user_id: string;
  title: string;
  author: string | null;
  note: string | null;
  created_at: string;
}

/** Current quarter helpers — clubs launch the quarter after they're built. */
export function nextQuarter(d = new Date()): string {
  const q = Math.floor(d.getMonth() / 3) + 1;
  return q === 4 ? `${d.getFullYear() + 1}-Q1` : `${d.getFullYear()}-Q${q + 1}`;
}

/** The quarter running right now (today). Quarter strings are "YYYY-QN",
 *  which sort lexicographically, so phase is a plain string comparison. */
export function currentQuarter(d = new Date()): string {
  const q = Math.floor(d.getMonth() / 3) + 1;
  return `${d.getFullYear()}-Q${q}`;
}

/** A run of consecutive quarters starting at the one running today —
 *  the choices a leader gets when picking which quarter to run a club in.
 *  e.g. ["2026-Q3", "2026-Q4", "2027-Q1", "2027-Q2"]. */
export function quarterOptions(count = 4, d = new Date()): string[] {
  let year = d.getFullYear();
  let q = Math.floor(d.getMonth() / 3) + 1; // 1..4
  const out: string[] = [];
  for (let i = 0; i < count; i++) {
    out.push(`${year}-Q${q}`);
    q += 1;
    if (q > 4) { q = 1; year += 1; }
  }
  return out;
}

export type ClubPhase = "upcoming" | "running" | "past";

/** Where a club sits in its quarterly lifecycle. A manual close-out
 *  (status 'completed') always reads as past; otherwise we derive the
 *  phase purely from the club's quarter vs the quarter running now. */
export function clubPhase(
  club: { quarter: string; status: ClubStatus },
  now = new Date(),
): ClubPhase {
  if (club.status === "completed") return "past";
  const cq = currentQuarter(now);
  if (club.quarter < cq) return "past";
  if (club.quarter > cq) return "upcoming";
  return "running";
}
