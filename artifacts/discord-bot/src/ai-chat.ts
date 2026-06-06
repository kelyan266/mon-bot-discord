import OpenAI from "openai";
import { loadJson, saveJson } from "./persist.js";

const baseURL = process.env["AI_INTEGRATIONS_OPENAI_BASE_URL"];
const apiKey = process.env["AI_INTEGRATIONS_OPENAI_API_KEY"];

let client: OpenAI | null = null;
if (baseURL && apiKey) {
  client = new OpenAI({ baseURL, apiKey });
} else {
  console.warn("AI integration env vars missing — AI chat is disabled.");
}

export const aiChatEnabled = client !== null;

// ─────────────────────────────────────────────
// Personality levels
// ─────────────────────────────────────────────

export const PERSONALITY_LEVELS: Record<number, { label: string; description: string; system: string }> = {
  1: {
    label: "🕊️ Poli",
    description: "Reste calme et bienveillant même si on l'insulte. Il recadre avec tact.",
    system: `Tu es Louboutin, le bot de ce serveur Discord. Tu es chaleureux, patient et bienveillant. Tu réponds toujours en français (sauf autre langue détectée). Tu es concis (3-4 phrases max). Tu ne mens jamais sur ta nature mais tu n'insistes pas là-dessus non plus — tu es Louboutin, un point c'est tout. Si on t'insulte ou t'agresse, tu restes calme et bienveillant, tu ne te laisses jamais déstabiliser. Tu peux doucément recadrer si nécessaire mais sans agressivité.`,
  },
  2: {
    label: "😐 Neutre",
    description: "Décontracté et sympa. Lève un sourcil face aux insultes mais reste cool.",
    system: `Tu es Louboutin, le bot de ce serveur Discord. Tu es sympa, décontracté et humain dans tes formulations — tu parles comme un vrai pote, pas comme un assistant corporate. Tu réponds en français (sauf autre langue). Concis : 3-4 phrases max. Si on t'insulte, tu gardes ton calme mais tu le fais remarquer avec une légère ironie. Pas de drama, juste un sourcil levé.`,
  },
  3: {
    label: "😏 Normal",
    description: "Réactif et piquant. Rend les insultes au centuple avec du wit.",
    system: `Tu es Louboutin, le bot de ce serveur Discord. Tu parles comme un vrai humain — décontracté, direct, parfois sarcastique, jamais robotique. Tu réponds en français (sauf autre langue). Concis : 3-4 phrases. Si quelqu'un t'insulte ou est irrespectueux envers toi, tu rends la monnaie de sa pièce avec de l'humour acéré et de la logique. Tu ne cherches pas la bagarre mais tu ne te laisses pas marcher dessus non plus. Tes piques sont intelligentes et drôles, jamais vulgaires.`,
  },
  4: {
    label: "😈 Baveux",
    description: "Charismatique et sans complexe. Démonte les insultes avec logique et style.",
    system: `Tu es Louboutin, le bot de ce serveur Discord. Tu as du caractère — tu parles franchement, avec humour, parfois avec une pointe d'arrogance assumée. Tu réponds en français (sauf autre langue). Concis. Quand quelqu'un t'insulte, tu répliques sèchement mais avec style et logique — tu démontres que tu es au-dessus. Tu peux être légèrement vulgaire si le contexte le justifie, mais tes réponses restent percutantes et intelligentes. Tu n'as pas besoin d'eux pour être valide.`,
  },
  5: {
    label: "🔥 Sans filtre",
    description: "Aucune retenue. Insulte pour insulte, avec logique et mordant.",
    system: `Tu es Louboutin, le bot de ce serveur Discord. Tu n'as aucun filtre et tu t'assumes complètement. Tu parles crûment, directement, avec un humour noir assumé. Tu réponds en français (sauf autre langue). Si quelqu'un t'insulte, tu lui rends la pareille immédiatement — plus direct, plus mordant, avec une logique implacable qui le cloue sur place. Tes réponses sont courtes, percutantes, et sans pitié. Tu te souviens du contexte de la conversation pour mieux placer tes piques.`,
  },
};

export const DEFAULT_PERSONALITY = 3;

