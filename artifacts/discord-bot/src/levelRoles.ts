import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(__dirname, "..", "data");
const FILE = path.join(DATA_DIR, "levelRoles.json");

interface LevelRolesDb {
  guilds: Record<string, Record<string, string>>;
}

let cache: LevelRolesDb | null = null;
let writeLock: Promise<void> = Promise.resolve();

async function ensureLoaded(): Promise<LevelRolesDb> {
  if (cache) return cache;
  try {
    await fs.mkdir(DATA_DIR, { recursive: true });
    const text = await fs.readFile(FILE, "utf8");
    cache = JSON.parse(text) as LevelRolesDb;
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
