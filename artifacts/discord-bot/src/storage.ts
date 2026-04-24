import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(__dirname, "..", "data");
const WARNINGS_FILE = path.join(DATA_DIR, "warnings.json");

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

let cache: WarningsDb | null = null;
let writeLock: Promise<void> = Promise.resolve();

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
