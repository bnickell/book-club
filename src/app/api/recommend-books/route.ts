import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { askClaude, parseJson } from "@/lib/anthropic";

export const maxDuration = 60;

interface Recommendation {
  title: string;
  author: string;
  year: number;
  description: string;
  rationale: string;
}

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const { data: profile } = await supabase
    .from("profiles").select("role").eq("id", user.id).single();
  if (!profile || !["leader", "admin"].includes(profile.role)) {
    return NextResponse.json({ error: "Leaders and admins only" }, { status: 403 });
  }

  const { topics } = await request.json();
  if (!Array.isArray(topics) || topics.length === 0) {
    return NextResponse.json({ error: "Provide at least one topic" }, { status: 400 });
  }

  try {
    const text = await askClaude({
      system: `You recommend books for a workplace book club.
Recommend widely available, well-regarded non-fiction books that a mixed audience of
managers and individual contributors can read over one quarter (~12 weeks).
Respond ONLY with a JSON array of exactly 5 objects, no markdown, no preamble:
[{"title": "", "author": "", "year": 2020, "description": "one plain-language sentence",
"rationale": "one sentence on why it fits the requested topics for this audience"}]`,
      prompt: `Focus topics for this quarter's club: ${topics.join(", ")}`
    });

    const recommendations = parseJson<Recommendation[]>(text);
    return NextResponse.json({ recommendations });
  } catch (err) {
    console.error("recommend-books failed:", err);
    return NextResponse.json({ error: "Recommendation failed" }, { status: 500 });
  }
}
