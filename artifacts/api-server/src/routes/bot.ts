import { Router } from "express";
import { readFileSync, existsSync } from "fs";
import { join } from "path";

const DATA_DIR = join(process.cwd(), "artifacts/discord-bot/data");

function readJson<T>(file: string, fallback: T): T {
  const p = join(DATA_DIR, file);
  if (!existsSync(p)) return fallback;
  try {
    return JSON.parse(readFileSync(p, "utf-8")) as T;
  } catch {
    return fallback;
  }
}

interface LevelUser {
  xp: number;
  level: number;
  messageCount?: number;
  voiceMinutes?: number;
  lastMessageAt?: number;
}

interface LevelsData {
  users: Record<string, Record<string, LevelUser>>;
}

interface EconomyUser {
  balance: number;
  lastDaily?: number;
}

interface EconomyData {
  guilds: Record<string, Record<string, EconomyUser>>;
}

interface WarningEntry {
  id: string;
  guildId: string;
  userId: string;
  moderatorId: string;
  reason: string;
  timestamp: number;
}

interface WarningsData {
  warnings: WarningEntry[];
}

interface PollEntry {
  id: string;
  guildId: string;
  channelId: string;
  question: string;
  options: string[];
  votes: Record<string, number>;
  ended: boolean;
  createdAt: number;
  creatorId: string;
  messageId?: string;
}

interface PollsData {
  polls: Record<string, PollEntry>;
}

const router = Router();

router.get("/bot/guilds", (_req, res) => {
  const levels = readJson<LevelsData>("levels.json", { users: {} });
  const guilds = Object.entries(levels.users).map(([id, users]) => ({
    id,
    userCount: Object.keys(users).length,
  }));
  res.json(guilds);
});

router.get("/bot/stats", (_req, res) => {
  const levels = readJson<LevelsData>("levels.json", { users: {} });
  const warnings = readJson<WarningsData>("warnings.json", { warnings: [] });
  const economy = readJson<EconomyData>("economy.json", { guilds: {} });
  const polls = readJson<PollsData>("polls.json", { polls: {} });

  let totalUsers = 0;
  let topLevel = 0;
  for (const guild of Object.values(levels.users)) {
    totalUsers += Object.keys(guild).length;
    for (const u of Object.values(guild)) {
      if (u.level > topLevel) topLevel = u.level;
    }
  }

  let totalEconomyCoins = 0;
  for (const guild of Object.values(economy.guilds)) {
    for (const u of Object.values(guild)) {
      totalEconomyCoins += u.balance;
    }
  }

  const activePolls = Object.values(polls.polls).filter((p) => !p.ended).length;

  const totalGuilds = Object.keys(levels.users).length;

  res.json({
    totalUsers,
    totalWarnings: warnings.warnings.length,
    activePolls,
    totalGuilds,
    topLevel,
    totalEconomyCoins,
  });
});

router.get("/bot/leaderboard", (req, res) => {
  const guildId = req.query["guildId"] as string;
  const limit = Math.min(Number(req.query["limit"] ?? 50), 100);

  if (!guildId) {
    res.status(400).json({ error: "guildId is required" });
    return;
  }

  const levels = readJson<LevelsData>("levels.json", { users: {} });
  const guild = levels.users[guildId] ?? {};

  const sorted = Object.entries(guild)
    .sort(([, a], [, b]) => b.xp - a.xp)
    .slice(0, limit)
    .map(([userId, u], idx) => ({
      userId,
      xp: u.xp,
      level: u.level,
      messageCount: u.messageCount ?? null,
      voiceMinutes: u.voiceMinutes ?? null,
      rank: idx + 1,
    }));

  res.json(sorted);
});

router.get("/bot/economy", (req, res) => {
  const guildId = req.query["guildId"] as string;
  const limit = Math.min(Number(req.query["limit"] ?? 50), 100);

  if (!guildId) {
    res.status(400).json({ error: "guildId is required" });
    return;
  }

  const economy = readJson<EconomyData>("economy.json", { guilds: {} });
  const guild = economy.guilds[guildId] ?? {};

  const sorted = Object.entries(guild)
    .sort(([, a], [, b]) => b.balance - a.balance)
    .slice(0, limit)
    .map(([userId, u], idx) => ({
      userId,
      balance: u.balance,
      rank: idx + 1,
    }));

  res.json(sorted);
});

router.get("/bot/warnings", (req, res) => {
  const guildId = req.query["guildId"] as string;
  if (!guildId) {
    res.status(400).json({ error: "guildId is required" });
    return;
  }

  const data = readJson<WarningsData>("warnings.json", { warnings: [] });
  const filtered = data.warnings
    .filter((w) => w.guildId === guildId)
    .sort((a, b) => b.timestamp - a.timestamp);

  res.json(filtered);
});

router.get("/bot/polls", (req, res) => {
  const guildId = req.query["guildId"] as string;
  if (!guildId) {
    res.status(400).json({ error: "guildId is required" });
    return;
  }

  const data = readJson<PollsData>("polls.json", { polls: {} });
  const filtered = Object.values(data.polls)
    .filter((p) => p.guildId === guildId)
    .sort((a, b) => b.createdAt - a.createdAt);

  res.json(filtered);
});

export default router;
