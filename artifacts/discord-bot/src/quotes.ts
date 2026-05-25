import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(__dirname, "..", "data");
const FILE = path.join(DATA_DIR, "quotes.json");

export interface Quote {
  id: number;
  text: string;
  author?: string;
  addedBy: string;
  addedAt: number;
}

interface GuildQuotes {
  nextId: number;
  quotes: Quote[];
}

interface QuotesDb {
  guilds: Record<string, GuildQuotes>;
}

let cache: QuotesDb | null = null;
let writeLock: Promise<void> = Promise.resolve();

async function ensureLoaded(): Promise<QuotesDb> {
  if (cache) return cache;
  try {
    await fs.mkdir(DATA_DIR, { recursive: true });
    const text = await fs.readFile(FILE, "utf8");
    cache = JSON.parse(text) as QuotesDb;
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") {
      cache = { guilds: {} };
    } else {
      throw err;
    }
  }
  return cache;
}

async function persist(): Promise<void> {
  if (!cache) return;
  const snapshot = JSON.stringify(cache, null, 2);
  writeLock = writeLock.then(async () => {
    await fs.mkdir(DATA_DIR, { recursive: true });
    await fs.writeFile(FILE, snapshot, "utf8");
  });
  await writeLock;
}

function getGuild(db: QuotesDb, guildId: string): GuildQuotes {
  return (db.guilds[guildId] ??= { nextId: 1, quotes: [] });
}

export async function addQuote(
  guildId: string,
  text: string,
  author: string | undefined,
  addedBy: string,
): Promise<Quote> {
  const db = await ensureLoaded();
  const guild = getGuild(db, guildId);
  const quote: Quote = {
    id: guild.nextId++,
    text,
    author,
    addedBy,
    addedAt: Date.now(),
  };
  guild.quotes.push(quote);
  await persist();
  return quote;
}

export async function deleteQuote(
  guildId: string,
  id: number,
): Promise<boolean> {
  const db = await ensureLoaded();
  const guild = getGuild(db, guildId);
  const before = guild.quotes.length;
  guild.quotes = guild.quotes.filter((q) => q.id !== id);
  if (guild.quotes.length === before) return false;
  await persist();
  return true;
}

export async function getRandomQuote(guildId: string): Promise<Quote | null> {
  const db = await ensureLoaded();
  const quotes = getGuild(db, guildId).quotes;
  if (quotes.length === 0) return null;
  return quotes[Math.floor(Math.random() * quotes.length)] ?? null;
}

export async function getQuote(
  guildId: string,
  id: number,
): Promise<Quote | null> {
  const db = await ensureLoaded();
  return getGuild(db, guildId).quotes.find((q) => q.id === id) ?? null;
}

export async function listQuotes(
  guildId: string,
  page = 1,
  pageSize = 8,
): Promise<{ quotes: Quote[]; total: number; totalPages: number; page: number }> {
  const db = await ensureLoaded();
  const all = [...getGuild(db, guildId).quotes].reverse();
  const totalPages = Math.max(1, Math.ceil(all.length / pageSize));
  const safePage = Math.max(1, Math.min(page, totalPages));
  const offset = (safePage - 1) * pageSize;
  return {
    quotes: all.slice(offset, offset + pageSize),
    total: all.length,
    totalPages,
    page: safePage,
  };
}
