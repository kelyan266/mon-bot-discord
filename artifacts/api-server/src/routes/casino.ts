import { Router } from "express";
import { readFileSync, writeFileSync, mkdirSync } from "fs";
import { join } from "path";
import { fileURLToPath } from "url";

const DATA_DIR = join(fileURLToPath(new URL("../../discord-bot/data", import.meta.url)));

function ensureDir() {
  mkdirSync(DATA_DIR, { recursive: true });
}

function readJson<T>(file: string, fallback: T): T {
  try {
    return JSON.parse(readFileSync(join(DATA_DIR, file), "utf-8")) as T;
  } catch {
    return fallback;
  }
}

function writeJson(file: string, data: unknown) {
  ensureDir();
  writeFileSync(join(DATA_DIR, file), JSON.stringify(data, null, 2), "utf-8");
}

// ── Types ─────────────────────────────────────────────────────────────────────

interface UserEconomy {
  balance: number;
  lastDaily?: number;
  streak?: number;
}
interface EconomyDb {
  guilds: Record<string, Record<string, UserEconomy>>;
}
interface CasinoConfigDb {
  [guildId: string]: Partial<GuildConfig>;
}
interface GuildConfig {
  startingBalance: number;
  dailyAmount: number;
  dailyCooldownHours: number;
  dailyStreakBonus: boolean;
  minBet: number;
  maxBet: number;
  currency: string;
  casinoChannelId: string | null;
  bjNaturalPayout: number;
  slotsJackpotMultiplier: number;
}

