import { loadJson, saveJson } from "./persist.js";

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
let autoRolesCache: AutoRolesDb | null = null;

async function ensureLoaded(): Promise<WarningsDb> {
  if (cache) return cache;
  cache = await loadJson<WarningsDb>("warnings.json", { warnings: [] });
  return cache;
}

async function persist(): Promise<void> {
  if (!cache) return;
  await saveJson("warnings.json", cache);
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
  autoRolesCache = await loadJson<AutoRolesDb>("autoRoles.json", { roles: {} });
  return autoRolesCache;
}

async function persistAutoRoles(): Promise<void> {
  if (!autoRolesCache) return;
  await saveJson("autoRoles.json", autoRolesCache);
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
