import { loadJson, saveJson } from "./persist.js";

export interface GuildCasinoConfig {
  startingBalance: number;
  dailyAmount: number;
  dailyCooldownHours: number;
  dailyStreakBonus: boolean;
  minBet: number;
  maxBet: number;
  currency: string;
  casinoChannelId: string | null;
  bjNaturalPayout: 150 | 250;
  slotsJackpotMultiplier: number;
}

export const DEFAULT_CONFIG: GuildCasinoConfig = {
  startingBalance: 500,
  dailyAmount: 200,
  dailyCooldownHours: 24,
  dailyStreakBonus: false,
  minBet: 10,
  maxBet: 0,
  currency: "🪙",
  casinoChannelId: null,
  bjNaturalPayout: 250,
  slotsJackpotMultiplier: 20,
};

type ConfigDb = Record<string, Partial<GuildCasinoConfig>>;

let cache: ConfigDb | null = null;

async function ensureLoaded(): Promise<ConfigDb> {
  if (cache) return cache;
  cache = await loadJson<ConfigDb>("casinoConfig.json", {});
  return cache;
}

async function persist(): Promise<void> {
  if (!cache) return;
  await saveJson("casinoConfig.json", cache);
}

export async function getCasinoConfig(guildId: string): Promise<GuildCasinoConfig> {
  const db = await ensureLoaded();
  return { ...DEFAULT_CONFIG, ...(db[guildId] ?? {}) } as GuildCasinoConfig;
}

export async function setCasinoConfigField<K extends keyof GuildCasinoConfig>(
  guildId: string,
  key: K,
  value: GuildCasinoConfig[K],
): Promise<GuildCasinoConfig> {
  const db = await ensureLoaded();
  db[guildId] ??= {};
  (db[guildId] as Record<string, unknown>)[key] = value;
  await persist();
  return getCasinoConfig(guildId);
}

export async function resetCasinoConfig(guildId: string): Promise<void> {
  const db = await ensureLoaded();
  delete db[guildId];
  await persist();
}

export const CONFIG_KEYS = [
  "startingBalance",
  "dailyAmount",
  "dailyCooldownHours",
  "dailyStreakBonus",
  "minBet",
  "maxBet",
  "currency",
  "casinoChannelId",
  "bjNaturalPayout",
  "slotsJackpotMultiplier",
] as const satisfies ReadonlyArray<keyof GuildCasinoConfig>;

export type ConfigKey = (typeof CONFIG_KEYS)[number];

export const CONFIG_META: Record<
  ConfigKey,
  { label: string; description: string; type: "integer" | "boolean" | "string"; min?: number; max?: number }
> = {
  startingBalance: {
    label: "💰 Solde de départ",
    description: "Pièces données aux nouveaux joueurs",
    type: "integer",
    min: 0,
    max: 1_000_000,
  },
  dailyAmount: {
    label: "🎁 Récompense quotidienne",
    description: "Pièces gagnées avec /daily",
    type: "integer",
    min: 0,
    max: 1_000_000,
  },
  dailyCooldownHours: {
    label: "⏳ Cooldown /daily (heures)",
    description: "Délai entre deux /daily",
    type: "integer",
    min: 1,
    max: 168,
  },
  dailyStreakBonus: {
    label: "🔥 Bonus de streak daily",
    description: "Bonus croissant pour les claims consécutifs (true/false)",
    type: "boolean",
  },
  minBet: {
    label: "⬇️ Mise minimale",
    description: "Mise minimum pour tous les jeux",
    type: "integer",
    min: 1,
    max: 1_000_000,
  },
  maxBet: {
    label: "⬆️ Mise maximale",
    description: "Mise maximum (0 = illimité)",
    type: "integer",
    min: 0,
    max: 10_000_000,
  },
  currency: {
    label: "💱 Devise",
    description: "Emoji utilisé pour la monnaie (ex: 🪙, 💎, 💵)",
    type: "string",
  },
  casinoChannelId: {
    label: "📺 Salon casino",
    description: "ID du salon réservé au casino (none = tous les salons)",
    type: "string",
  },
  bjNaturalPayout: {
    label: "♠ Payout Blackjack naturel",
    description: "150 = ×1.5 (standard Vegas) | 250 = ×2.5 (généreux)",
    type: "integer",
    min: 150,
    max: 250,
  },
  slotsJackpotMultiplier: {
    label: "🎰 Multiplicateur jackpot 7️⃣",
    description: "Multiplicateur pour le jackpot triple 7",
    type: "integer",
    min: 5,
    max: 100,
  },
};
