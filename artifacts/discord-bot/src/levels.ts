import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(__dirname, "..", "data");
const LEVELS_FILE = path.join(DATA_DIR, "levels.json");

const MESSAGE_COOLDOWN_MS = 60_000;
const MESSAGE_XP_MIN = 15;
const MESSAGE_XP_MAX = 25;
const VOICE_XP_PER_TICK = 10;
const FLUSH_INTERVAL_MS = 30_000;

export interface LevelEntry {
  xp: number;
  level: number;
  lastMessageAt: number;
  messageCount?: number;
  voiceMinutes?: number;
}

interface LevelsDb {
  users: Record<string, Record<string, LevelEntry>>;
}

let cache: LevelsDb | null = null;
let dirty = false;
let writeLock: Promise<void> = Promise.resolve();

export function xpForLevel(level: number): number {
  let total = 0;
  for (let i = 0; i < level; i++) {
    total += 5 * i * i + 50 * i + 100;
  }
  return total;
}

export function xpForNextLevel(level: number): number {
  return 5 * level * level + 50 * level + 100;
}

export function levelFromXp(xp: number): number {
  let level = 0;
  let needed = xpForNextLevel(level);
  let acc = 0;
  while (xp >= acc + needed) {
    acc += needed;
    level += 1;
    needed = xpForNextLevel(level);
  }
  return level;
}

async function ensureLoaded(): Promise<LevelsDb> {
  if (cache) return cache;
  try {
    await fs.mkdir(DATA_DIR, { recursive: true });
    const text = await fs.readFile(LEVELS_FILE, "utf8");
    cache = JSON.parse(text) as LevelsDb;
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") {
      cache = { users: {} };
    } else {
      throw err;
    }
  }
  return cache;
}

async function flush(): Promise<void> {
  if (!cache || !dirty) return;
  dirty = false;
  const snapshot = JSON.stringify(cache);
  writeLock = writeLock.then(async () => {
    await fs.mkdir(DATA_DIR, { recursive: true });
    await fs.writeFile(LEVELS_FILE, snapshot, "utf8");
  });
  await writeLock;
}

setInterval(() => {
  flush().catch((err) => console.error("Levels flush failed:", err));
}, FLUSH_INTERVAL_MS).unref();

function getEntry(db: LevelsDb, guildId: string, userId: string): LevelEntry {
  const guild = db.users[guildId] ?? (db.users[guildId] = {});
  let entry = guild[userId];
  if (!entry) {
    entry = { xp: 0, level: 0, lastMessageAt: 0, messageCount: 0, voiceMinutes: 0 };
    guild[userId] = entry;
  }
  entry.messageCount ??= 0;
  entry.voiceMinutes ??= 0;
  return entry;
}

export interface XpGainResult {
  gained: number;
  totalXp: number;
  level: number;
  leveledUp: boolean;
  previousLevel: number;
}

export async function addMessageXp(
  guildId: string,
  userId: string,
): Promise<XpGainResult | null> {
  const db = await ensureLoaded();
  const entry = getEntry(db, guildId, userId);
  entry.messageCount = (entry.messageCount ?? 0) + 1;
  dirty = true;
  const now = Date.now();
  if (now - entry.lastMessageAt < MESSAGE_COOLDOWN_MS) return null;

  const gained =
    Math.floor(Math.random() * (MESSAGE_XP_MAX - MESSAGE_XP_MIN + 1)) +
    MESSAGE_XP_MIN;
  const result = applyXp(entry, gained);
  if (result.leveledUp) await flush();
  return result;
}

export async function addVoiceXp(
  guildId: string,
  userId: string,
): Promise<XpGainResult> {
  const db = await ensureLoaded();
  const entry = getEntry(db, guildId, userId);
  entry.voiceMinutes = (entry.voiceMinutes ?? 0) + 1;
  const result = applyXp(entry, VOICE_XP_PER_TICK);
  if (result.leveledUp) await flush();
  return result;
}

function applyXp(entry: LevelEntry, gained: number): XpGainResult {
  const previousLevel = entry.level;
  entry.xp += gained;
  entry.lastMessageAt = Date.now();
  const newLevel = levelFromXp(entry.xp);
  entry.level = newLevel;
  dirty = true;
  return {
    gained,
    totalXp: entry.xp,
    level: newLevel,
    leveledUp: newLevel > previousLevel,
    previousLevel,
  };
}

