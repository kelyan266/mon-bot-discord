import OpenAI from "openai";

const baseURL = process.env["AI_INTEGRATIONS_OPENAI_BASE_URL"];
const apiKey = process.env["AI_INTEGRATIONS_OPENAI_API_KEY"];

let client: OpenAI | null = null;
if (baseURL && apiKey) {
  client = new OpenAI({ baseURL, apiKey });
} else {
  console.warn("AI integration env vars missing — AI chat is disabled.");
}

export const aiChatEnabled = client !== null;

type Role = "system" | "user" | "assistant";
interface Msg {
  role: Role;
  content: string;
}

const SYSTEM_PROMPT: Msg = {
  role: "system",
  content: `Tu es Louboutin, le bot officiel de ce serveur Discord. Tu es sympa, décontracté et utile. Tu réponds toujours en français sauf si quelqu'un te parle dans une autre langue. Tu es concis (max 3-4 phrases sauf si on te pose une question qui nécessite plus de détails). Tu peux aider avec des questions générales, la modération, les commandes du serveur, et discuter de manière détendue. Ne mentionne jamais que tu es une IA ou un modèle de langage, tu es simplement Louboutin.`,
};

const MAX_HISTORY = 20;

const histories = new Map<string, Msg[]>();

setInterval(
  () => {
    const cutoff = Date.now() - 30 * 60 * 1000;
    for (const key of histories.keys()) {
      const ts = Number(key.split(":")[2] ?? "0");
      if (ts && ts < cutoff) histories.delete(key);
    }
  },
  5 * 60 * 1000,
).unref();

function historyKey(guildId: string, channelId: string, userId: string): string {
  return `${guildId}:${channelId}:${userId}`;
}

export async function replyWithAI(opts: {
  guildId: string;
  channelId: string;
  userId: string;
  username: string;
  content: string;
}): Promise<string> {
  if (!client) return "Je ne suis pas disponible pour le moment. 🤖";

  const key = historyKey(opts.guildId, opts.channelId, opts.userId);
  const history = histories.get(key) ?? [];

  history.push({ role: "user", content: opts.content });

  if (history.length > MAX_HISTORY) {
    history.splice(0, history.length - MAX_HISTORY);
  }

  try {
    const completion = await client.chat.completions.create({
      model: "gpt-4o-mini",
      max_completion_tokens: 512,
      messages: [SYSTEM_PROMPT, ...history],
    });

    const reply =
      completion.choices[0]?.message?.content?.trim() ??
      "Je n'ai pas pu répondre. 🤔";

    history.push({ role: "assistant", content: reply });
    histories.set(key, history);

    return reply;
  } catch (err) {
    console.error("AI chat failed:", err);
    return "Une erreur s'est produite, réessaie dans un moment. 😕";
  }
}

export function clearHistory(guildId: string, channelId: string, userId: string): void {
  histories.delete(historyKey(guildId, channelId, userId));
}
