import Link from "next/link";
import { APP_NAME } from "@/lib/config";

export default function PendingPage() {
  return (
    <main className="flex min-h-screen items-center justify-center px-6">
      <div className="w-full max-w-sm rounded-lg border border-line bg-white p-8 text-center">
        <p className="text-xs font-bold uppercase tracking-[0.2em] text-muted">{APP_NAME}</p>
        <h1 className="mt-1 font-display text-2xl font-extrabold">You&apos;re on the list</h1>
        <p className="mt-3 text-sm text-muted">
          Your request is waiting for admin approval. Once you&apos;re in, you&apos;ll get a
          welcome email with your sign-in details from an admin.
        </p>
        <Link
          href="/login"
          className="mt-6 inline-block rounded-md border border-line px-4 py-2.5 text-sm font-bold hover:bg-surface"
        >
          Back to sign in
        </Link>
      </div>
    </main>
  );
}
