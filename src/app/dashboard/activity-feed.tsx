"use client";

import { useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export interface ActivityItem {
  id: string;
  who: string;
  clubId: string;
  clubName: string;
  when: string; // pre-formatted relative time, e.g. "2h ago"
}

export function ActivityFeed({ items }: { items: ActivityItem[] }) {
  const router = useRouter();

  // Keep the feed live: any new enrollment anywhere re-pulls the server data
  // so a colleague joining a club shows up without a manual refresh.
  useEffect(() => {
    const supabase = createClient();
    const channel = supabase
      .channel("enrollment-activity")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "enrollments" },
        () => router.refresh(),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [router]);

  return (
    <section>
      <h2 className="font-display text-xl font-extrabold">Recent activity</h2>
      <p className="mt-1 text-sm text-muted">
        See who&apos;s joining what — spot a colleague and tag along.
      </p>

      {items.length === 0 ? (
        <div className="mt-4 rounded-lg border border-dashed border-line bg-white p-5 text-sm text-muted">
          No one&apos;s joined a club yet. Be the first.
        </div>
      ) : (
        <ul className="mt-4 space-y-2">
          {items.map((item) => (
            <li key={item.id}>
              <Link
                href={`/clubs/${item.clubId}`}
                className="block rounded-lg border border-line bg-white p-3 text-sm transition-shadow hover:shadow-md"
              >
                <span className="font-semibold">{item.who}</span> joined{" "}
                <span className="font-display font-bold">{item.clubName}</span>
                <span className="mt-0.5 block text-xs text-muted">{item.when}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
