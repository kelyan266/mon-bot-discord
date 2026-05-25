import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonInteraction,
  ButtonStyle,
  ChatInputCommandInteraction,
  EmbedBuilder,
  PermissionFlagsBits,
  TextChannel,
} from "discord.js";
import {
  addBalance,
  canAfford,
  claimDaily,
  getBalance,
  getEconomyLeaderboard,
  resetBalance,
  setBalance,
} from "./economy.js";
import {
  getCasinoConfig,
  setCasinoConfigField,
  resetCasinoConfig,
  DEFAULT_CONFIG,
  CONFIG_META,
  type ConfigKey,
  type GuildCasinoConfig,
} from "./casinoConfig.js";

const COLOR_PRIMARY = 0x5865f2;
const COLOR_SUCCESS = 0x57f287;
const COLOR_WARN = 0xfee75c;
const COLOR_DANGER = 0xed4245;
const COLOR_GOLD = 0xf1c40f;

// ──────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────

function fmt(n: number, currency: string) {
  return `**${n.toLocaleString("fr")}** ${currency}`;
}

async function checkCasinoChannel(
  interaction: ChatInputCommandInteraction,
  cfg: GuildCasinoConfig,
): Promise<boolean> {
  if (!cfg.casinoChannelId) return true;
  if (interaction.channelId === cfg.casinoChannelId) return true;
  await interaction.reply({
    embeds: [
      new EmbedBuilder()
        .setColor(COLOR_WARN)
        .setDescription(`🎰 Le casino est réservé à <#${cfg.casinoChannelId}>.`),
    ],
    ephemeral: true,
  });
  return false;
}

async function checkBet(
  interaction: ChatInputCommandInteraction | ButtonInteraction,
  guildId: string,
  userId: string,
  bet: number,
  cfg: GuildCasinoConfig,
): Promise<boolean> {
  const { currency, minBet, maxBet } = cfg;
  if (bet < minBet) {
    await interaction.reply({
      embeds: [
        new EmbedBuilder()
          .setColor(COLOR_DANGER)
          .setDescription(`❌ Mise minimale : ${fmt(minBet, currency)}`),
      ],
      ephemeral: true,
    });
    return false;
  }
  if (maxBet > 0 && bet > maxBet) {
    await interaction.reply({
      embeds: [
        new EmbedBuilder()
          .setColor(COLOR_DANGER)
          .setDescription(`❌ Mise maximale : ${fmt(maxBet, currency)}`),
      ],
      ephemeral: true,
    });
    return false;
  }
  const ok = await canAfford(guildId, userId, bet);
  if (!ok) {
    const bal = await getBalance(guildId, userId);
    await interaction.reply({
      embeds: [
        new EmbedBuilder()
          .setColor(COLOR_DANGER)
          .setTitle("💸 Fonds insuffisants")
          .setDescription(
            `Tu as ${fmt(bal, currency)} mais tu veux miser ${fmt(bet, currency)}.`,
          ),
      ],
      ephemeral: true,
    });
    return false;
  }
  return true;
}

// ──────────────────────────────────────────────
// SLOTS
// ──────────────────────────────────────────────

const SLOT_SYMBOLS = ["🍒", "🍋", "🍇", "🍉", "🍊", "💎", "7️⃣"] as const;
const SLOT_WEIGHTS = [30, 25, 20, 12, 8, 3, 2];

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

function spinReel(): string {
  const total = SLOT_WEIGHTS.reduce((a, b) => a + b, 0);
  let rand = Math.random() * total;
  for (let i = 0; i < SLOT_SYMBOLS.length; i++) {
    rand -= SLOT_WEIGHTS[i];
    if (rand <= 0) return SLOT_SYMBOLS[i];
  }
  return SLOT_SYMBOLS[0];
}

