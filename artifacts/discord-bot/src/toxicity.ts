import OpenAI from "openai";

const baseURL = process.env["AI_INTEGRATIONS_OPENAI_BASE_URL"];
const apiKey = process.env["AI_INTEGRATIONS_OPENAI_API_KEY"];

let client: OpenAI | null = null;
if (baseURL && apiKey) {
  client = new OpenAI({ baseURL, apiKey });
} else {
  console.warn(
    "AI integration env vars missing — toxicity detection is disabled.",
  );
}

const MIN_LENGTH = 8;
const cache = new Map<string, { score: number; expires: number }>();
const CACHE_TTL_MS = 5 * 60 * 1000;

setInterval(
  () => {
    const now = Date.now();
    for (const [key, value] of cache) {
      if (value.expires < now) cache.delete(key);
    }
  },
  60_000,
).unref();

export async function analyzeWithAI(content: string): Promise<number> {
  if (!client) return 0;
  const trimmed = content.trim();
  if (trimmed.length < MIN_LENGTH) return 0;

  const key = trimmed.toLowerCase();
  const cached = cache.get(key);
  if (cached && cached.expires > Date.now()) {
    return cached.score;
  }

  try {
    const completion = await client.chat.completions.create({
      model: "gpt-5-nano",
      max_completion_tokens: 8192,
      messages: [
        {
          role: "system",
          content:
            "You are a content moderation classifier for a Discord server. Rate the user's message for toxicity (insults, slurs, harassment, hate speech, threats, severe profanity directed at others). Reply with ONLY a JSON object of the form {\"score\": <number between 0 and 1>}. 0 = completely benign. 1 = extremely toxic. Casual swearing without targeting anyone should score below 0.4. Personal attacks, slurs, or threats should score above 0.8.",
        },
        {
          role: "user",
          content: trimmed.slice(0, 1500),
        },
      ],
      response_format: { type: "json_object" },
    });

    const text = completion.choices[0]?.message?.content ?? "{}";
    const parsed = JSON.parse(text) as { score?: unknown };
    const raw = typeof parsed.score === "number" ? parsed.score : 0;
    const score = Math.max(0, Math.min(1, raw));

    cache.set(key, { score, expires: Date.now() + CACHE_TTL_MS });
    return score;
  } catch (err) {
    console.error("Toxicity analysis failed:", err);
    return 0;
  }
}

export const toxicityEnabled = client !== null;
