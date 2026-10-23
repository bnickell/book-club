import Link from "next/link";
import { APP_NAME, DOMAINS_LABEL } from "@/lib/config";

const SPINES = [
  { w: "w-10", bg: "bg-ink", text: "text-accent", label: "Leadership" },
  { w: "w-14", bg: "bg-accent", text: "text-ink", label: "Product strategy" },
  { w: "w-9", bg: "bg-muted", text: "text-white", label: "Security" },
  { w: "w-12", bg: "bg-ink", text: "text-white", label: "Operations" },
  { w: "w-10", bg: "bg-line", text: "text-ink", label: "Innovation" },
  { w: "w-13 w-12", bg: "bg-accent", text: "text-ink", label: "Sales" }
];

export default function Landing() {
  return (
    <main className="min-h-screen">
      <header className="bg-ink text-white">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-4">
          <span className="font-display text-lg font-bold tracking-tight">
            {APP_NAME}
          </span>
          <Link
            href="/login"
            className="rounded-md bg-accent px-4 py-2 text-sm font-bold text-ink hover:brightness-110"
          >
            Sign in
          </Link>
        </div>

        <div className="mx-auto grid max-w-5xl gap-10 px-6 pb-20 pt-14 md:grid-cols-2 md:items-center">
          <div>
            <p className="mb-3 text-xs font-bold uppercase tracking-[0.2em] text-accent">
              Read together · Learn together · Grow together
            </p>
            <h1 className="font-display text-4xl font-extrabold leading-tight md:text-5xl">
              Meet great colleagues over a good book.
            </h1>
            <p className="mt-5 max-w-md text-line">
              A relaxed way to connect with people across your organization, swap
              ideas, and pick up something new together. Join a group, read at
              your own pace, and show up for the conversations that interest you.
            </p>
            <Link
              href="/login"
              className="mt-8 inline-block rounded-md bg-accent px-6 py-3 font-bold text-ink hover:brightness-110"
            >
              Join the club
            </Link>
            <p className="mt-4 text-xs text-line">
              Completely voluntary · a light weekly read · come to the sessions
              you can make. Request access{DOMAINS_LABEL ? ` with your ${DOMAINS_LABEL} email` : ""} — an admin will get you set up.
            </p>
          </div>

          {/* Signature: the shelf */}
          <div className="flex justify-center">
            <div className="rounded-lg bg-white/5 p-6 pb-0">
              <div className="flex items-end gap-1.5">
                {SPINES.map((s, i) => (
                  <div
                    key={i}
                    className={`spine ${s.w} ${s.bg} ${s.text} flex h-48 items-center justify-center rounded-t-sm px-1 text-xs font-bold tracking-wide`}
                    style={{ height: `${168 + (i % 3) * 18}px` }}
                  >
                    {s.label}
                  </div>
                ))}
              </div>
              <div className="h-3 rounded-b-md bg-muted" />
              <p className="py-3 text-center text-xs text-line">
                A shelf built by colleagues, for colleagues.
              </p>
            </div>
          </div>
        </div>
      </header>

      <section className="mx-auto max-w-5xl px-6 py-16">
        <div className="grid gap-6 md:grid-cols-3">
          {[
            {
              t: "Connect across teams",
              d: "Meet people you'd never cross paths with day to day — different teams, roles, and sites — around a shared read."
            },
            {
              t: "Learn something new",
              d: "Explore leadership, strategy, and ideas that stretch how you think, with colleagues who bring their own perspective."
            },
            {
              t: "Low commitment, high payoff",
              d: "A manageable reading pace and short weekly conversations. Join in when you can — no pressure, no prep required."
            }
          ].map((c) => (
            <div key={c.t} className="rounded-lg border border-line bg-white p-6">
              <h3 className="font-display text-lg font-bold">{c.t}</h3>
              <p className="mt-2 text-sm text-muted">{c.d}</p>
            </div>
          ))}
        </div>
      </section>
    </main>
  );
}
