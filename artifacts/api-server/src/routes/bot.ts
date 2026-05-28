import { Router } from "express";
import { readFileSync, existsSync, writeFileSync } from "fs";
import { join } from "path";
import { fileURLToPath } from "url";

const BOT_TOKEN = process.env.DISCORD_BOT_TOKEN ?? "";

interface CachedUser {
  id: string;
  username: string;
  displayName: string | null;
  avatarUrl: string | null;
  expiresAt: number;
}
const userCache = new Map<string, CachedUser>();

async function resolveDiscordUser(userId: string): Promise<CachedUser> {
  const cached = userCache.get(userId);
  if (cached && cached.expiresAt > Date.now()) return cached;

  try {
    const res = await fetch(`https://discord.com/api/v10/users/${userId}`, {
      headers: { Authorization: `Bot ${BOT_TOKEN}` },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = (await res.json()) as {
      id: string;
      username: string;
      global_name?: string | null;
      avatar?: string | null;
    };
    const entry: CachedUser = {
      id: data.id,
      username: data.username,
      displayName: data.global_name ?? null,
      avatarUrl: data.avatar
        ? `https://cdn.discordapp.com/avatars/${data.id}/${data.avatar}.webp?size=64`
        : null,
      expiresAt: Date.now() + 60 * 60 * 1000,
    };
    userCache.set(userId, entry);
    return entry;
  } catch {
    const fallback: CachedUser = {
      id: userId,
      username: userId,
      displayName: null,
      avatarUrl: null,
      expiresAt: Date.now() + 5 * 60 * 1000,
    };
    userCache.set(userId, fallback);
    return fallback;
  }
}

function writeJson(file: string, data: unknown) {
  writeFileSync(join(DATA_DIR, file), JSON.stringify(data, null, 2), "utf-8");
}

function nanoid(len = 12) {
  const chars = "abcdefghijklmnopqrstuvwxyz0123456789";
  return Array.from({ length: len }, () =>
    chars[Math.floor(Math.random() * chars.length)],
  ).join("");
}

const DATA_DIR = join(
  fileURLToPath(new URL("../../discord-bot/data", import.meta.url)),
);

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

router.use((_req, res, next) => {
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("Pragma", "no-cache");
  next();
});

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

router.post("/bot/warnings", (req, res) => {
  const { guildId, userId, moderatorId, reason } = req.body as {
    guildId: string;
    userId: string;
    moderatorId: string;
    reason: string;
  };
  if (!guildId || !userId || !moderatorId || !reason) {
    res.status(400).json({ error: "guildId, userId, moderatorId, reason are required" });
    return;
  }
  const data = readJson<WarningsData>("warnings.json", { warnings: [] });
  const entry: WarningEntry = {
    id: `${nanoid(8)}-${nanoid(6)}`,
    guildId,
    userId,
    moderatorId,
    reason,
    timestamp: Date.now(),
  };
  data.warnings.push(entry);
  writeJson("warnings.json", data);
  res.status(201).json(entry);
});

router.delete("/bot/warnings/:warningId", (req, res) => {
  const { warningId } = req.params;
  const data = readJson<WarningsData>("warnings.json", { warnings: [] });
  const before = data.warnings.length;
  data.warnings = data.warnings.filter((w) => w.id !== warningId);
  if (data.warnings.length === before) {
    res.status(404).json({ error: "Warning not found" });
    return;
  }
  writeJson("warnings.json", data);
  res.json({ status: "ok" });
});

router.get("/bot/resolve", async (req, res) => {
  const raw = (req.query["ids"] as string) ?? "";
  const ids = raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, 50);

  if (ids.length === 0) {
    res.json([]);
    return;
  }

  const results = await Promise.all(ids.map(resolveDiscordUser));
  res.json(results);
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

router.post("/bot/polls/:id/close", (req, res) => {
  const { id } = req.params;
  const data = readJson<PollsData>("polls.json", { polls: {} });
  const poll = data.polls[id];
  if (!poll) {
    res.status(404).json({ error: "Sondage introuvable" });
    return;
  }
  if (poll.ended) {
    res.status(400).json({ error: "Sondage déjà terminé" });
    return;
  }
  poll.ended = true;
  writeJson("polls.json", data);
  res.json(poll);
});

export default router;
