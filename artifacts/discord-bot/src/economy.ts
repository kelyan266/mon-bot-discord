import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { getCasinoConfig } from "./casinoConfig.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(__dirname, "..", "data");
const FILE = path.join(DATA_DIR, "economy.json");

export const CURRENCY = "🪙";

interface UserEconomy {
  balance: number;
  lastDaily?: number;
  streak?: number;
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

async function getUser(guildId: string, userId: string): Promise<{ db: EconomyDb; user: UserEconomy }> {
  const db = await ensureLoaded();
  db.guilds[guildId] ??= {};
  const cfg = await getCasinoConfig(guildId);
  db.guilds[guildId][userId] ??= { balance: cfg.startingBalance };
  return { db, user: db.guilds[guildId][userId] };
}

export async function getBalance(guildId: string, userId: string): Promise<number> {
  const { user } = await getUser(guildId, userId);
  return user.balance;
}

export async function addBalance(guildId: string, userId: string, amount: number): Promise<number> {
  const { user } = await getUser(guildId, userId);
  user.balance = Math.max(0, user.balance + amount);
  await persist();
  return user.balance;
}

export async function setBalance(guildId: string, userId: string, amount: number): Promise<number> {
  const { user } = await getUser(guildId, userId);
  user.balance = Math.max(0, amount);
  await persist();
  return user.balance;
}

export async function resetBalance(guildId: string, userId: string): Promise<number> {
  const cfg = await getCasinoConfig(guildId);
  const { user } = await getUser(guildId, userId);
  user.balance = cfg.startingBalance;
  user.streak = 0;
  delete user.lastDaily;
  await persist();
  return user.balance;
}

export async function canAfford(guildId: string, userId: string, amount: number): Promise<boolean> {
  const bal = await getBalance(guildId, userId);
  return bal >= amount;
}

export type DailyResult =
  | {
      success: true;
      balance: number;
      earned: number;
      streak: number;
      bonusAmount: number;
    }
  | {
      success: false;
      remainingMs: number;
      streak: number;
    };

export async function claimDaily(
  guildId: string,
  userId: string,
): Promise<DailyResult> {
  const cfg = await getCasinoConfig(guildId);
  const { user } = await getUser(guildId, userId);
  const now = Date.now();
  const cooldownMs = cfg.dailyCooldownHours * 60 * 60 * 1000;

  if (user.lastDaily && now - user.lastDaily < cooldownMs) {
    return { success: false, remainingMs: cooldownMs - (now - user.lastDaily), streak: user.streak ?? 0 };
  }

  let streak = user.streak ?? 0;
  if (cfg.dailyStreakBonus) {
    const gracePeriodMs = cooldownMs + 2 * 60 * 60 * 1000;
    if (user.lastDaily && now - user.lastDaily <= gracePeriodMs) {
      streak = Math.min(streak + 1, 30);
    } else {
      streak = 0;
    }
    user.streak = streak;
  }

  const bonusAmount = cfg.dailyStreakBonus
    ? Math.floor(cfg.dailyAmount * Math.min(streak, 7) * 0.1)
    : 0;
  const earned = cfg.dailyAmount + bonusAmount;
  user.balance += earned;
  user.lastDaily = now;
  await persist();

  return { success: true, balance: user.balance, earned, streak, bonusAmount };
}

export async function getEconomyLeaderboard(
  guildId: string,
  limit = 10,
  offset = 0,
): Promise<Array<{ userId: string; balance: number; streak: number }>> {
  const db = await ensureLoaded();
  const guild = db.guilds[guildId] ?? {};
  return Object.entries(guild)
    .map(([userId, data]) => ({ userId, balance: data.balance, streak: data.streak ?? 0 }))
    .sort((a, b) => b.balance - a.balance)
    .slice(offset, offset + limit);
}

export async function getEconomyTotal(guildId: string): Promise<number> {
  const db = await ensureLoaded();
  return Object.keys(db.guilds[guildId] ?? {}).length;
}
