import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const { clubId } = await request.json();
  if (!clubId) return NextResponse.json({ error: "Missing clubId" }, { status: 400 });

  // RLS enforces: open club, seat available, self-enroll only.
  const { error } = await supabase
    .from("enrollments")
    .insert({ club_id: clubId, user_id: user.id });
  if (error) {
    const friendly = error.message.includes("row-level security")
      ? "This club isn't open for enrollment or is full."
      : error.message;
    return NextResponse.json({ error: friendly }, { status: 400 });
  }

  return NextResponse.json({ ok: true });
}
