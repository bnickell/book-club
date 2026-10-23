"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Badge } from "@/components/ui";

export interface ClubCard {
  id: string;
  name: string;
  quarter: string;
  weeks: number;
  bookTitle: string | null;
  bookAuthor: string | null;
  seatsTaken: number;
  maxSeats: number;
  enrolled: boolean;
  full: boolean;
  businessGroup: string | null;
  department: string | null;
  phase: "running" | "upcoming";
}

const ALL = "";

export function ClubsBrowser({ clubs, quarter }: { clubs: ClubCard[]; quarter: string }) {
  const [group, setGroup] = useState<string>(ALL);
  const [dept, setDept] = useState<string>(ALL);
  const [phase, setPhase] = useState<string>(ALL);

  // Only offer filters for values that actually appear among open clubs.
  const groups = useMemo(
    () => Array.from(new Set(clubs.map((c) => c.businessGroup).filter((x): x is string => !!x))).sort(),
    [clubs],
  );
  const depts = useMemo(
    () => Array.from(new Set(clubs.map((c) => c.department).filter((x): x is string => !!x))).sort(),
    [clubs],
  );

  // Offer the timing filter only when the shelf actually spans both.
  const hasRunning = useMemo(() => clubs.some((c) => c.phase === "running"), [clubs]);
  const hasUpcoming = useMemo(() => clubs.some((c) => c.phase === "upcoming"), [clubs]);
  const showPhaseFilter = hasRunning && hasUpcoming;

  const filtered = clubs.filter(
    (c) =>
      (group === ALL || c.businessGroup === group) &&
      (dept === ALL || c.department === dept) &&
      (phase === ALL || c.phase === phase),
  );

  const filtersActive = group !== ALL || dept !== ALL || phase !== ALL;
  const showFilters = clubs.length > 0 && (showPhaseFilter || groups.length > 0 || depts.length > 0);

  if (clubs.length === 0) {
    return (
      <div className="mt-10 rounded-lg border border-dashed border-line bg-white p-10 text-center">
        <p className="font-display text-lg font-bold">The shelf is empty</p>
        <p className="mt-1 text-sm text-muted">
          No clubs are open right now. Leaders can start one from the button above.
        </p>
      </div>
    );
  }

  return (
    <>
      {showFilters && (
        <div className="mt-6 flex flex-wrap items-center gap-3 rounded-lg border border-line bg-white px-4 py-3">
          <span className="text-xs font-bold uppercase tracking-[0.15em] text-muted">
            Explore clubs
          </span>
          {showPhaseFilter && (
            <select
              value={phase}
              onChange={(e) => setPhase(e.target.value)}
              aria-label="Filter by timing"
              className="rounded-md border border-line bg-white px-3 py-1.5 text-sm"
            >
              <option value={ALL}>This quarter & upcoming</option>
              <option value="running">This quarter</option>
              <option value="upcoming">Upcoming</option>
            </select>
          )}
          {groups.length > 0 && (
            <select
              value={group}
              onChange={(e) => setGroup(e.target.value)}
              aria-label="Filter by business group"
              className="rounded-md border border-line bg-white px-3 py-1.5 text-sm"
            >
              <option value={ALL}>All business groups</option>
              {groups.map((g) => (
                <option key={g} value={g}>{g}</option>
              ))}
            </select>
          )}
          {depts.length > 0 && (
            <select
              value={dept}
              onChange={(e) => setDept(e.target.value)}
              aria-label="Filter by department"
              className="rounded-md border border-line bg-white px-3 py-1.5 text-sm"
            >
              <option value={ALL}>All departments</option>
              {depts.map((d) => (
                <option key={d} value={d}>{d}</option>
              ))}
            </select>
          )}
          {filtersActive && (
            <button
              onClick={() => { setGroup(ALL); setDept(ALL); setPhase(ALL); }}
              className="text-sm font-semibold text-muted underline hover:text-ink"
            >
              Clear
            </button>
          )}
          <span className="ml-auto text-xs text-muted">
            {filtered.length} of {clubs.length} clubs
          </span>
        </div>
      )}

      {filtered.length === 0 ? (
        <div className="mt-6 rounded-lg border border-dashed border-line bg-white p-10 text-center">
          <p className="font-display text-lg font-bold">No clubs match those filters</p>
          <p className="mt-1 text-sm text-muted">
            Try a different group or department — or clear the filters to see everything.
          </p>
        </div>
      ) : (
        <div className="mt-6 grid gap-5 md:grid-cols-2">
          {filtered.map((club) => (
            <Link
              key={club.id}
              href={`/clubs/${club.id}`}
              className="group flex overflow-hidden rounded-lg border border-line bg-white transition-shadow hover:shadow-md"
            >
              {/* spine edge */}
              <div className="w-2.5 shrink-0 bg-accent transition-all group-hover:w-4" />
              <div className="flex-1 p-5">
                <div className="flex items-center gap-2">
                  <Badge tone="dark">{club.quarter}</Badge>
                  <Badge>{club.phase === "running" ? "This quarter" : "Upcoming"}</Badge>
                  {club.enrolled && <Badge tone="accent">Enrolled</Badge>}
                  {club.full && !club.enrolled && <Badge>Full</Badge>}
                </div>
                <h2 className="mt-2 font-display text-xl font-bold">{club.name}</h2>
                {club.bookTitle && (
                  <p className="mt-1 text-sm text-muted">
                    Reading <em>{club.bookTitle}</em>
                    {club.bookAuthor ? ` — ${club.bookAuthor}` : ""}
                  </p>
                )}
                {(club.businessGroup || club.department) && (
                  <p className="mt-2 text-xs font-semibold text-muted">
                    {[club.businessGroup, club.department].filter(Boolean).join(" · ")}
                  </p>
                )}
                <p className="mt-3 text-xs font-semibold text-muted">
                  {club.seatsTaken}/{club.maxSeats} seats · {club.weeks} weeks
                </p>
              </div>
            </Link>
          ))}
        </div>
      )}
    </>
  );
}
