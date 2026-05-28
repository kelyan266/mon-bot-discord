import { readFileSync, writeFileSync, existsSync, mkdirSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import type { Guild, VoiceChannel } from "discord.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_PATH = join(__dirname, "../data/tempvc.json");

interface TempVCEntry {
  ownerId: string;
  guildId: string;
  locked: boolean;
}

type TempVCData = Record<string, TempVCEntry>;

function load(): TempVCData {
  if (!existsSync(DATA_PATH)) return {};
  try {
    return JSON.parse(readFileSync(DATA_PATH, "utf-8")) as TempVCData;
  } catch {
    return {};
  }
}

function save(data: TempVCData): void {
  mkdirSync(dirname(DATA_PATH), { recursive: true });
  writeFileSync(DATA_PATH, JSON.stringify(data, null, 2), "utf-8");
}

export function registerTempVC(channelId: string, guildId: string, ownerId: string): void {
  const data = load();
  data[channelId] = { ownerId, guildId, locked: false };
  save(data);
}

export function unregisterTempVC(channelId: string): void {
  const data = load();
  delete data[channelId];
  save(data);
}

export function isTempVC(channelId: string): boolean {
  return !!load()[channelId];
}

export function getTempVCEntry(channelId: string): TempVCEntry | null {
  return load()[channelId] ?? null;
}

export function setTempVCLocked(channelId: string, locked: boolean): void {
  const data = load();
  if (data[channelId]) {
    data[channelId]!.locked = locked;
    save(data);
  }
}

export function getOwnerTempVC(guildId: string, ownerId: string): string | null {
  const data = load();
  for (const [channelId, entry] of Object.entries(data)) {
    if (entry.guildId === guildId && entry.ownerId === ownerId) return channelId;
  }
  return null;
}

export async function cleanupTempVC(guild: Guild, channelId: string): Promise<void> {
  if (!isTempVC(channelId)) return;
  const channel = guild.channels.cache.get(channelId) as VoiceChannel | undefined;
  if (!channel) {
    unregisterTempVC(channelId);
    return;
  }
  const humans = channel.members.filter((m) => !m.user.bot).size;
  if (humans === 0) {
    unregisterTempVC(channelId);
    await channel.delete("Salon vocal temporaire vide").catch(() => null);
  }
}
