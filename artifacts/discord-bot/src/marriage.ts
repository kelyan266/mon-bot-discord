import { readFileSync, writeFileSync, existsSync, mkdirSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_PATH = join(__dirname, "../data/marriage.json");

type GuildMarriages = Record<string, string>;
type MarriageData = Record<string, GuildMarriages>;

function load(): MarriageData {
  if (!existsSync(DATA_PATH)) return {};
  try {
    return JSON.parse(readFileSync(DATA_PATH, "utf-8")) as MarriageData;
  } catch {
    return {};
  }
}

function save(data: MarriageData): void {
  mkdirSync(dirname(DATA_PATH), { recursive: true });
  writeFileSync(DATA_PATH, JSON.stringify(data, null, 2), "utf-8");
}

export function getPartner(guildId: string, userId: string): string | null {
  const data = load();
  return data[guildId]?.[userId] ?? null;
}

export function marry(guildId: string, userId1: string, userId2: string): void {
  const data = load();
  if (!data[guildId]) data[guildId] = {};
  data[guildId][userId1] = userId2;
  data[guildId][userId2] = userId1;
  save(data);
}

export function divorce(guildId: string, userId: string): string | null {
  const data = load();
  const partner = data[guildId]?.[userId];
  if (!partner) return null;
  delete data[guildId]![userId];
  delete data[guildId]![partner];
  save(data);
  return partner;
}

export function isMarried(guildId: string, userId: string): boolean {
  return getPartner(guildId, userId) !== null;
}

export const MARRY_ACCEPT_PREFIX = "marry_accept_";
export const MARRY_DECLINE_PREFIX = "marry_decline_";