export async function handleSlots(
  interaction: ChatInputCommandInteraction,
): Promise<void> {
  const guild = interaction.guild!;
  const userId = interaction.user.id;
  const bet = interaction.options.getInteger("mise", true);
  const cfg = await getCasinoConfig(guild.id);

  if (!(await checkCasinoChannel(interaction, cfg))) return;
  if (!(await checkBet(interaction, guild.id, userId, bet, cfg))) return;

  await addBalance(guild.id, userId, -bet);

  const reels = [spinReel(), spinReel(), spinReel()];
  const display = `╔══════════════╗\n║  ${reels.join("  │  ")}  ║\n╚══════════════╝`;
  const multipliers = getSlotMultipliers(cfg.slotsJackpotMultiplier);

  let multiplier = 0;
  let result = "";

  if (reels[0] === reels[1] && reels[1] === reels[2]) {
    multiplier = multipliers[reels[0]] ?? 2;
    result = "🎉 **JACKPOT !** Triple symbole !";
  } else if (reels[0] === reels[1] || reels[1] === reels[2] || reels[0] === reels[2]) {
    multiplier = 1.5;
    result = "✨ Deux symboles identiques !";
  } else {
    result = "💨 Rien... Retente ta chance !";
  }

  const winnings = Math.floor(bet * multiplier);
  let balAfter: number;
  if (winnings > 0) {
    balAfter = await addBalance(guild.id, userId, winnings);
  } else {
    balAfter = await getBalance(guild.id, userId);
  }

  const net = winnings - bet;
  const isJackpot = multiplier >= cfg.slotsJackpotMultiplier;
  const color = isJackpot ? COLOR_GOLD : winnings > 0 ? COLOR_SUCCESS : COLOR_DANGER;

  const embed = new EmbedBuilder()
    .setColor(color)
    .setTitle("🎰 Machine à Sous")
    .setDescription(`${display}\n\n${result}`)
    .addFields(
      { name: "Mise", value: fmt(bet, cfg.currency), inline: true },
      {
        name: "Gain",
        value: winnings > 0 ? `+${fmt(winnings, cfg.currency)} (×${multiplier})` : "—",
        inline: true,
      },
      {
        name: net >= 0 ? "Profit" : "Perte",
        value: `${net >= 0 ? "+" : ""}${net.toLocaleString("fr")} ${cfg.currency}`,
        inline: true,
      },
      { name: "Solde", value: fmt(balAfter, cfg.currency), inline: false },
    )
    .setFooter({ text: `Joueur : ${interaction.user.tag}` })
    .setTimestamp();

  await interaction.reply({ embeds: [embed] });
}

// ──────────────────────────────────────────────
// ROULETTE
// ──────────────────────────────────────────────

const RED_NUMBERS = new Set([
  1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36,
]);

interface RouletteResult {
  won: boolean;
  multiplier: number;
  label: string;
}

function resolveRoulette(number: number, choice: string): RouletteResult {
  const isRed = RED_NUMBERS.has(number);
  const isEven = number !== 0 && number % 2 === 0;

  switch (choice) {
    case "rouge":
      return { won: isRed, multiplier: 2, label: "Rouge 🔴" };
    case "noir":
      return { won: number !== 0 && !isRed, multiplier: 2, label: "Noir ⚫" };
    case "pair":
      return { won: isEven, multiplier: 2, label: "Pair" };
    case "impair":
      return { won: number !== 0 && !isEven, multiplier: 2, label: "Impair" };
    case "1-12":
      return { won: number >= 1 && number <= 12, multiplier: 3, label: "1ère douzaine (1–12)" };
    case "13-24":
      return { won: number >= 13 && number <= 24, multiplier: 3, label: "2e douzaine (13–24)" };
    case "25-36":
      return { won: number >= 25 && number <= 36, multiplier: 3, label: "3e douzaine (25–36)" };
    default: {
      const target = parseInt(choice, 10);
      if (!isNaN(target) && target >= 0 && target <= 36) {
        return { won: number === target, multiplier: 36, label: `Numéro ${target}` };
      }
      return { won: false, multiplier: 0, label: "Invalide" };
    }
  }
}

