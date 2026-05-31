import { loadJson, saveJson } from "./persist.js";

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

async function ensureLoaded(): Promise<SettingsDb> {
  if (cache) return cache;
  cache = await loadJson<SettingsDb>("settings.json", { guilds: {} });
  return cache;
}

async function persist(): Promise<void> {
  if (!cache) return;
  await saveJson("settings.json", cache);
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
