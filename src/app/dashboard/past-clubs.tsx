"use client";

import { useState } from "react";
import Link from "next/link";
import { Badge } from "@/components/ui";

export interface PastClubCard {
  id: string;
  name: string;
  quarter: string;
  bookTitle: string | null;
  bookAuthor: string | null;
  members: number;
  wasLeader: boolean;
  closedEarly: boolean;
}

export function PastClubs({ clubs, isAdmin }: { clubs: PastClubCard[]; isAdmin: boolean }) {
  const [open, setOpen] = useState(false);

  return (
    <section className="mt-12 border-t border-line pt-8">
      <button
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full items-center justify-between text-left"
      >
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.2em] text-muted">
            {isAdmin ? "All past clubs" : "Your past clubs"}
          </p>
          <h2 className="font-display text-2xl font-extrabold">Archive</h2>
        </div>
        <span className="text-sm font-semibold text-muted">
          {clubs.length} {clubs.length === 1 ? "club" : "clubs"} · {open ? "Hide" : "Show"}
        </span>
      </button>

      {open && (
        <ul className="mt-5 space-y-3">
          {clubs.map((club) => (
            <li key={club.id}>
              <Link
                href={`/clubs/${club.id}`}
                className="flex items-center gap-4 rounded-lg border border-line bg-white px-4 py-3 transition-shadow hover:shadow-sm"
              >
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <Badge>{club.quarter}</Badge>
                    {club.wasLeader && <Badge tone="dark">You led</Badge>}
                    {club.closedEarly && <Badge>Closed early</Badge>}
                  </div>
                  <p className="mt-1.5 font-display font-bold">{club.name}</p>
                  {club.bookTitle && (
                    <p className="text-sm text-muted">
                      Read <em>{club.bookTitle}</em>
                      {club.bookAuthor ? ` — ${club.bookAuthor}` : ""}
                    </p>
                  )}
                </div>
                <span className="shrink-0 text-xs font-semibold text-muted">
                  {club.members} {club.members === 1 ? "member" : "members"}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
