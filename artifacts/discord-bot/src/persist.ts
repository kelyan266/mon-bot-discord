import { Client } from "@replit/object-storage";
import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(__dirname, "..", "data");
const STORAGE_ENABLED = !!process.env.DEFAULT_OBJECT_STORAGE_BUCKET_ID;

let client: Client | null = null;
function getClient(): Client {
  if (!client) client = new Client();
  return client;
}

export async function loadJson<T>(filename: string, fallback: T): Promise<T> {
  const localPath = path.join(DATA_DIR, filename);

  try {
    const text = await fs.readFile(localPath, "utf8");
    const data = JSON.parse(text) as T;
    if (STORAGE_ENABLED) {
      void getClient()
        .uploadFromText(`bot-data/${filename}`, text)
        .catch((err) => console.error(`[persist] Initial sync failed for ${filename}:`, err));
    }
    return data;
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== "ENOENT") throw err;
  }

  if (STORAGE_ENABLED) {
    try {
      const result = await getClient().downloadAsText(`bot-data/${filename}`);
      if (result.ok && result.value) {
        const data = JSON.parse(result.value) as T;
        await fs.mkdir(DATA_DIR, { recursive: true });
        await fs.writeFile(localPath, result.value, "utf8");
        console.log(`[persist] Restored ${filename} from Object Storage`);
        return data;
      }
    } catch (err) {
      console.error(`[persist] Object Storage load failed for ${filename}:`, err);
    }
  }

  return fallback;
}

export async function saveJson<T>(filename: string, data: T): Promise<void> {
  const localPath = path.join(DATA_DIR, filename);
  const snapshot = JSON.stringify(data, null, 2);

  await fs.mkdir(DATA_DIR, { recursive: true });
  await fs.writeFile(localPath, snapshot, "utf8");

  if (STORAGE_ENABLED) {
    void getClient()
      .uploadFromText(`bot-data/${filename}`, snapshot)
      .then((r) => {
        if (!r.ok) console.error(`[persist] Object Storage upload failed for ${filename}:`, r.error);
      })
      .catch((err) => console.error(`[persist] Object Storage upload error for ${filename}:`, err));
  }
}
