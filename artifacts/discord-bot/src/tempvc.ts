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

interface TempVCFile {
  channels: Record<string, TempVCEntry>;
  hubs: Record<string, string>;
}

function load(): TempVCFile {
  if (!existsSync(DATA_PATH)) return { channels: {}, hubs: {} };
  try {
    const raw = JSON.parse(readFileSync(DATA_PATH, "utf-8")) as unknown;
    if (raw && typeof raw === "object" && "channels" in (raw as object)) {
      return raw as TempVCFile;
    }
    return { channels: raw as Record<string, TempVCEntry>, hubs: {} };
  } catch {
    return { channels: {}, hubs: {} };
  }
}

function save(data: TempVCFile): void {
  mkdirSync(dirname(DATA_PATH), { recursive: true });
  writeFileSync(DATA_PATH, JSON.stringify(data, null, 2), "utf-8");
}

export function registerTempVC(channelId: string, guildId: string, ownerId: string): void {
  const data = load();
  data.channels[channelId] = { ownerId, guildId, locked: false };
  save(data);
}

export function unregisterTempVC(channelId: string): void {
  const data = load();
  delete data.channels[channelId];
  save(data);
}

export function isTempVC(channelId: string): boolean {
  return !!load().channels[channelId];
}

export function getTempVCEntry(channelId: string): TempVCEntry | null {
  return load().channels[channelId] ?? null;
}

export function setTempVCLocked(channelId: string, locked: boolean): void {
  const data = load();
  if (data.channels[channelId]) {
    data.channels[channelId]!.locked = locked;
    save(data);
  }
}

export function getOwnerTempVC(guildId: string, ownerId: string): string | null {
  const data = load();
  for (const [channelId, entry] of Object.entries(data.channels)) {
    if (entry.guildId === guildId && entry.ownerId === ownerId) return channelId;
  }
  return null;
}

export function setHub(guildId: string, channelId: string): void {
  const data = load();
  data.hubs[guildId] = channelId;
  save(data);
}

export function removeHub(guildId: string): void {
  const data = load();
  delete data.hubs[guildId];
  save(data);
}

export function getHub(guildId: string): string | null {
  return load().hubs[guildId] ?? null;
}

export function isHubChannel(guildId: string, channelId: string): boolean {
  return load().hubs[guildId] === channelId;
}

export async function cleanupTempVC(guild: Guild, channelId: string): Promise<void> {
  if (!isTempVC(channelId)) return;

  // Use fetch instead of cache.get so it works after bot restarts
  const channel = await guild.channels.fetch(channelId).catch(() => null) as VoiceChannel | null;
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

export async function cleanupAllOrphanedTempVCs(guild: Guild): Promise<void> {
  const data = load();
  const entries = Object.entries(data.channels).filter(([, e]) => e.guildId === guild.id);
  await Promise.all(
    entries.map(async ([channelId]) => {
      const channel = await guild.channels.fetch(channelId).catch(() => null) as VoiceChannel | null;
      if (!channel) {
        unregisterTempVC(channelId);
        return;
      }
      const humans = channel.members.filter((m) => !m.user.bot).size;
      if (humans === 0) {
        unregisterTempVC(channelId);
        await channel.delete("Salon vocal temporaire vide (nettoyage démarrage)").catch(() => null);
      }
    }),
  );
}