export async function handleRoulette(
  interaction: ChatInputCommandInteraction,
): Promise<void> {
  const guild = interaction.guild!;
  const userId = interaction.user.id;
  const bet = interaction.options.getInteger("mise", true);
  const cfg = await getCasinoConfig(guild.id);

  if (!(await checkCasinoChannel(interaction, cfg))) return;
  if (!(await checkBet(interaction, guild.id, userId, bet, cfg))) return;

  const choice = interaction.options.getString("choix", true).toLowerCase().trim();
  const nombre = interaction.options.getInteger("nombre");
  const finalChoice = nombre !== null ? String(nombre) : choice;

  const roll = Math.floor(Math.random() * 37);
  const { won, multiplier, label } = resolveRoulette(roll, finalChoice);

  await addBalance(guild.id, userId, -bet);
  const winnings = won ? Math.floor(bet * multiplier) : 0;
  let balAfter: number;
  if (won) {
    balAfter = await addBalance(guild.id, userId, winnings);
  } else {
    balAfter = await getBalance(guild.id, userId);
  }

  const isRed = RED_NUMBERS.has(roll);
  const ballEmoji = roll === 0 ? "🟢" : isRed ? "🔴" : "⚫";
  const net = winnings - bet;

  const embed = new EmbedBuilder()
    .setColor(won ? COLOR_SUCCESS : COLOR_DANGER)
    .setTitle("🎡 Roulette")
    .setDescription(
      `La bille s'arrête sur **${roll}** ${ballEmoji}\n\n` +
        (won
          ? `✅ Tu as gagné avec : **${label}** !`
          : `❌ Perdu. Tu avais misé sur : **${label}**`),
    )
    .addFields(
      { name: "Mise", value: fmt(bet, cfg.currency), inline: true },
      {
        name: "Gain",
        value: won ? `+${fmt(winnings, cfg.currency)} (×${multiplier})` : "—",
        inline: true,
      },
      {
        name: net >= 0 ? "Profit" : "Perte",
        value: `${net >= 0 ? "+" : ""}${net.toLocaleString("fr")} ${cfg.currency}`,
        inline: true,
      },
      { name: "Solde", value: fmt(balAfter, cfg.currency), inline: false },
    )
    .setFooter({ text: `Joueur : ${interaction.user.tag}` })
    .setTimestamp();

  await interaction.reply({ embeds: [embed] });
}

// ──────────────────────────────────────────────
// BLACKJACK
// ──────────────────────────────────────────────

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

const sessions = new Map<string, BjSession>();
const SESSION_TTL = 10 * 60 * 1000;

const SUITS = ["♠", "♥", "♦", "♣"];
const RANKS = ["A", "2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K"];

function buildDeck(): Card[] {
  const deck: Card[] = [];
  for (const suit of SUITS) {
    for (const rank of RANKS) {
      deck.push({ suit, rank });
    }
  }
  return shuffle(deck);
}

function shuffle<T>(arr: T[]): T[] {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function dealCard(deck: Card[]): Card {
  return deck.pop()!;
}

function cardValue(rank: string): number {
  if (rank === "A") return 11;
  if (["J", "Q", "K"].includes(rank)) return 10;
  return parseInt(rank, 10);
}

function handValue(hand: Card[]): number {
  let total = hand.reduce((s, c) => s + cardValue(c.rank), 0);
  let aces = hand.filter((c) => c.rank === "A").length;
  while (total > 21 && aces > 0) {
    total -= 10;
    aces--;
  }
  return total;
}

function displayHand(hand: Card[], hideSecond = false): string {
  return hand
    .map((c, i) => (hideSecond && i === 1 ? "🂠" : `\`${c.rank}${c.suit}\``))
    .join(" ");
}

function bjButtons(userId: string, canDouble: boolean): ActionRowBuilder<ButtonBuilder> {
  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(`bj_hit_${userId}`)
      .setLabel("Tirer")
      .setEmoji("🃏")
      .setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId(`bj_stand_${userId}`)
      .setLabel("Rester")
      .setEmoji("🛑")
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId(`bj_double_${userId}`)
      .setLabel("Doubler")
      .setEmoji("💰")
      .setStyle(ButtonStyle.Success)
      .setDisabled(!canDouble),
  );
}

