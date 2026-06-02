import pg from "pg";
import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(__dirname, "..", "data");
const DB_ENABLED = !!process.env.DATABASE_URL;

// 2-second cap on DB reads inside command handlers (Discord timeout is 3s)
const LOAD_TIMEOUT_MS = 2000;

let pool: pg.Pool | null = null;

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    promise,
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error(`DB timeout after ${ms}ms`)), ms),
    ),
  ]);
}

async function getPool(): Promise<pg.Pool> {
  if (pool) return pool;

  // Create a new pool. We keep it null until the init query succeeds
  // so failed attempts are retried on the next call (Neon cold-start recovery).
  const p = new pg.Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
    connectionTimeoutMillis: 15000, // give Neon enough time to wake from suspension
    idleTimeoutMillis: 30000,
    max: 3,
  });

  await p.query(`
    CREATE TABLE IF NOT EXISTS bot_data (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);

  pool = p;
  return pool;
}

// Kick off DB init at startup — if it fails, pool stays null and retries on next use
if (DB_ENABLED) {
  getPool().catch((err: unknown) =>
    console.error("[persist] DB init failed:", (err as Error).message),
  );
}

export async function loadJson<T>(filename: string, fallback: T): Promise<T> {
  const localPath = path.join(DATA_DIR, filename);

  // 1. Local file is fastest — use it if available
  try {
    const text = await fs.readFile(localPath, "utf8");
    return JSON.parse(text) as T;
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== "ENOENT") throw err;
  }

  // 2. No local file — try DB with a short timeout so commands never hang
  if (DB_ENABLED) {
    try {
      const row = await withTimeout(
        getPool().then((db) =>
          db
            .query<{ value: string }>(
              "SELECT value FROM bot_data WHERE key = $1",
              [filename],
            )
            .then((r) => r.rows[0] ?? null),
        ),
        LOAD_TIMEOUT_MS,
      );

      if (row) {
        const data = JSON.parse(row.value) as T;
        // Restore local file so subsequent reads skip the DB entirely
        await fs.mkdir(DATA_DIR, { recursive: true });
        await fs.writeFile(localPath, row.value, "utf8");
        console.log(`[persist] Restored ${filename} from DB`);
        return data;
      }
    } catch (err) {
      console.error(
        `[persist] DB load failed for ${filename}:`,
        (err as Error).message,
      );
    }
  }

  return fallback;
}

export async function saveJson<T>(filename: string, data: T): Promise<void> {
  const localPath = path.join(DATA_DIR, filename);
  const snapshot = JSON.stringify(data, null, 2);

  // Local write is synchronous from the caller's perspective
  await fs.mkdir(DATA_DIR, { recursive: true });
  await fs.writeFile(localPath, snapshot, "utf8");

  // DB write is fire-and-forget — never blocks the caller
  if (DB_ENABLED) {
    void (async () => {
      try {
        const db = await getPool();
        await db.query(
          `INSERT INTO bot_data (key, value, updated_at)
           VALUES ($1, $2, NOW())
           ON CONFLICT (key) DO UPDATE
             SET value = EXCLUDED.value, updated_at = NOW()`,
          [filename, snapshot],
        );
      } catch (err) {
        console.error(
          `[persist] DB save failed for ${filename}:`,
          (err as Error).message,
        );
      }
    })();
  }
}
