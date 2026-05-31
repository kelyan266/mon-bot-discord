import pg from "pg";
import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(__dirname, "..", "data");
const DB_ENABLED = !!process.env.DATABASE_URL;

let pool: pg.Pool | null = null;
let dbReady = false;

async function getPool(): Promise<pg.Pool> {
  if (!pool) {
    pool = new pg.Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: { rejectUnauthorized: false },
    });
    await pool.query(`
      CREATE TABLE IF NOT EXISTS bot_data (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL,
        updated_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);
    dbReady = true;
  }
  return pool;
}

// Best-effort DB init at startup — errors are non-fatal
if (DB_ENABLED) {
  getPool().catch((err: unknown) =>
    console.error("[persist] DB init failed:", (err as Error).message),
  );
}

export async function loadJson<T>(filename: string, fallback: T): Promise<T> {
  const localPath = path.join(DATA_DIR, filename);

  // 1. Try local file first (fast path)
  try {
    const text = await fs.readFile(localPath, "utf8");
    return JSON.parse(text) as T;
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== "ENOENT") throw err;
  }

  // 2. No local file — try DB
  if (DB_ENABLED) {
    try {
      const db = await getPool();
      const result = await db.query<{ value: string }>(
        "SELECT value FROM bot_data WHERE key = $1",
        [filename],
      );
      if (result.rows.length > 0) {
        const data = JSON.parse(result.rows[0].value) as T;
        // Restore local file for fast reads next time
        await fs.mkdir(DATA_DIR, { recursive: true });
        await fs.writeFile(localPath, result.rows[0].value, "utf8");
        console.log(`[persist] Restored ${filename} from DB`);
        return data;
      }
    } catch (err) {
      console.error(`[persist] DB load failed for ${filename}:`, (err as Error).message);
    }
  }

  return fallback;
}

export async function saveJson<T>(filename: string, data: T): Promise<void> {
  const localPath = path.join(DATA_DIR, filename);
  const snapshot = JSON.stringify(data, null, 2);

  // Always write locally (fast, in-memory filesystem)
  await fs.mkdir(DATA_DIR, { recursive: true });
  await fs.writeFile(localPath, snapshot, "utf8");

  // Persist to DB asynchronously (non-blocking)
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
        console.error(`[persist] DB save failed for ${filename}:`, (err as Error).message);
      }
    })();
  }
}
