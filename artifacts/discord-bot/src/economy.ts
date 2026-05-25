import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(__dirname, "..", "data");
const FILE = path.join(DATA_DIR, "economy.json");

export const STARTING_BALANCE = 500;
export const DAILY_AMOUNT = 200;
export const DAILY_COOLDOWN_MS = 24 * 60 * 60 * 1000;
export const MIN_BET = 10;
export const CURRENCY = "🪙";

interface UserEconomy {
  balance: number;
  lastDaily?: number;
}

interface EconomyDb {
  guilds: Record<string, Record<string, UserEconomy>>;
}

let cache: EconomyDb | null = null;
let writeLock: Promise<void> = Promise.resolve();

async function ensureLoaded(): Promise<EconomyDb> {
  if (cache) return cache;
  try {
    await fs.mkdir(DATA_DIR, { recursive: true });
    const text = await fs.readFile(FILE, "utf8");
    cache = JSON.parse(text) as EconomyDb;
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

function getUser(db: EconomyDb, guildId: string, userId: string): UserEconomy {
  db.guilds[guildId] ??= {};
  return (db.guilds[guildId][userId] ??= { balance: STARTING_BALANCE });
}

export async function getBalance(
  guildId: string,
  userId: string,
): Promise<number> {
  const db = await ensureLoaded();
  return getUser(db, guildId, userId).balance;
}

export async function addBalance(
  guildId: string,
  userId: string,
  amount: number,
): Promise<number> {
  const db = await ensureLoaded();
  const user = getUser(db, guildId, userId);
  user.balance = Math.max(0, user.balance + amount);
  await persist();
  return user.balance;
}

export async function canAfford(
  guildId: string,
  userId: string,
  amount: number,
): Promise<boolean> {
  const bal = await getBalance(guildId, userId);
  return bal >= amount;
}

export async function claimDaily(
  guildId: string,
  userId: string,
): Promise<{ success: true; balance: number } | { success: false; remainingMs: number }> {
  const db = await ensureLoaded();
  const user = getUser(db, guildId, userId);
  const now = Date.now();
  if (user.lastDaily && now - user.lastDaily < DAILY_COOLDOWN_MS) {
    return { success: false, remainingMs: DAILY_COOLDOWN_MS - (now - user.lastDaily) };
  }
  user.balance += DAILY_AMOUNT;
  user.lastDaily = now;
  await persist();
  return { success: true, balance: user.balance };
}

export async function getLeaderboard(
  guildId: string,
  limit = 10,
): Promise<Array<{ userId: string; balance: number }>> {
  const db = await ensureLoaded();
  const guild = db.guilds[guildId] ?? {};
  return Object.entries(guild)
    .map(([userId, data]) => ({ userId, balance: data.balance }))
    .sort((a, b) => b.balance - a.balance)
    .slice(0, limit);
}
