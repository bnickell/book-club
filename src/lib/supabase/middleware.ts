import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

const PROTECTED = ["/dashboard", "/clubs", "/leader", "/admin", "/profile"];

export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll: (cookiesToSet: { name: string; value: string; options: CookieOptions }[]) => {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          );
        }
      }
    }
  );

  const { data: { user } } = await supabase.auth.getUser();
  const path = request.nextUrl.pathname;
  const isProtected = PROTECTED.some((p) => path.startsWith(p));

  if (!user && isProtected) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }

  // Approval gate: a signed-in but not-yet-approved user can't reach the app.
  // (Pending users have no password → no session, so this is a safety net.)
  if (user && isProtected) {
    const { data: profile } = await supabase
      .from("profiles").select("approved, last_seen_at").eq("id", user.id).maybeSingle();
    if (profile && !profile.approved) {
      const url = request.nextUrl.clone();
      url.pathname = "/pending";
      return NextResponse.redirect(url);
    }
    // "Last seen" engagement signal — stamp on real app navigation, but no
    // more than once every 5 minutes to keep this to a trickle of writes.
    if (profile?.approved) {
      const last = profile.last_seen_at ? new Date(profile.last_seen_at).getTime() : 0;
      if (Date.now() - last > 5 * 60 * 1000) {
        await supabase
          .from("profiles").update({ last_seen_at: new Date().toISOString() }).eq("id", user.id);
      }
    }
  }
  return response;
}
