import pg from "pg";
import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(__dirname, "..", "data");
const DB_ENABLED = !!process.env.DATABASE_URL;

let pool: pg.Pool | null = null;

// Holds the in-flight restore promise so loadJson can wait for it
let restoreInProgress: Promise<void> | null = null;

async function getPool(): Promise<pg.Pool> {
  if (pool) return pool;

  const p = new pg.Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
    // No connectionTimeoutMillis — let Neon cold-start finish naturally
    idleTimeoutMillis: 60000,
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

  // Keep Neon warm: ping every 3 minutes so it never suspends
  setInterval(() => {
    p.query("SELECT 1").catch(() => {/* silent — will retry next tick */});
  }, 3 * 60 * 1000).unref();

  return pool;
}

/**
 * Kick off data restore from DB in the background.
 * Call this BEFORE client.login() — but don't await it, so login runs in
 * parallel. loadJson() will wait up to 5 s for this to finish, which is
 * plenty when Neon is warm (< 1 s) and still leaves time for Discord's 3-s
 * window after the first command handler fires.
 */
export function startRestore(): void {
  if (!DB_ENABLED) return;

  restoreInProgress = (async () => {
    try {
      const db = await getPool(); // waits for Neon cold-start if needed
      const result = await db.query<{ key: string; value: string }>(
        "SELECT key, value FROM bot_data",
      );
      if (result.rows.length === 0) {
        console.log("[persist] DB is empty — starting fresh");
        return;
      }
      await fs.mkdir(DATA_DIR, { recursive: true });
      for (const row of result.rows) {
        await fs.writeFile(path.join(DATA_DIR, row.key), row.value, "utf8");
      }
      console.log(`[persist] Restored ${result.rows.length} file(s) from DB`);
    } catch (err) {
      console.error("[persist] DB restore failed:", (err as Error).message);
    } finally {
      restoreInProgress = null;
    }
  })();
}

export async function loadJson<T>(filename: string, fallback: T): Promise<T> {
  const localPath = path.join(DATA_DIR, filename);

  // Wait for the background restore (up to 5 s) before reading
  if (restoreInProgress) {
    try {
      await Promise.race([
        restoreInProgress,
        new Promise<void>((resolve) => setTimeout(resolve, 5000)),
      ]);
    } catch {
      /* restore failed — proceed with whatever is available */
    }
  }

  // Fast path: local file written by restore or a previous save
  try {
    const text = await fs.readFile(localPath, "utf8");
    return JSON.parse(text) as T;
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== "ENOENT") throw err;
  }

  // Fallback: try DB directly (covers edge cases, 2-s cap)
  if (DB_ENABLED) {
    try {
      const row = await Promise.race([
        getPool().then((db) =>
          db
            .query<{ value: string }>(
              "SELECT value FROM bot_data WHERE key = $1",
              [filename],
            )
            .then((r) => r.rows[0] ?? null),
        ),
        new Promise<null>((resolve) => setTimeout(() => resolve(null), 2000)),
      ]);

      if (row) {
        const data = JSON.parse(row.value) as T;
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

  await fs.mkdir(DATA_DIR, { recursive: true });
  await fs.writeFile(localPath, snapshot, "utf8");

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