const DEFAULT_CONFIG: GuildConfig = {
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

function getCfg(guildId: string): GuildConfig {
  const db = readJson<CasinoConfigDb>("casinoConfig.json", {});
  return { ...DEFAULT_CONFIG, ...(db[guildId] ?? {}) } as GuildConfig;
}

function getUser(guildId: string, userId: string): { db: EconomyDb; user: UserEconomy } {
  const db = readJson<EconomyDb>("economy.json", { guilds: {} });
  db.guilds[guildId] ??= {};
  const cfg = getCfg(guildId);
  db.guilds[guildId][userId] ??= { balance: cfg.startingBalance };
  return { db, user: db.guilds[guildId][userId] };
}

function saveEconomy(db: EconomyDb) {
  writeJson("economy.json", db);
}

// ── Slots ─────────────────────────────────────────────────────────────────────

const SLOT_SYMBOLS = ["🍒", "🍋", "🍇", "🍉", "🍊", "💎", "7️⃣"] as const;
const SLOT_WEIGHTS = [30, 25, 20, 12, 8, 3, 2];

function spinReel(): string {
  const total = SLOT_WEIGHTS.reduce((a, b) => a + b, 0);
  let rand = Math.random() * total;
  for (let i = 0; i < SLOT_SYMBOLS.length; i++) {
    rand -= SLOT_WEIGHTS[i]!;
    if (rand <= 0) return SLOT_SYMBOLS[i]!;
  }
  return SLOT_SYMBOLS[0]!;
}

function getSlotMultipliers(jackpotMult: number): Record<string, number> {
  return {
    "7️⃣": jackpotMult,
    "💎": Math.max(3, Math.round(jackpotMult * 0.5)),
    "🍉": Math.max(2, Math.round(jackpotMult * 0.25)),
    "🍊": Math.max(2, Math.round(jackpotMult * 0.2)),
    "🍇": 3,
    "🍋": 2.5,
    "🍒": 2,
  };
}

// ── Roulette ──────────────────────────────────────────────────────────────────

const RED_NUMBERS = new Set([1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36]);

function resolveRoulette(number: number, choice: string): { won: boolean; multiplier: number; label: string } {
  const isRed = RED_NUMBERS.has(number);
  const isEven = number !== 0 && number % 2 === 0;
  switch (choice) {
    case "rouge": return { won: isRed, multiplier: 2, label: "Rouge 🔴" };
    case "noir": return { won: number !== 0 && !isRed, multiplier: 2, label: "Noir ⚫" };
    case "pair": return { won: isEven, multiplier: 2, label: "Pair" };
    case "impair": return { won: number !== 0 && !isEven, multiplier: 2, label: "Impair" };
    case "1-12": return { won: number >= 1 && number <= 12, multiplier: 3, label: "1–12" };
    case "13-24": return { won: number >= 13 && number <= 24, multiplier: 3, label: "13–24" };
    case "25-36": return { won: number >= 25 && number <= 36, multiplier: 3, label: "25–36" };
    default: {
      const t = parseInt(choice, 10);
      if (!isNaN(t) && t >= 0 && t <= 36)
        return { won: number === t, multiplier: 36, label: `Numéro ${t}` };
      return { won: false, multiplier: 0, label: "Invalide" };
    }
  }
}

// ── Blackjack ─────────────────────────────────────────────────────────────────

type Card = { suit: string; rank: string };
interface BjSession {
  guildId: string;
  userId: string;
  bet: number;
  deck: Card[];
  playerHand: Card[];
  dealerHand: Card[];
  doubled: boolean;
  expiresAt: number;
  bjPayoutMult: number;
}

const bjSessions = new Map<string, BjSession>();

const SUITS = ["♠", "♥", "♦", "♣"];
const RANKS = ["A", "2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K"];

function buildDeck(): Card[] {
  const deck: Card[] = [];
  for (const suit of SUITS) for (const rank of RANKS) deck.push({ suit, rank });
  for (let i = deck.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [deck[i], deck[j]] = [deck[j]!, deck[i]!];
  }
  return deck;
}

function cardValue(rank: string): number {
  if (rank === "A") return 11;
  if (["J", "Q", "K"].includes(rank)) return 10;
  return parseInt(rank, 10);
}

function handValue(hand: Card[]): number {
  let total = hand.reduce((s, c) => s + cardValue(c.rank), 0);
  let aces = hand.filter((c) => c.rank === "A").length;
  while (total > 21 && aces > 0) { total -= 10; aces--; }
  return total;
}

function serializeHand(hand: Card[]) {
  return hand.map((c) => ({ rank: c.rank, suit: c.suit }));
}

// ── Router ────────────────────────────────────────────────────────────────────

const router = Router();

router.get("/bot/casino/config", (req, res) => {
  const guildId = req.query["guildId"] as string;
  if (!guildId) { res.status(400).json({ error: "guildId required" }); return; }
  const cfg = getCfg(guildId);
  res.json({
    currency: cfg.currency,
    minBet: cfg.minBet,
    maxBet: cfg.maxBet,
    startingBalance: cfg.startingBalance,
    dailyAmount: cfg.dailyAmount,
    slotsJackpotMultiplier: cfg.slotsJackpotMultiplier,
  });
});

router.get("/bot/casino/balance", (req, res) => {
  const guildId = req.query["guildId"] as string;
  const userId = req.query["userId"] as string;
  if (!guildId || !userId) { res.status(400).json({ error: "guildId and userId required" }); return; }
  const { user } = getUser(guildId, userId);
  const cfg = getCfg(guildId);
  const cooldownMs = cfg.dailyCooldownHours * 3600000;
  const canDaily = !user.lastDaily || Date.now() - user.lastDaily >= cooldownMs;
  const nextDailyMs = canDaily ? 0 : cooldownMs - (Date.now() - (user.lastDaily ?? 0));
  res.json({ balance: user.balance, streak: user.streak ?? 0, canDaily, nextDailyMs });
});

router.post("/bot/casino/daily", (req, res) => {
  const { guildId, userId } = req.body as { guildId: string; userId: string };
  if (!guildId || !userId) { res.status(400).json({ error: "guildId and userId required" }); return; }
  const cfg = getCfg(guildId);
  const { db, user } = getUser(guildId, userId);
  const now = Date.now();
  const cooldownMs = cfg.dailyCooldownHours * 3600000;
  if (user.lastDaily && now - user.lastDaily < cooldownMs) {
    res.status(400).json({ error: "cooldown", remainingMs: cooldownMs - (now - user.lastDaily) });
    return;
  }
  let streak = user.streak ?? 0;
  if (cfg.dailyStreakBonus) {
    const grace = cooldownMs + 2 * 3600000;
    streak = (user.lastDaily && now - user.lastDaily <= grace) ? Math.min(streak + 1, 30) : 0;
    user.streak = streak;
  }
  const bonus = cfg.dailyStreakBonus ? Math.floor(cfg.dailyAmount * Math.min(streak, 7) * 0.1) : 0;
  const earned = cfg.dailyAmount + bonus;
  user.balance += earned;
  user.lastDaily = now;
  saveEconomy(db);
  res.json({ balance: user.balance, earned, streak, bonusAmount: bonus });
});

router.post("/bot/casino/slots", (req, res) => {
  const { guildId, userId, bet } = req.body as { guildId: string; userId: string; bet: number };
  if (!guildId || !userId || !bet) { res.status(400).json({ error: "guildId, userId, bet required" }); return; }
  const cfg = getCfg(guildId);
  const { db, user } = getUser(guildId, userId);
  if (bet < cfg.minBet) { res.status(400).json({ error: `Mise min: ${cfg.minBet}` }); return; }
  if (cfg.maxBet > 0 && bet > cfg.maxBet) { res.status(400).json({ error: `Mise max: ${cfg.maxBet}` }); return; }
  if (user.balance < bet) { res.status(400).json({ error: "Solde insuffisant" }); return; }

  user.balance -= bet;
  const reels = [spinReel(), spinReel(), spinReel()];
  const mults = getSlotMultipliers(cfg.slotsJackpotMultiplier);
  let multiplier = 0;
  let resultType: "jackpot" | "double" | "loss";
  if (reels[0] === reels[1] && reels[1] === reels[2]) {
    multiplier = mults[reels[0]!] ?? 2;
    resultType = "jackpot";
  } else if (reels[0] === reels[1] || reels[1] === reels[2] || reels[0] === reels[2]) {
    multiplier = 1.5;
    resultType = "double";
  } else {
    resultType = "loss";
  }
  const winnings = Math.floor(bet * multiplier);
  if (winnings > 0) user.balance += winnings;
  saveEconomy(db);
  res.json({ reels, multiplier, winnings, net: winnings - bet, balance: user.balance, resultType });
});

router.post("/bot/casino/roulette", (req, res) => {
  const { guildId, userId, bet, choice } = req.body as {
    guildId: string; userId: string; bet: number; choice: string;
  };
  if (!guildId || !userId || !bet || !choice) { res.status(400).json({ error: "Missing fields" }); return; }
  const cfg = getCfg(guildId);
  const { db, user } = getUser(guildId, userId);
  if (bet < cfg.minBet) { res.status(400).json({ error: `Mise min: ${cfg.minBet}` }); return; }
  if (cfg.maxBet > 0 && bet > cfg.maxBet) { res.status(400).json({ error: `Mise max: ${cfg.maxBet}` }); return; }
  if (user.balance < bet) { res.status(400).json({ error: "Solde insuffisant" }); return; }

  user.balance -= bet;
  const roll = Math.floor(Math.random() * 37);
  const { won, multiplier, label } = resolveRoulette(roll, choice.toLowerCase().trim());
  const winnings = won ? Math.floor(bet * multiplier) : 0;
  if (won) user.balance += winnings;
  const isRed = RED_NUMBERS.has(roll);
  saveEconomy(db);
  res.json({
    roll,
    color: roll === 0 ? "green" : isRed ? "red" : "black",
    won, multiplier, label, winnings,
    net: winnings - bet,
    balance: user.balance,
  });
});

router.post("/bot/casino/blackjack/start", (req, res) => {
  const { guildId, userId, bet } = req.body as { guildId: string; userId: string; bet: number };
  if (!guildId || !userId || !bet) { res.status(400).json({ error: "Missing fields" }); return; }
  if (bjSessions.has(userId)) { res.status(400).json({ error: "Partie déjà en cours" }); return; }
  const cfg = getCfg(guildId);
  const { db, user } = getUser(guildId, userId);
  if (bet < cfg.minBet) { res.status(400).json({ error: `Mise min: ${cfg.minBet}` }); return; }
  if (cfg.maxBet > 0 && bet > cfg.maxBet) { res.status(400).json({ error: `Mise max: ${cfg.maxBet}` }); return; }
  if (user.balance < bet) { res.status(400).json({ error: "Solde insuffisant" }); return; }

  user.balance -= bet;
  saveEconomy(db);

  const deck = buildDeck();
  const pop = () => deck.pop()!;
  const playerHand = [pop(), pop()];
  const dealerHand = [pop(), pop()];
  const session: BjSession = {
    guildId, userId, bet, deck, playerHand, dealerHand,
    doubled: false,
    expiresAt: Date.now() + 10 * 60 * 1000,
    bjPayoutMult: cfg.bjNaturalPayout / 100,
  };
  bjSessions.set(userId, session);
  setTimeout(() => bjSessions.delete(userId), 10 * 60 * 1000);

  const pv = handValue(playerHand);
  if (pv === 21) {
    bjSessions.delete(userId);
    const payout = Math.floor(bet * session.bjPayoutMult);
    const { db: db2, user: u2 } = getUser(guildId, userId);
    u2.balance += payout;
    saveEconomy(db2);
    res.json({
      status: "blackjack",
      playerHand: serializeHand(playerHand),
      dealerHand: serializeHand(dealerHand),
      playerValue: pv, dealerValue: handValue(dealerHand),
      bet, payout, balance: u2.balance, canDouble: false,
    });
    return;
  }

  const canDouble = user.balance >= bet;
  res.json({
    status: "playing",
    playerHand: serializeHand(playerHand),
    dealerHand: [serializeHand(dealerHand)[0], { rank: "?", suit: "" }],
    playerValue: pv, dealerValue: cardValue(dealerHand[0]!.rank),
    bet, payout: 0, balance: user.balance, canDouble,
  });
});

router.post("/bot/casino/blackjack/action", (req, res) => {
  const { userId, action } = req.body as { userId: string; action: "hit" | "stand" | "double" };
  if (!userId || !action) { res.status(400).json({ error: "Missing fields" }); return; }
  const session = bjSessions.get(userId);
  if (!session) { res.status(404).json({ error: "Aucune partie en cours" }); return; }

  const cfg = getCfg(session.guildId);

  if (action === "hit") {
    session.playerHand.push(session.deck.pop()!);
    const pv = handValue(session.playerHand);
    if (pv > 21) {
      bjSessions.delete(userId);
      const { db, user } = getUser(session.guildId, userId);
      res.json({
        status: "bust", playerHand: serializeHand(session.playerHand),
        dealerHand: serializeHand(session.dealerHand),
        playerValue: pv, dealerValue: handValue(session.dealerHand),
        bet: session.bet, payout: 0, balance: user.balance, canDouble: false,
      });
      return;
    }
    const canDouble = !session.doubled && getUser(session.guildId, userId).user.balance >= session.bet;
    res.json({
      status: "playing", playerHand: serializeHand(session.playerHand),
      dealerHand: [serializeHand(session.dealerHand)[0], { rank: "?", suit: "" }],
      playerValue: pv, dealerValue: cardValue(session.dealerHand[0]!.rank),
      bet: session.bet, payout: 0, balance: getUser(session.guildId, userId).user.balance, canDouble,
    });
    return;
  }

  if (action === "double") {
    const { db, user } = getUser(session.guildId, userId);
    if (user.balance < session.bet) { res.status(400).json({ error: "Solde insuffisant pour doubler" }); return; }
    user.balance -= session.bet;
    session.bet *= 2;
    session.doubled = true;
    saveEconomy(db);
    session.playerHand.push(session.deck.pop()!);
  }

  while (handValue(session.dealerHand) < 17) session.dealerHand.push(session.deck.pop()!);
  const pv = handValue(session.playerHand);
  const dv = handValue(session.dealerHand);
  let status: "win" | "lose" | "push" | "bust";
  if (pv > 21) status = "bust";
  else if (dv > 21 || pv > dv) status = "win";
  else if (pv < dv) status = "lose";
  else status = "push";

  bjSessions.delete(userId);
  const { db: db2, user: u2 } = getUser(session.guildId, userId);
  let payout = 0;
  if (status === "win") payout = Math.floor(session.bet * 2);
  else if (status === "push") payout = session.bet;
  if (payout > 0) u2.balance += payout;
  saveEconomy(db2);

  res.json({
    status, playerHand: serializeHand(session.playerHand),
    dealerHand: serializeHand(session.dealerHand),
    playerValue: pv, dealerValue: dv,
    bet: session.bet, payout, balance: u2.balance, canDouble: false,
  });
});

export default router;
