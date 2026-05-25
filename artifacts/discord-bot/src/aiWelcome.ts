import OpenAI from "openai";
import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(__dirname, "..", "data");
const FILE = path.join(DATA_DIR, "aiWelcome.json");

const baseURL = process.env["AI_INTEGRATIONS_OPENAI_BASE_URL"];
const apiKey = process.env["AI_INTEGRATIONS_OPENAI_API_KEY"];

let aiClient: OpenAI | null = null;
if (baseURL && apiKey) {
  aiClient = new OpenAI({ baseURL, apiKey });
}

export interface WelcomeConfig {
  channelId: string;
  tone: string;
}

type WelcomeDb = Record<string, WelcomeConfig>;

let dbCache: WelcomeDb | null = null;
let writeLock: Promise<void> = Promise.resolve();

async function load(): Promise<WelcomeDb> {
  if (dbCache) return dbCache;
  try {
    await fs.mkdir(DATA_DIR, { recursive: true });
    const text = await fs.readFile(FILE, "utf8");
    dbCache = JSON.parse(text) as WelcomeDb;
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") {
      dbCache = {};
      await persist();
    } else {
      throw err;
    }
  }
  return dbCache!;
}

async function persist(): Promise<void> {
  if (!dbCache) return;
  const snapshot = JSON.stringify(dbCache, null, 2);
  writeLock = writeLock.then(async () => {
    await fs.mkdir(DATA_DIR, { recursive: true });
    await fs.writeFile(FILE, snapshot, "utf8");
  });
  await writeLock;
}

export async function getWelcomeConfig(
  guildId: string,
): Promise<WelcomeConfig | null> {
  const db = await load();
  return db[guildId] ?? null;
}

export async function setWelcomeConfig(
  guildId: string,
  config: WelcomeConfig,
): Promise<void> {
  const db = await load();
  db[guildId] = config;
  await persist();
}

export async function clearWelcomeConfig(guildId: string): Promise<boolean> {
  const db = await load();
  if (!(guildId in db)) return false;
  delete db[guildId];
  await persist();
  return true;
}

const TONE_PROMPTS: Record<string, string> = {
  friendly:
    "chaleureux, amical et accueillant. Utilise un ton décontracté mais positif.",
  formal:
    "professionnel et formel. Reste respectueux, poli et concis.",
  funny:
    "drôle, décalé et joueur. Glisse une petite blague ou un jeu de mots lié à l'arrivée du membre.",
  hype:
    "hyper enthousiaste et énergique. Montre beaucoup d'excitation à l'accueil du nouveau membre.",
};

const TONE_LABELS: Record<string, string> = {
  friendly: "Chaleureux & accueillant",
  formal: "Formel & professionnel",
  funny: "Drôle & décalé",
  hype: "Hype & enthousiaste",
};

export function getToneLabel(tone: string): string {
  return TONE_LABELS[tone] ?? tone;
}

export async function generateWelcomeMessage(
  memberName: string,
  serverName: string,
  memberCount: number,
  tone: string,
): Promise<string> {
  const fallback = `Bienvenue sur **${serverName}**, ${memberName} ! Tu es notre ${memberCount}ème membre. 🎉`;
  if (!aiClient) return fallback;

  const toneDesc = TONE_PROMPTS[tone] ?? TONE_PROMPTS["friendly"]!;

  try {
    const completion = await aiClient.chat.completions.create({
      model: "gpt-5-nano",
      max_completion_tokens: 150,
      messages: [
        {
          role: "system",
          content:
            `Tu es un bot Discord qui écrit un message de bienvenue pour un nouveau membre. ` +
            `Sois ${toneDesc} ` +
            `Écris uniquement le message — sans guillemets, sans préfixe, sans explication. ` +
            `Maximum 180 caractères. Écris en français. ` +
            `Mentionne le nom du membre et le numéro de membre si c'est naturel.`,
        },
        {
          role: "user",
          content: `Nouveau membre : ${memberName}. Serveur : ${serverName}. C'est le ${memberCount}ème membre du serveur.`,
        },
      ],
    });

    return (
      completion.choices[0]?.message?.content?.trim() ?? fallback
    );
  } catch (err) {
    console.error("AI welcome generation failed:", err);
    return fallback;
  }
}
