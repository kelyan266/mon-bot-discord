import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(__dirname, "..", "data");
const BLACKLIST_FILE = path.join(DATA_DIR, "blacklist.json");

export interface BlacklistEntry {
  userId: string;
  username: string;
  reason: string;
  moderatorId: string;
  addedAt: number;
}

type BlacklistDb = Record<string, Record<string, BlacklistEntry>>;

let cache: BlacklistDb | null = null;
let writeLock: Promise<void> = Promise.resolve();

async function ensureLoaded(): Promise<BlacklistDb> {
  if (cache) return cache;
  try {
    await fs.mkdir(DATA_DIR, { recursive: true });
    const text = await fs.readFile(BLACKLIST_FILE, "utf8");
    cache = JSON.parse(text) as BlacklistDb;
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") {
      cache = {};
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
    await fs.writeFile(BLACKLIST_FILE, snapshot, "utf8");
  });
  await writeLock;
}

export async function addToBlacklist(
  guildId: string,
  userId: string,
  username: string,
  reason: string,
  moderatorId: string,
): Promise<void> {
  const db = await ensureLoaded();
  if (!db[guildId]) db[guildId] = {};
  db[guildId][userId] = { userId, username, reason, moderatorId, addedAt: Date.now() };
  await persist();
}

export async function removeFromBlacklist(
  guildId: string,
  userId: string,
): Promise<boolean> {
  const db = await ensureLoaded();
  if (!db[guildId]?.[userId]) return false;
  delete db[guildId][userId];
  await persist();
  return true;
}

export async function getBlacklist(guildId: string): Promise<BlacklistEntry[]> {
  const db = await ensureLoaded();
  return Object.values(db[guildId] ?? {}).sort((a, b) => b.addedAt - a.addedAt);
}

export async function isBlacklisted(
  guildId: string,
  userId: string,
): Promise<BlacklistEntry | null> {
  const db = await ensureLoaded();
  return db[guildId]?.[userId] ?? null;
}
