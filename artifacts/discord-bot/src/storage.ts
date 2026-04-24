import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(__dirname, "..", "data");
const WARNINGS_FILE = path.join(DATA_DIR, "warnings.json");
const AUTO_ROLES_FILE = path.join(DATA_DIR, "autoRoles.json");

export interface WarningRecord {
  id: string;
  guildId: string;
  userId: string;
  moderatorId: string;
  reason: string;
  timestamp: number;
}

interface WarningsDb {
  warnings: WarningRecord[];
}

interface AutoRolesDb {
  roles: Record<string, string>;
}

let cache: WarningsDb | null = null;
let writeLock: Promise<void> = Promise.resolve();
let autoRolesCache: AutoRolesDb | null = null;
let autoRolesWriteLock: Promise<void> = Promise.resolve();

async function ensureLoaded(): Promise<WarningsDb> {
  if (cache) return cache;
  try {
    await fs.mkdir(DATA_DIR, { recursive: true });
    const text = await fs.readFile(WARNINGS_FILE, "utf8");
    cache = JSON.parse(text) as WarningsDb;
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") {
      cache = { warnings: [] };
      await persist();
    } else {
      throw err;
    }
  }
  return cache!;
}

async function persist(): Promise<void> {
  if (!cache) return;
  const snapshot = JSON.stringify(cache, null, 2);
  writeLock = writeLock.then(async () => {
    await fs.mkdir(DATA_DIR, { recursive: true });
    await fs.writeFile(WARNINGS_FILE, snapshot, "utf8");
  });
  await writeLock;
}

export async function addWarning(
  record: Omit<WarningRecord, "id" | "timestamp">,
): Promise<WarningRecord> {
  const db = await ensureLoaded();
  const warning: WarningRecord = {
    ...record,
    id: `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
    timestamp: Date.now(),
  };
  db.warnings.push(warning);
  await persist();
  return warning;
}

export async function getWarnings(
  guildId: string,
  userId: string,
): Promise<WarningRecord[]> {
  const db = await ensureLoaded();
  return db.warnings
    .filter((w) => w.guildId === guildId && w.userId === userId)
    .sort((a, b) => b.timestamp - a.timestamp);
}

export async function clearWarnings(
  guildId: string,
  userId: string,
): Promise<number> {
  const db = await ensureLoaded();
  const before = db.warnings.length;
  db.warnings = db.warnings.filter(
    (w) => !(w.guildId === guildId && w.userId === userId),
  );
  const removed = before - db.warnings.length;
  if (removed > 0) await persist();
  return removed;
}

async function ensureAutoRolesLoaded(): Promise<AutoRolesDb> {
  if (autoRolesCache) return autoRolesCache;
  try {
    await fs.mkdir(DATA_DIR, { recursive: true });
    const text = await fs.readFile(AUTO_ROLES_FILE, "utf8");
    autoRolesCache = JSON.parse(text) as AutoRolesDb;
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") {
      autoRolesCache = { roles: {} };
      await persistAutoRoles();
    } else {
      throw err;
    }
  }
  return autoRolesCache!;
}

async function persistAutoRoles(): Promise<void> {
  if (!autoRolesCache) return;
  const snapshot = JSON.stringify(autoRolesCache, null, 2);
  autoRolesWriteLock = autoRolesWriteLock.then(async () => {
    await fs.mkdir(DATA_DIR, { recursive: true });
    await fs.writeFile(AUTO_ROLES_FILE, snapshot, "utf8");
  });
  await autoRolesWriteLock;
}

export async function getAutoRole(guildId: string): Promise<string | null> {
  const db = await ensureAutoRolesLoaded();
  return db.roles[guildId] ?? null;
}

export async function setAutoRole(
  guildId: string,
  roleId: string,
): Promise<void> {
  const db = await ensureAutoRolesLoaded();
  db.roles[guildId] = roleId;
  await persistAutoRoles();
}

export async function clearAutoRole(guildId: string): Promise<boolean> {
  const db = await ensureAutoRolesLoaded();
  if (!(guildId in db.roles)) return false;
  delete db.roles[guildId];
  await persistAutoRoles();
  return true;
}

export async function removeWarning(
  guildId: string,
  warningId: string,
): Promise<boolean> {
  const db = await ensureLoaded();
  const before = db.warnings.length;
  db.warnings = db.warnings.filter(
    (w) => !(w.guildId === guildId && w.id === warningId),
  );
  const removed = before > db.warnings.length;
  if (removed) await persist();
  return removed;
}
