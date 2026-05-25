import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(__dirname, "..", "data");
const FILE = path.join(DATA_DIR, "settings.json");

interface GuildSettings {
  automodEnabled: boolean;
  xpEnabled: boolean;
  botRoleIds: string[];
  keepRoleIds?: string[];
  /** @deprecated migrated to botRoleIds */
  botRoleId?: string;
}

interface SettingsDb {
  guilds: Record<string, GuildSettings>;
}

const DEFAULT_SETTINGS: GuildSettings = {
  automodEnabled: true,
  xpEnabled: true,
  botRoleIds: [],
};

let cache: SettingsDb | null = null;
let writeLock: Promise<void> = Promise.resolve();

async function ensureLoaded(): Promise<SettingsDb> {
  if (cache) return cache;
  try {
    await fs.mkdir(DATA_DIR, { recursive: true });
    const text = await fs.readFile(FILE, "utf8");
    cache = JSON.parse(text) as SettingsDb;
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

function getGuild(db: SettingsDb, guildId: string): GuildSettings {
  const g = (db.guilds[guildId] ??= { ...DEFAULT_SETTINGS });
  if (!g.botRoleIds) {
    g.botRoleIds = g.botRoleId ? [g.botRoleId] : [];
    delete g.botRoleId;
  }
  return g;
}

export async function isAutomodEnabled(guildId: string): Promise<boolean> {
  const db = await ensureLoaded();
  return getGuild(db, guildId).automodEnabled;
}

export async function setAutomodEnabled(
  guildId: string,
  enabled: boolean,
): Promise<void> {
  const db = await ensureLoaded();
  getGuild(db, guildId).automodEnabled = enabled;
  await persist();
}

export async function isXpEnabled(guildId: string): Promise<boolean> {
  const db = await ensureLoaded();
  return getGuild(db, guildId).xpEnabled;
}

export async function setXpEnabled(
  guildId: string,
  enabled: boolean,
): Promise<void> {
  const db = await ensureLoaded();
  getGuild(db, guildId).xpEnabled = enabled;
  await persist();
}

export async function getBotRoles(guildId: string): Promise<string[]> {
  const db = await ensureLoaded();
  return [...getGuild(db, guildId).botRoleIds];
}

export async function addBotRole(
  guildId: string,
  roleId: string,
): Promise<boolean> {
  const db = await ensureLoaded();
  const guild = getGuild(db, guildId);
  if (guild.botRoleIds.includes(roleId)) return false;
  guild.botRoleIds.push(roleId);
  await persist();
  return true;
}

export async function removeBotRole(
  guildId: string,
  roleId: string,
): Promise<boolean> {
  const db = await ensureLoaded();
  const guild = getGuild(db, guildId);
  const before = guild.botRoleIds.length;
  guild.botRoleIds = guild.botRoleIds.filter((id) => id !== roleId);
  if (guild.botRoleIds.length === before) return false;
  await persist();
  return true;
}

export async function clearBotRoles(guildId: string): Promise<boolean> {
  const db = await ensureLoaded();
  const guild = getGuild(db, guildId);
  if (guild.botRoleIds.length === 0) return false;
  guild.botRoleIds = [];
  await persist();
  return true;
}

export async function getGuildSettings(
  guildId: string,
): Promise<GuildSettings> {
  const db = await ensureLoaded();
  return { ...getGuild(db, guildId) };
}

export async function getKeepRoles(guildId: string): Promise<string[]> {
  const db = await ensureLoaded();
  return [...(getGuild(db, guildId).keepRoleIds ?? [])];
}

export async function addKeepRole(
  guildId: string,
  roleId: string,
): Promise<boolean> {
  const db = await ensureLoaded();
  const guild = getGuild(db, guildId);
  guild.keepRoleIds ??= [];
  if (guild.keepRoleIds.includes(roleId)) return false;
  guild.keepRoleIds.push(roleId);
  await persist();
  return true;
}

export async function removeKeepRole(
  guildId: string,
  roleId: string,
): Promise<boolean> {
  const db = await ensureLoaded();
  const guild = getGuild(db, guildId);
  const before = guild.keepRoleIds?.length ?? 0;
  guild.keepRoleIds = (guild.keepRoleIds ?? []).filter((id) => id !== roleId);
  if (guild.keepRoleIds.length === before) return false;
  await persist();
  return true;
}

export async function clearKeepRoles(guildId: string): Promise<void> {
  const db = await ensureLoaded();
  getGuild(db, guildId).keepRoleIds = [];
  await persist();
}
