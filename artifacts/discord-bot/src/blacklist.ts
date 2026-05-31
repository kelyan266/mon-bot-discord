import { loadJson, saveJson } from "./persist.js";

export interface BlacklistEntry {
  userId: string;
  username: string;
  reason: string;
  moderatorId: string;
  addedAt: number;
}

type BlacklistDb = Record<string, Record<string, BlacklistEntry>>;

let cache: BlacklistDb | null = null;

async function ensureLoaded(): Promise<BlacklistDb> {
  if (cache) return cache;
  cache = await loadJson<BlacklistDb>("blacklist.json", {});
  return cache;
}

async function persist(): Promise<void> {
  if (!cache) return;
  await saveJson("blacklist.json", cache);
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