function buildBjEmbed(
  session: BjSession,
  status: "playing" | "win" | "lose" | "push" | "blackjack" | "bust",
  currency: string,
  hideDealer = true,
): EmbedBuilder {
  const pv = handValue(session.playerHand);
  const dv = handValue(session.dealerHand);
  const dealerDisplay = hideDealer
    ? displayHand(session.dealerHand, true)
    : displayHand(session.dealerHand);
  const dealerVal = hideDealer ? cardValue(session.dealerHand[0].rank) : dv;

  const titles: Record<typeof status, string> = {
    playing: "♠ Blackjack — À toi de jouer",
    win: "♠ Blackjack — Victoire !",
    blackjack: "♠ Blackjack — BLACKJACK !",
    lose: "♠ Blackjack — Perdu",
    bust: "♠ Blackjack — Bust !",
    push: "♠ Blackjack — Égalité",
  };
  const colors: Record<typeof status, number> = {
    playing: COLOR_PRIMARY,
    win: COLOR_SUCCESS,
    blackjack: COLOR_GOLD,
    lose: COLOR_DANGER,
    bust: COLOR_DANGER,
    push: COLOR_WARN,
  };

  const embed = new EmbedBuilder()
    .setColor(colors[status])
    .setTitle(titles[status])
    .addFields(
      {
        name: `Croupier (${dealerVal})`,
        value: dealerDisplay,
      },
      {
        name: `Toi (${pv})`,
        value: displayHand(session.playerHand),
      },
      {
        name: "Mise",
        value: fmt(session.bet, currency),
        inline: true,
      },
    );

  if (!hideDealer) {
    let resultLine = "";
    if (status === "win" || status === "blackjack") {
      const mult = status === "blackjack" ? session.bjPayoutMult : 2;
      const win = Math.floor(session.bet * mult);
      resultLine = `Gain : +${fmt(win, currency)}`;
    } else if (status === "push") {
      resultLine = `Remboursé : ${fmt(session.bet, currency)}`;
    } else {
      resultLine = `Perte : -${fmt(session.bet, currency)}`;
    }
    embed.addFields({ name: "Résultat", value: resultLine, inline: true });
  }

  embed.setFooter({ text: `Joueur : <@${session.userId}> • Expire dans 10 min` }).setTimestamp();

  return embed;
}

async function finishBj(
  interaction: ButtonInteraction | ChatInputCommandInteraction,
  session: BjSession,
  status: "win" | "lose" | "push" | "blackjack" | "bust",
  isFollowUp: boolean,
): Promise<void> {
  sessions.delete(session.userId);

  const cfg = await getCasinoConfig(session.guildId);
  const bjMult = cfg.bjNaturalPayout / 100;

  let payout = 0;
  if (status === "win") payout = Math.floor(session.bet * 2);
  else if (status === "blackjack") payout = Math.floor(session.bet * bjMult);
  else if (status === "push") payout = session.bet;

  let balAfter: number;
  if (payout > 0) {
    balAfter = await addBalance(session.guildId, session.userId, payout);
  } else {
    balAfter = await getBalance(session.guildId, session.userId);
  }

  const embed = buildBjEmbed(session, status, cfg.currency, false);
  embed.addFields({ name: "Solde", value: fmt(balAfter, cfg.currency) });

  if (isFollowUp && interaction instanceof ButtonInteraction) {
    await interaction.update({ embeds: [embed], components: [] });
  } else {
    await (interaction as ChatInputCommandInteraction).reply({
      embeds: [embed],
      components: [],
    });
  }
}

export async function handleBlackjack(
  interaction: ChatInputCommandInteraction,
): Promise<void> {
  const guild = interaction.guild!;
  const userId = interaction.user.id;
  const bet = interaction.options.getInteger("mise", true);
  const cfg = await getCasinoConfig(guild.id);

  if (!(await checkCasinoChannel(interaction, cfg))) return;

  if (sessions.has(userId)) {
    await interaction.reply({
      embeds: [
        new EmbedBuilder()
          .setColor(COLOR_WARN)
          .setDescription("⚠️ Tu as déjà une partie en cours ! Termine-la d'abord."),
      ],
      ephemeral: true,
    });
    return;
  }

  if (!(await checkBet(interaction, guild.id, userId, bet, cfg))) return;

  await addBalance(guild.id, userId, -bet);

  const deck = buildDeck();
  const playerHand = [dealCard(deck), dealCard(deck)];
  const dealerHand = [dealCard(deck), dealCard(deck)];

  const session: BjSession = {
    guildId: guild.id,
    userId,
    bet,
    deck,
    playerHand,
    dealerHand,
    doubled: false,
    expiresAt: Date.now() + SESSION_TTL,
    bjPayoutMult: cfg.bjNaturalPayout / 100,
  };

  sessions.set(userId, session);
  setTimeout(() => sessions.delete(userId), SESSION_TTL);

  const pv = handValue(playerHand);

  if (pv === 21) {
    await finishBj(interaction, session, "blackjack", false);
    return;
  }

  const canDouble = await canAfford(guild.id, userId, bet);
  const embed = buildBjEmbed(session, "playing", cfg.currency);
  const row = bjButtons(userId, canDouble);

  await interaction.reply({ embeds: [embed], components: [row] });
}

