import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { GuildMember } from "discord.js";
import { PermissionFlagsBits } from "discord.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(__dirname, "..", "data");
const FILE = path.join(DATA_DIR, "permissions.json");

// ──────────────────────────────────────────────
// Category definitions
// ──────────────────────────────────────────────

export const CATEGORIES = {
  moderation: {
    label: "🔨 Modération",
    description: "kick, ban, unban, timeout, warn, warnings, purge, lock, unlock, slowmode",
    commands: new Set([
      "kick", "ban", "unban", "timeout", "untimeout",
      "warn", "warnings", "clearwarnings", "delwarning",
      "purge", "lock", "unlock", "slowmode",
    ]),
  },
  casino: {
    label: "🎰 Casino",
    description: "balance, daily, slots, blackjack, roulette, economy",
    commands: new Set([
      "balance", "daily", "slots", "blackjack", "roulette", "economy",
    ]),
  },
  levels: {
    label: "📈 Niveaux & XP",
    description: "level, leaderboard, xp, levelrole",
    commands: new Set([
      "level", "leaderboard", "xp", "levelrole",
    ]),
  },
  tickets: {
    label: "🎟️ Tickets",
    description: "ticket",
    commands: new Set(["ticket"]),
  },
  utilities: {
    label: "🛠️ Utilitaires",
    description: "ping, userstats, channelstats, snipe, roleinfo, stats, membercount, poll, quote, embed, dm, help",
    commands: new Set([
      "ping", "userstats", "channelstats", "snipe",
      "roleinfo", "stats", "membercount",
      "poll", "quote", "embed", "dm", "help", "commands",
    ]),
  },
  config: {
    label: "⚙️ Configuration",
    description: "autorole, automod, levels (config), botrole, casino (config), setavatar",
    commands: new Set([
      "autorole", "automod", "levels", "botrole", "casino", "setavatar",
    ]),
  },
} as const;

export type CategoryId = keyof typeof CATEGORIES;
export const CATEGORY_IDS = Object.keys(CATEGORIES) as CategoryId[];

// ──────────────────────────────────────────────
// Persistence
// ──────────────────────────────────────────────

export interface CategoryPerms {
  roleIds: string[];
  userIds: string[];
}

type PermDb = Record<string, Record<string, CategoryPerms>>;

let cache: PermDb | null = null;
let writeLock: Promise<void> = Promise.resolve();

async function ensureLoaded(): Promise<PermDb> {
  if (cache) return cache;
  try {
    await fs.mkdir(DATA_DIR, { recursive: true });
    const text = await fs.readFile(FILE, "utf8");
    cache = JSON.parse(text) as PermDb;
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
    await fs.writeFile(FILE, snapshot, "utf8");
  });
  await writeLock;
}

function getEntry(db: PermDb, guildId: string, categoryId: string): CategoryPerms {
  db[guildId] ??= {};
  db[guildId][categoryId] ??= { roleIds: [], userIds: [] };
  return db[guildId][categoryId];
}

// ──────────────────────────────────────────────
// CRUD
// ──────────────────────────────────────────────

export async function getCategoryPerms(guildId: string, categoryId: CategoryId): Promise<CategoryPerms> {
  const db = await ensureLoaded();
  return { ...(db[guildId]?.[categoryId] ?? { roleIds: [], userIds: [] }) };
}

export async function getAllPerms(guildId: string): Promise<Record<CategoryId, CategoryPerms>> {
  const db = await ensureLoaded();
  const result = {} as Record<CategoryId, CategoryPerms>;
  for (const id of CATEGORY_IDS) {
    result[id] = { ...(db[guildId]?.[id] ?? { roleIds: [], userIds: [] }) };
  }
  return result;
}

export async function addRole(guildId: string, categoryId: CategoryId, roleId: string): Promise<CategoryPerms> {
  const db = await ensureLoaded();
  const entry = getEntry(db, guildId, categoryId);
  if (!entry.roleIds.includes(roleId)) entry.roleIds.push(roleId);
  await persist();
  return { ...entry };
}

export async function removeRole(guildId: string, categoryId: CategoryId, roleId: string): Promise<CategoryPerms> {
  const db = await ensureLoaded();
  const entry = getEntry(db, guildId, categoryId);
  entry.roleIds = entry.roleIds.filter((r) => r !== roleId);
  await persist();
  return { ...entry };
}

export async function addUser(guildId: string, categoryId: CategoryId, userId: string): Promise<CategoryPerms> {
  const db = await ensureLoaded();
  const entry = getEntry(db, guildId, categoryId);
  if (!entry.userIds.includes(userId)) entry.userIds.push(userId);
  await persist();
  return { ...entry };
}

export async function removeUser(guildId: string, categoryId: CategoryId, userId: string): Promise<CategoryPerms> {
  const db = await ensureLoaded();
  const entry = getEntry(db, guildId, categoryId);
  entry.userIds = entry.userIds.filter((u) => u !== userId);
  await persist();
  return { ...entry };
}

export async function resetCategory(guildId: string, categoryId: CategoryId): Promise<void> {
  const db = await ensureLoaded();
  if (db[guildId]) delete db[guildId][categoryId];
  await persist();
}

// ──────────────────────────────────────────────
// Lookup
// ──────────────────────────────────────────────

export function getCategoryForCommand(commandName: string): CategoryId | null {
  for (const [id, cat] of Object.entries(CATEGORIES)) {
    if ((cat.commands as Set<string>).has(commandName)) return id as CategoryId;
  }
  return null;
}

// ──────────────────────────────────────────────
// Permission check
// ──────────────────────────────────────────────

export async function checkCategoryPermission(
  member: GuildMember,
  commandName: string,
): Promise<{ allowed: boolean; categoryLabel: string | null; reason: string }> {
  const categoryId = getCategoryForCommand(commandName);

  if (!categoryId) {
    return { allowed: true, categoryLabel: null, reason: "no_category" };
  }

  const label = CATEGORIES[categoryId].label;

  // Server owner and admins are always exempt
  if (
    member.guild.ownerId === member.id ||
    member.permissions.has(PermissionFlagsBits.Administrator)
  ) {
    return { allowed: true, categoryLabel: label, reason: "admin_exempt" };
  }

  const perms = await getCategoryPerms(member.guild.id, categoryId);
  const hasNoRestrictions = perms.roleIds.length === 0 && perms.userIds.length === 0;

  if (hasNoRestrictions) {
    return { allowed: true, categoryLabel: label, reason: "open" };
  }

  // Check if user is explicitly allowed
  if (perms.userIds.includes(member.id)) {
    return { allowed: true, categoryLabel: label, reason: "user_allowed" };
  }

  // Check if user has any of the allowed roles
  const hasRole = perms.roleIds.some((roleId) => member.roles.cache.has(roleId));
  if (hasRole) {
    return { allowed: true, categoryLabel: label, reason: "role_allowed" };
  }

  return { allowed: false, categoryLabel: label, reason: "denied" };
}
