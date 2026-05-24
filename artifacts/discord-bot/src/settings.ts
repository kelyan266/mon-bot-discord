import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(__dirname, "..", "data");
const FILE = path.join(DATA_DIR, "settings.json");

interface GuildSettings {
  automodEnabled: boolean;
  xpEnabled: boolean;
}

interface SettingsDb {
  guilds: Record<string, GuildSettings>;
}

const DEFAULT_SETTINGS: GuildSettings = {
  automodEnabled: true,
  xpEnabled: true,
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
  return (db.guilds[guildId] ??= { ...DEFAULT_SETTINGS });
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

export async function getGuildSettings(
  guildId: string,
): Promise<GuildSettings> {
  const db = await ensureLoaded();
  return { ...getGuild(db, guildId) };
}
