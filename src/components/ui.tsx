import Link from "next/link";
import type { UserRole } from "@/lib/types";
import { SignOutButton } from "./sign-out";
import { APP_NAME } from "@/lib/config";

export function Nav({ role, email }: { role?: UserRole; email?: string }) {
  return (
    <nav className="bg-ink text-white">
      <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-4">
        <Link href="/dashboard" className="font-display text-lg font-800 tracking-tight">
          {APP_NAME}
        </Link>
        <div className="flex items-center gap-5 text-sm">
          <Link href="/dashboard" className="hover:text-accent">Clubs</Link>
          {(role === "leader" || role === "admin") && (
            <Link href="/leader/new-club" className="hover:text-accent">Start a club</Link>
          )}
          {role === "admin" && <Link href="/admin" className="hover:text-accent">Admin</Link>}
          <Link href="/profile" className="hover:text-accent">Profile</Link>
          {email && (
            <Link href="/profile" className="hidden text-line hover:text-accent sm:inline">
              {email}
            </Link>
          )}
          <SignOutButton />
        </div>
      </div>
    </nav>
  );
}

export function Badge({ children, tone = "neutral" }: { children: React.ReactNode; tone?: "neutral" | "accent" | "dark" }) {
  const tones = {
    neutral: "bg-surface text-muted",
    accent: "bg-accent text-ink",
    dark: "bg-ink text-white"
  };
  return (
    <span className={`inline-block rounded-full px-3 py-0.5 text-xs font-semibold uppercase tracking-wide ${tones[tone]}`}>
      {children}
    </span>
  );
}
