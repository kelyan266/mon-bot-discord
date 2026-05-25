import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonInteraction,
  ButtonStyle,
  ChatInputCommandInteraction,
  EmbedBuilder,
} from "discord.js";
import {
  addBalance,
  canAfford,
  CURRENCY,
  getBalance,
  MIN_BET,
} from "./economy.js";

const COLOR_PRIMARY = 0x5865f2;
const COLOR_SUCCESS = 0x57f287;
const COLOR_WARN = 0xfee75c;
const COLOR_DANGER = 0xed4245;
const COLOR_GOLD = 0xf1c40f;

// ──────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────

function fmt(n: number) {
  return `**${n.toLocaleString("fr")}** ${CURRENCY}`;
}

async function checkBet(
  interaction: ChatInputCommandInteraction | ButtonInteraction,
  guildId: string,
  userId: string,
  bet: number,
): Promise<boolean> {
  if (bet < MIN_BET) {
    await interaction.reply({
      embeds: [
        new EmbedBuilder()
          .setColor(COLOR_DANGER)
          .setDescription(`❌ Mise minimale : ${fmt(MIN_BET)}`),
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
            `Tu as ${fmt(bal)} mais tu veux miser ${fmt(bet)}.`,
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
const SLOT_MULTIPLIERS: Record<string, number> = {
  "7️⃣": 20,
  "💎": 10,
  "🍉": 5,
  "🍊": 4,
  "🍇": 3,
  "🍋": 2.5,
  "🍒": 2,
};

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

  if (!(await checkBet(interaction, guild.id, userId, bet))) return;

  await addBalance(guild.id, userId, -bet);

  const reels = [spinReel(), spinReel(), spinReel()];
  const display = `╔══════════════╗\n║  ${reels.join("  │  ")}  ║\n╚══════════════╝`;

  let multiplier = 0;
  let result = "";

  if (reels[0] === reels[1] && reels[1] === reels[2]) {
    multiplier = SLOT_MULTIPLIERS[reels[0]] ?? 2;
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
  const color =
    multiplier >= SLOT_MULTIPLIERS["7️⃣"]
      ? COLOR_GOLD
      : winnings > 0
        ? COLOR_SUCCESS
        : COLOR_DANGER;

  const embed = new EmbedBuilder()
    .setColor(color)
    .setTitle("🎰 Machine à Sous")
    .setDescription(`${display}\n\n${result}`)
    .addFields(
      { name: "Mise", value: fmt(bet), inline: true },
      {
        name: "Gain",
        value: winnings > 0 ? `+${fmt(winnings)} (×${multiplier})` : "—",
        inline: true,
      },
      {
        name: net >= 0 ? "Profit" : "Perte",
        value: `${net >= 0 ? "+" : ""}${net.toLocaleString("fr")} ${CURRENCY}`,
        inline: true,
      },
      { name: "Solde", value: fmt(balAfter), inline: false },
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
      return {
        won: isRed,
        multiplier: 2,
        label: `Rouge 🔴`,
      };
    case "noir":
      return {
        won: number !== 0 && !isRed,
        multiplier: 2,
        label: `Noir ⚫`,
      };
    case "pair":
      return {
        won: isEven,
        multiplier: 2,
        label: `Pair`,
      };
    case "impair":
      return {
        won: number !== 0 && !isEven,
        multiplier: 2,
        label: `Impair`,
      };
    case "1-12":
      return {
        won: number >= 1 && number <= 12,
        multiplier: 3,
        label: `1ère douzaine (1–12)`,
      };
    case "13-24":
      return {
        won: number >= 13 && number <= 24,
        multiplier: 3,
        label: `2e douzaine (13–24)`,
      };
    case "25-36":
      return {
        won: number >= 25 && number <= 36,
        multiplier: 3,
        label: `3e douzaine (25–36)`,
      };
    default: {
      const target = parseInt(choice, 10);
      if (!isNaN(target) && target >= 0 && target <= 36) {
        return {
          won: number === target,
          multiplier: 36,
          label: `Numéro ${target}`,
        };
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
  const choice = interaction.options.getString("choix", true).toLowerCase().trim();

  if (!(await checkBet(interaction, guild.id, userId, bet))) return;

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
      { name: "Mise", value: fmt(bet), inline: true },
      {
        name: "Gain",
        value: won ? `+${fmt(winnings)} (×${multiplier})` : "—",
        inline: true,
      },
      {
        name: net >= 0 ? "Profit" : "Perte",
        value: `${net >= 0 ? "+" : ""}${net.toLocaleString("fr")} ${CURRENCY}`,
        inline: true,
      },
      { name: "Solde", value: fmt(balAfter), inline: false },
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
    .map((c, i) => (hideSecond && i === 1 ? "🂠" : `\`${c.rank}${c.suit}\``)  )
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
  hideDealer = true,
): EmbedBuilder {
  const pv = handValue(session.playerHand);
  const dv = handValue(session.dealerHand);
  const dealerDisplay = hideDealer
    ? displayHand(session.dealerHand, true)
    : displayHand(session.dealerHand);
  const dealerVal = hideDealer
    ? cardValue(session.dealerHand[0].rank)
    : dv;

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
        name: `Croupier ${hideDealer ? `(${dealerVal})` : `(${dv})`}`,
        value: dealerDisplay,
      },
      {
        name: `Toi (${pv})`,
        value: displayHand(session.playerHand),
      },
      {
        name: "Mise",
        value: fmt(session.bet),
        inline: true,
      },
    );

  if (!hideDealer) {
    let resultLine = "";
    if (status === "win" || status === "blackjack") {
      const mult = status === "blackjack" ? 2.5 : 2;
      const win = Math.floor(session.bet * mult);
      resultLine = `Gain : +${fmt(win)}`;
    } else if (status === "push") {
      resultLine = `Remboursé : ${fmt(session.bet)}`;
    } else {
      resultLine = `Perte : -${fmt(session.bet)}`;
    }
    embed.addFields({ name: "Résultat", value: resultLine, inline: true });
  }

  embed
    .setFooter({ text: `Joueur : <@${session.userId}> • Expire dans 10 min` })
    .setTimestamp();

  return embed;
}

async function finishBj(
  interaction: ButtonInteraction | ChatInputCommandInteraction,
  session: BjSession,
  status: "win" | "lose" | "push" | "blackjack" | "bust",
  isFollowUp: boolean,
): Promise<void> {
  sessions.delete(session.userId);

  let payout = 0;
  if (status === "win") payout = Math.floor(session.bet * 2);
  else if (status === "blackjack") payout = Math.floor(session.bet * 2.5);
  else if (status === "push") payout = session.bet;

  let balAfter: number;
  if (payout > 0) {
    balAfter = await addBalance(session.guildId, session.userId, payout);
  } else {
    balAfter = await getBalance(session.guildId, session.userId);
  }

  const embed = buildBjEmbed(session, status, false);
  embed.addFields({ name: "Solde", value: fmt(balAfter) });

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

  if (!(await checkBet(interaction, guild.id, userId, bet))) return;

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
  };

  sessions.set(userId, session);
  setTimeout(() => sessions.delete(userId), SESSION_TTL);

  const pv = handValue(playerHand);

  if (pv === 21) {
    await finishBj(interaction, session, "blackjack", false);
    return;
  }

  const canDouble = await canAfford(guild.id, userId, bet);
  const embed = buildBjEmbed(session, "playing");
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
    await interaction.reply({
      content: "❌ Ce n'est pas ta partie !",
      ephemeral: true,
    });
    return;
  }

  const session = sessions.get(userId);
  if (!session) {
    await interaction.reply({
      content: "❌ Partie expirée ou introuvable.",
      ephemeral: true,
    });
    return;
  }

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
    const embed = buildBjEmbed(session, "playing");
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
      await interaction.reply({
        content: "❌ Plus assez de pièces pour doubler !",
        ephemeral: true,
      });
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
  const bal = await getBalance(guild.id, target.id);
  const lb = await import("./economy.js").then((m) => m.getLeaderboard(guild.id));
  const rank = lb.findIndex((e) => e.userId === target.id) + 1;

  await interaction.reply({
    embeds: [
      new EmbedBuilder()
        .setColor(COLOR_PRIMARY)
        .setTitle(`${CURRENCY} Portefeuille de ${target.displayName}`)
        .setThumbnail(target.displayAvatarURL())
        .addFields(
          { name: "Solde", value: fmt(bal), inline: true },
          {
            name: "Classement",
            value: rank > 0 ? `#${rank}` : "—",
            inline: true,
          },
        )
        .setFooter({ text: `Serveur : ${guild.name}` }),
    ],
  });
}

export async function handleDaily(
  interaction: ChatInputCommandInteraction,
): Promise<void> {
  const guild = interaction.guild!;
  const userId = interaction.user.id;
  const result = await import("./economy.js").then((m) =>
    m.claimDaily(guild.id, userId),
  );

  if (!result.success) {
    const h = Math.floor(result.remainingMs / 3600000);
    const m = Math.floor((result.remainingMs % 3600000) / 60000);
    await interaction.reply({
      embeds: [
        new EmbedBuilder()
          .setColor(COLOR_WARN)
          .setTitle("⏳ Récompense déjà réclamée")
          .setDescription(
            `Tu pourras réclamer ta récompense dans **${h}h ${m}min**.`,
          ),
      ],
      ephemeral: true,
    });
    return;
  }

  const { DAILY_AMOUNT } = await import("./economy.js");
  await interaction.reply({
    embeds: [
      new EmbedBuilder()
        .setColor(COLOR_SUCCESS)
        .setTitle("🎁 Récompense quotidienne !")
        .setDescription(
          `Tu as reçu ${fmt(DAILY_AMOUNT)} !\n\nSolde actuel : ${fmt(result.balance)}`,
        )
        .setFooter({ text: "Reviens dans 24h pour la prochaine." }),
    ],
  });
}
