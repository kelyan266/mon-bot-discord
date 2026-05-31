import { loadJson, saveJson } from "./persist.js";

interface LevelRolesDb {
  guilds: Record<string, Record<string, string>>;
}

let cache: LevelRolesDb | null = null;

async function ensureLoaded(): Promise<LevelRolesDb> {
  if (cache) return cache;
  cache = await loadJson<LevelRolesDb>("levelRoles.json", { guilds: {} });
  return cache;
}

async function persist(): Promise<void> {
  if (!cache) return;
  await saveJson("levelRoles.json", cache);
}

export async function setLevelRole(
  guildId: string,
  level: number,
  roleId: string,
): Promise<void> {
  const db = await ensureLoaded();
  const guild = db.guilds[guildId] ?? (db.guilds[guildId] = {});
  guild[String(level)] = roleId;
  await persist();
}

export async function removeLevelRole(
  guildId: string,
  level: number,
): Promise<boolean> {
  const db = await ensureLoaded();
  const guild = db.guilds[guildId];
  if (!guild || !guild[String(level)]) return false;
  delete guild[String(level)];
  await persist();
  return true;
}

export async function getLevelRole(
  guildId: string,
  level: number,
): Promise<string | null> {
  const db = await ensureLoaded();
  return db.guilds[guildId]?.[String(level)] ?? null;
}

export async function listLevelRoles(
  guildId: string,
): Promise<Array<{ level: number; roleId: string }>> {
  const db = await ensureLoaded();
  const guild = db.guilds[guildId];
  if (!guild) return [];
  return Object.entries(guild)
    .map(([level, roleId]) => ({ level: Number(level), roleId }))
    .sort((a, b) => a.level - b.level);
}

export async function getRolesUpToLevel(
  guildId: string,
  level: number,
): Promise<Array<{ level: number; roleId: string }>> {
  const all = await listLevelRoles(guildId);
  return all.filter((r) => r.level <= level);
}