export async function handleBlackjackButton(
  interaction: ButtonInteraction,
): Promise<void> {
  const parts = interaction.customId.split("_");
  const action = parts[1];
  const userId = parts[2];

  if (interaction.user.id !== userId) {
    await interaction.reply({ content: "❌ Ce n'est pas ta partie !", ephemeral: true });
    return;
  }

  const session = sessions.get(userId);
  if (!session) {
    await interaction.reply({ content: "❌ Partie expirée ou introuvable.", ephemeral: true });
    return;
  }

  const cfg = await getCasinoConfig(session.guildId);

  if (action === "hit") {
    session.playerHand.push(dealCard(session.deck));
    const pv = handValue(session.playerHand);
    if (pv > 21) {
      await finishBj(interaction, session, "bust", true);
      return;
    }
    if (pv === 21) {
      await dealerPlay(interaction, session);
      return;
    }
    const canDouble = !session.doubled && (await canAfford(session.guildId, userId, session.bet));
    const embed = buildBjEmbed(session, "playing", cfg.currency);
    await interaction.update({ embeds: [embed], components: [bjButtons(userId, canDouble)] });
    return;
  }

  if (action === "stand") {
    await dealerPlay(interaction, session);
    return;
  }

  if (action === "double") {
    const ok = await canAfford(session.guildId, userId, session.bet);
    if (!ok) {
      await interaction.reply({ content: "❌ Plus assez de pièces pour doubler !", ephemeral: true });
      return;
    }
    await addBalance(session.guildId, userId, -session.bet);
    session.bet *= 2;
    session.doubled = true;
    session.playerHand.push(dealCard(session.deck));
    const pv = handValue(session.playerHand);
    if (pv > 21) {
      await finishBj(interaction, session, "bust", true);
      return;
    }
    await dealerPlay(interaction, session);
  }
}

async function dealerPlay(
  interaction: ButtonInteraction | ChatInputCommandInteraction,
  session: BjSession,
): Promise<void> {
  while (handValue(session.dealerHand) < 17) {
    session.dealerHand.push(dealCard(session.deck));
  }
  const pv = handValue(session.playerHand);
  const dv = handValue(session.dealerHand);
  let status: "win" | "lose" | "push" | "bust";
  if (dv > 21 || pv > dv) status = "win";
  else if (pv < dv) status = "lose";
  else status = "push";
  await finishBj(interaction, session, status, interaction instanceof ButtonInteraction);
}

// ──────────────────────────────────────────────
// BALANCE / DAILY
// ──────────────────────────────────────────────

export async function handleBalance(
  interaction: ChatInputCommandInteraction,
): Promise<void> {
  const guild = interaction.guild!;
  const target = interaction.options.getUser("utilisateur") ?? interaction.user;
  const cfg = await getCasinoConfig(guild.id);
  const bal = await getBalance(guild.id, target.id);
  const lb = await getEconomyLeaderboard(guild.id, 200);
  const rank = lb.findIndex((e) => e.userId === target.id) + 1;
  const entry = lb.find((e) => e.userId === target.id);

  const embed = new EmbedBuilder()
    .setColor(COLOR_PRIMARY)
    .setTitle(`${cfg.currency} Portefeuille de ${target.displayName}`)
    .setThumbnail(target.displayAvatarURL())
    .addFields(
      { name: "Solde", value: fmt(bal, cfg.currency), inline: true },
      { name: "Classement", value: rank > 0 ? `**#${rank}**` : "—", inline: true },
    );

  if (cfg.dailyStreakBonus && entry && (entry.streak ?? 0) > 0) {
    embed.addFields({ name: "🔥 Streak", value: `**${entry.streak}** jour(s)`, inline: true });
  }

  embed.setFooter({ text: `Serveur : ${guild.name}` });

  await interaction.reply({ embeds: [embed] });
}