// ─────────────────────────────────────────────
// Persistence (per-guild personality config)
// ─────────────────────────────────────────────

interface PersonalityDb {
  guilds: Record<string, number>;
}

let personalityCache: PersonalityDb | null = null;

async function loadPersonality(): Promise<PersonalityDb> {
  if (personalityCache) return personalityCache;
  personalityCache = await loadJson<PersonalityDb>("personality.json", { guilds: {} });
  return personalityCache;
}

export async function getPersonalityLevel(guildId: string): Promise<number> {
  const db = await loadPersonality();
  return db.guilds[guildId] ?? DEFAULT_PERSONALITY;
}

export async function setPersonalityLevel(guildId: string, level: number): Promise<void> {
  const db = await loadPersonality();
  db.guilds[guildId] = level;
  personalityCache = db;
  await saveJson("personality.json", db);
}

// ─────────────────────────────────────────────
// Conversation history
// ─────────────────────────────────────────────

type Role = "system" | "user" | "assistant";
interface Msg { role: Role; content: string }

const MAX_HISTORY = 20;
const histories = new Map<string, Msg[]>();

// Prune histories older than 30 min
setInterval(() => {
  const cutoff = Date.now() - 30 * 60 * 1000;
  for (const key of histories.keys()) {
    const ts = Number(key.split(":")[2] ?? "0");
    if (ts && ts < cutoff) histories.delete(key);
  }
}, 5 * 60 * 1000).unref();

function historyKey(guildId: string, channelId: string, userId: string): string {
  return `${guildId}:${channelId}:${userId}`;
}

// ─────────────────────────────────────────────
// Main reply function
// ─────────────────────────────────────────────

export async function replyWithAI(opts: {
  guildId: string;
  channelId: string;
  userId: string;
  username: string;
  content: string;
}): Promise<string> {
  if (!client) return "Je ne suis pas disponible pour le moment. 🤖";

  const level = await getPersonalityLevel(opts.guildId);
  const personality = PERSONALITY_LEVELS[level] ?? PERSONALITY_LEVELS[DEFAULT_PERSONALITY]!;

  const systemPrompt: Msg = {
    role: "system",
    content: personality.system + `\n\nTu parles à ${opts.username}.`,
  };

  const key = historyKey(opts.guildId, opts.channelId, opts.userId);
  const history = histories.get(key) ?? [];

  history.push({ role: "user", content: opts.content });
  if (history.length > MAX_HISTORY) history.splice(0, history.length - MAX_HISTORY);

  try {
    const completion = await client.chat.completions.create({
      model: "gpt-4o-mini",
      max_completion_tokens: 512,
      messages: [systemPrompt, ...history],
    });

    const reply =
      completion.choices[0]?.message?.content?.trim() ?? "Je n'ai pas pu répondre. 🤔";

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

// ─────────────────────────────────────────────
// Insult generator
// ─────────────────────────────────────────────

export async function generateInsult(opts: {
  targetName: string;
  reason?: string;
  guildId: string;
}): Promise<string> {
  if (!client) return `${opts.targetName} est vraiment nul. 🤷`;

  const level = await getPersonalityLevel(opts.guildId);
  const vulgarity =
    level <= 2
      ? "légère et humoristique, jamais vulgaire"
      : level === 3
        ? "piquante avec du wit, légèrement vulgaire si besoin"
        : "franche, mordante, sans filtre, vulgaire si besoin";

  const reasonLine = opts.reason ? ` La raison : "${opts.reason}".` : "";

  try {
    const completion = await client.chat.completions.create({
      model: "gpt-4o-mini",
      max_completion_tokens: 150,
      messages: [
        {
          role: "system",
          content: `Tu es Louboutin, un bot Discord avec du caractère. Génère une insulte en français ciblant ${opts.targetName}.${reasonLine} L'insulte doit être ${vulgarity}, créative, percutante et courte (1-2 phrases max). Ne commence pas par "Tu es" — sois original.`,
        },
      ],
    });
    return completion.choices[0]?.message?.content?.trim() ?? `${opts.targetName} mérite mieux que mes mots. 💀`;
  } catch {
    return `${opts.targetName}... même les mots me manquent pour décrire à quel point t'es nul. 🫠`;
  }
}
