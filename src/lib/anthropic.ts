/** Minimal Anthropic Messages API helper (server-side only). */
const MODEL = process.env.ANTHROPIC_MODEL || "claude-sonnet-4-6";

export async function askClaude(opts: {
  system: string;
  prompt: string;
  maxTokens?: number;
}): Promise<string> {
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": process.env.ANTHROPIC_API_KEY!,
      "anthropic-version": "2023-06-01"
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: opts.maxTokens ?? 4000,
      system: opts.system,
      messages: [{ role: "user", content: opts.prompt }]
    })
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Anthropic API ${res.status}: ${body}`);
  }
  const data = await res.json();
  return data.content
    .filter((b: { type: string }) => b.type === "text")
    .map((b: { text: string }) => b.text)
    .join("\n");
}

/** Strip markdown fences and parse JSON from a model response. */
export function parseJson<T>(text: string): T {
  const clean = text.replace(/```json|```/g, "").trim();
  try {
    return JSON.parse(clean) as T;
  } catch {
    // Fall back to the outermost JSON array/object if the model added prose.
    const start = clean.search(/[[{]/);
    const end = Math.max(clean.lastIndexOf("]"), clean.lastIndexOf("}"));
    if (start !== -1 && end > start) {
      return JSON.parse(clean.slice(start, end + 1)) as T;
    }
    throw new Error(`Model did not return valid JSON: ${clean.slice(0, 200)}`);
  }
}