export async function adjustXp(
  guildId: string,
  userId: string,
  delta: number,
): Promise<XpGainResult> {
  const db = await ensureLoaded();
  const entry = getEntry(db, guildId, userId);
  const previousLevel = entry.level;
  entry.xp = Math.max(0, entry.xp + delta);
  const newLevel = levelFromXp(entry.xp);
  entry.level = newLevel;
  dirty = true;
  await flush();
  return {
    gained: delta,
    totalXp: entry.xp,
    level: newLevel,
    leveledUp: newLevel > previousLevel,
    previousLevel,
  };
}

export async function setXp(
  guildId: string,
  userId: string,
  xp: number,
): Promise<XpGainResult> {
  const db = await ensureLoaded();
  const entry = getEntry(db, guildId, userId);
  const previousLevel = entry.level;
  entry.xp = Math.max(0, xp);
  const newLevel = levelFromXp(entry.xp);
  entry.level = newLevel;
  dirty = true;
  await flush();
  return {
    gained: 0,
    totalXp: entry.xp,
    level: newLevel,
    leveledUp: newLevel > previousLevel,
    previousLevel,
  };
}

export async function resetUserXp(
  guildId: string,
  userId: string,
): Promise<boolean> {
  const db = await ensureLoaded();
  const guild = db.users[guildId];
  if (!guild || !guild[userId]) return false;
  delete guild[userId];
  dirty = true;
  await flush();
  return true;
}

export async function resetGuildXp(guildId: string): Promise<number> {
  const db = await ensureLoaded();
  const guild = db.users[guildId];
  if (!guild) return 0;
  const count = Object.keys(guild).length;
  delete db.users[guildId];
  dirty = true;
  await flush();
  return count;
}

export async function getUserLevel(
  guildId: string,
  userId: string,
): Promise<LevelEntry | null> {
  const db = await ensureLoaded();
  return db.users[guildId]?.[userId] ?? null;
}

export async function getLeaderboard(
  guildId: string,
  limit = 10,
): Promise<Array<{ userId: string; xp: number; level: number }>> {
  const db = await ensureLoaded();
  const guild = db.users[guildId];
  if (!guild) return [];
  return Object.entries(guild)
    .map(([userId, entry]) => ({
      userId,
      xp: entry.xp,
      level: entry.level,
    }))
    .sort((a, b) => b.xp - a.xp)
    .slice(0, limit);
}

export async function getRank(
  guildId: string,
  userId: string,
): Promise<number | null> {
  const db = await ensureLoaded();
  const guild = db.users[guildId];
  if (!guild || !guild[userId]) return null;
  const sorted = Object.entries(guild).sort(([, a], [, b]) => b.xp - a.xp);
  const idx = sorted.findIndex(([id]) => id === userId);
  return idx >= 0 ? idx + 1 : null;
}

export function progressToNextLevel(xp: number): {
  level: number;
  currentLevelXp: number;
  neededForNext: number;
  totalForNext: number;
  percent: number;
} {
  const level = levelFromXp(xp);
  const accumulated = xpForLevel(level);
  const totalForNext = xpForNextLevel(level);
  const currentLevelXp = xp - accumulated;
  const percent = Math.min(100, Math.floor((currentLevelXp / totalForNext) * 100));
  return {
    level,
    currentLevelXp,
    neededForNext: totalForNext - currentLevelXp,
    totalForNext,
    percent,
  };
}

export type LbSortBy = "xp" | "messages" | "voice";

export async function getFullLeaderboard(
  guildId: string,
  sortBy: LbSortBy,
  limit = 10,
  offset = 0,
): Promise<
  Array<{
    userId: string;
    xp: number;
    level: number;
    messageCount: number;
    voiceMinutes: number;
  }>
> {
  const db = await ensureLoaded();
  const guild = db.users[guildId];
  if (!guild) return [];
  const entries = Object.entries(guild).map(([userId, e]) => ({
    userId,
    xp: e.xp,
    level: e.level,
    messageCount: e.messageCount ?? 0,
    voiceMinutes: e.voiceMinutes ?? 0,
  }));
  const key =
    sortBy === "xp" ? "xp" : sortBy === "messages" ? "messageCount" : "voiceMinutes";
  entries.sort((a, b) => b[key] - a[key]);
  return entries.slice(offset, offset + limit);
}

export async function getLeaderboardTotal(guildId: string): Promise<number> {
  const db = await ensureLoaded();
  const guild = db.users[guildId];
  return guild ? Object.keys(guild).length : 0;
}

export async function getActiveMembers24h(guildId: string): Promise<number> {
  const db = await ensureLoaded();
  const guild = db.users[guildId];
  if (!guild) return 0;
  const cutoff = Date.now() - 24 * 60 * 60 * 1000;
  return Object.values(guild).filter((e) => e.lastMessageAt > cutoff).length;
}

export async function shutdownFlush(): Promise<void> {
  await flush();
}