export async function handleDaily(
  interaction: ChatInputCommandInteraction,
): Promise<void> {
  const guild = interaction.guild!;
  const userId = interaction.user.id;
  const cfg = await getCasinoConfig(guild.id);
  const result = await claimDaily(guild.id, userId);

  if (!result.success) {
    const h = Math.floor(result.remainingMs / 3600000);
    const m = Math.floor((result.remainingMs % 3600000) / 60000);
    const streakLine = cfg.dailyStreakBonus && result.streak > 0
      ? `\n🔥 Streak actuel : **${result.streak}** jour(s) — ne le perds pas !`
      : "";
    await interaction.reply({
      embeds: [
        new EmbedBuilder()
          .setColor(COLOR_WARN)
          .setTitle("⏳ Récompense déjà réclamée")
          .setDescription(
            `Tu pourras réclamer ta récompense dans **${h}h ${m}min**.${streakLine}`,
          ),
      ],
      ephemeral: true,
    });
    return;
  }

  const streakLine =
    cfg.dailyStreakBonus && result.streak > 0
      ? `\n🔥 **Streak ×${result.streak}** — Bonus : +${fmt(result.bonusAmount, cfg.currency)}`
      : "";

  await interaction.reply({
    embeds: [
      new EmbedBuilder()
        .setColor(COLOR_SUCCESS)
        .setTitle("🎁 Récompense quotidienne !")
        .setDescription(
          `Tu as reçu ${fmt(result.earned, cfg.currency)} !${streakLine}\n\nSolde actuel : ${fmt(result.balance, cfg.currency)}`,
        )
        .setFooter({
          text: cfg.dailyCooldownHours === 24
            ? "Reviens dans 24h pour la prochaine."
            : `Reviens dans ${cfg.dailyCooldownHours}h.`,
        }),
    ],
  });
}

// ──────────────────────────────────────────────
// CASINO CONFIG (admin)
// ──────────────────────────────────────────────

function fmtConfigValue(key: ConfigKey, val: unknown): string {
  if (key === "casinoChannelId") return val ? `<#${val}>` : "`aucun`";
  if (key === "dailyStreakBonus") return val ? "✅ Activé" : "❌ Désactivé";
  if (key === "bjNaturalPayout") return `×${Number(val) / 100} (${val === 150 ? "Vegas standard" : "Généreux"})`;
  if (key === "currency") return `${val}`;
  if (key === "maxBet") return val === 0 ? "`illimité`" : fmt(Number(val), "");
  return `\`${val}\``;
}

export async function handleCasinoConfig(
  interaction: ChatInputCommandInteraction,
): Promise<void> {
  const guild = interaction.guild!;
  const member = await guild.members.fetch(interaction.user.id).catch(() => null);
  const hasPerms =
    member?.permissions.has(PermissionFlagsBits.ManageGuild) ||
    member?.permissions.has(PermissionFlagsBits.Administrator);

  const sub = interaction.options.getSubcommand();

  if (sub === "view") {
    const cfg = await getCasinoConfig(guild.id);
    const fields = (Object.keys(CONFIG_META) as ConfigKey[]).map((key) => ({
      name: CONFIG_META[key].label,
      value: fmtConfigValue(key, cfg[key]),
      inline: true,
    }));

    const embed = new EmbedBuilder()
      .setColor(COLOR_PRIMARY)
      .setTitle(`🎰 Configuration Casino — ${guild.name}`)
      .addFields(...fields)
      .setFooter({ text: "Utilisez /casino config set <clé> <valeur> pour modifier" })
      .setTimestamp();

    await interaction.reply({ embeds: [embed], ephemeral: true });
    return;
  }

  if (!hasPerms) {
    await interaction.reply({
      embeds: [
        new EmbedBuilder()
          .setColor(COLOR_DANGER)
          .setDescription("❌ Tu dois avoir la permission **Gérer le serveur** pour modifier la config casino."),
      ],
      ephemeral: true,
    });
    return;
  }

  if (sub === "reset") {
    await resetCasinoConfig(guild.id);
    await interaction.reply({
      embeds: [
        new EmbedBuilder()
          .setColor(COLOR_SUCCESS)
          .setTitle("♻️ Config réinitialisée")
          .setDescription("La configuration casino a été remise aux valeurs par défaut."),
      ],
      ephemeral: true,
    });
    return;
  }

  if (sub === "set") {
    const key = interaction.options.getString("clé", true) as ConfigKey;
    const rawValue = interaction.options.getString("valeur", true).trim();
    const meta = CONFIG_META[key];

    if (!meta) {
      await interaction.reply({
        embeds: [new EmbedBuilder().setColor(COLOR_DANGER).setDescription("❌ Clé de configuration inconnue.")],
        ephemeral: true,
      });
      return;
    }

    let parsed: GuildCasinoConfig[typeof key];

    try {
      if (meta.type === "integer") {
        const n = parseInt(rawValue, 10);
        if (isNaN(n)) throw new Error("Nombre invalide");
        if (meta.min !== undefined && n < meta.min) throw new Error(`Minimum : ${meta.min}`);
        if (meta.max !== undefined && n > meta.max) throw new Error(`Maximum : ${meta.max}`);
        if (key === "bjNaturalPayout" && n !== 150 && n !== 250)
          throw new Error("Valeurs acceptées : 150 ou 250");
        parsed = n as GuildCasinoConfig[typeof key];
      } else if (meta.type === "boolean") {
        if (!["true", "false", "1", "0", "oui", "non"].includes(rawValue.toLowerCase()))
          throw new Error('Valeur attendue : "true" ou "false"');
        parsed = (rawValue === "true" || rawValue === "1" || rawValue === "oui") as GuildCasinoConfig[typeof key];
      } else {
        if (key === "casinoChannelId") {
          if (rawValue === "none" || rawValue === "aucun" || rawValue === "0") {
            parsed = null as GuildCasinoConfig[typeof key];
          } else {
            const id = rawValue.replace(/[<#>]/g, "");
            const ch = guild.channels.cache.get(id);
            if (!ch) throw new Error("Salon introuvable. Envoie le #salon ou son ID, ou `none` pour désactiver.");
            if (!(ch instanceof TextChannel)) throw new Error("Le salon doit être un salon textuel.");
            parsed = id as GuildCasinoConfig[typeof key];
          }
        } else {
          if (rawValue.length > 10) throw new Error("Emoji trop long (max 10 caractères)");
          parsed = rawValue as GuildCasinoConfig[typeof key];
        }
      }
    } catch (err) {
      await interaction.reply({
        embeds: [
          new EmbedBuilder()
            .setColor(COLOR_DANGER)
            .setTitle("❌ Valeur invalide")
            .setDescription((err as Error).message)
            .addFields({ name: "Aide", value: meta.description }),
        ],
        ephemeral: true,
      });
      return;
    }

    const newCfg = await setCasinoConfigField(guild.id, key, parsed);

    await interaction.reply({
      embeds: [
        new EmbedBuilder()
          .setColor(COLOR_SUCCESS)
          .setTitle("✅ Configuration mise à jour")
          .addFields(
            { name: meta.label, value: fmtConfigValue(key, newCfg[key]), inline: true },
          )
          .setFooter({ text: `Modifié par ${interaction.user.tag}` })
          .setTimestamp(),
      ],
      ephemeral: true,
    });
  }
}

// ──────────────────────────────────────────────
// ECONOMY ADMIN
// ──────────────────────────────────────────────

export async function handleEconomy(
  interaction: ChatInputCommandInteraction,
): Promise<void> {
  const guild = interaction.guild!;
  const member = await guild.members.fetch(interaction.user.id).catch(() => null);
  const hasPerms =
    member?.permissions.has(PermissionFlagsBits.ManageGuild) ||
    member?.permissions.has(PermissionFlagsBits.Administrator);

  const sub = interaction.options.getSubcommand();
  const cfg = await getCasinoConfig(guild.id);

  if (sub === "top") {
    const page = interaction.options.getInteger("page") ?? 1;
    const perPage = 10;
    const offset = (page - 1) * perPage;
    const entries = await getEconomyLeaderboard(guild.id, perPage, offset);
    const medals = ["🥇", "🥈", "🥉"];
    const lines = entries.length === 0
      ? "*Aucun joueur enregistré.*"
      : entries
          .map((e, i) => {
            const rank = offset + i + 1;
            const prefix = medals[rank - 1] ?? `**${rank}.**`;
            const streak = cfg.dailyStreakBonus && e.streak > 0 ? ` 🔥${e.streak}` : "";
            return `${prefix} <@${e.userId}> — ${fmt(e.balance, cfg.currency)}${streak}`;
          })
          .join("\n");

    await interaction.reply({
      embeds: [
        new EmbedBuilder()
          .setColor(COLOR_GOLD)
          .setTitle(`${cfg.currency} Classement Économie — ${guild.name}`)
          .setDescription(lines)
          .setFooter({ text: `Page ${page}` })
          .setTimestamp(),
      ],
    });
    return;
  }

  if (!hasPerms) {
    await interaction.reply({
      embeds: [
        new EmbedBuilder()
          .setColor(COLOR_DANGER)
          .setDescription("❌ Tu dois avoir la permission **Gérer le serveur** pour gérer l'économie."),
      ],
      ephemeral: true,
    });
    return;
  }

  const target = interaction.options.getUser("utilisateur", true);

  if (sub === "give") {
    const amount = interaction.options.getInteger("montant", true);
    const newBal = await addBalance(guild.id, target.id, amount);
    await interaction.reply({
      embeds: [
        new EmbedBuilder()
          .setColor(COLOR_SUCCESS)
          .setTitle("✅ Pièces données")
          .addFields(
            { name: "Membre", value: `<@${target.id}>`, inline: true },
            { name: "Donné", value: `+${fmt(amount, cfg.currency)}`, inline: true },
            { name: "Nouveau solde", value: fmt(newBal, cfg.currency), inline: true },
          )
          .setFooter({ text: `Par ${interaction.user.tag}` })
          .setTimestamp(),
      ],
      ephemeral: true,
    });
    return;
  }

  if (sub === "take") {
    const amount = interaction.options.getInteger("montant", true);
    const newBal = await addBalance(guild.id, target.id, -amount);
    await interaction.reply({
      embeds: [
        new EmbedBuilder()
          .setColor(COLOR_WARN)
          .setTitle("💸 Pièces retirées")
          .addFields(
            { name: "Membre", value: `<@${target.id}>`, inline: true },
            { name: "Retiré", value: `-${fmt(amount, cfg.currency)}`, inline: true },
            { name: "Nouveau solde", value: fmt(newBal, cfg.currency), inline: true },
          )
          .setFooter({ text: `Par ${interaction.user.tag}` })
          .setTimestamp(),
      ],
      ephemeral: true,
    });
    return;
  }

  if (sub === "set") {
    const amount = interaction.options.getInteger("montant", true);
    const newBal = await setBalance(guild.id, target.id, amount);
    await interaction.reply({
      embeds: [
        new EmbedBuilder()
          .setColor(COLOR_PRIMARY)
          .setTitle("✏️ Solde modifié")
          .addFields(
            { name: "Membre", value: `<@${target.id}>`, inline: true },
            { name: "Nouveau solde", value: fmt(newBal, cfg.currency), inline: true },
          )
          .setFooter({ text: `Par ${interaction.user.tag}` })
          .setTimestamp(),
      ],
      ephemeral: true,
    });
    return;
  }

  if (sub === "reset") {
    const newBal = await resetBalance(guild.id, target.id);
    await interaction.reply({
      embeds: [
        new EmbedBuilder()
          .setColor(COLOR_WARN)
          .setTitle("♻️ Économie réinitialisée")
          .setDescription(
            `Le compte de <@${target.id}> a été remis à ${fmt(newBal, cfg.currency)} (solde de départ configuré).`,
          )
          .setFooter({ text: `Par ${interaction.user.tag}` })
          .setTimestamp(),
      ],
      ephemeral: true,
    });
  }
}
