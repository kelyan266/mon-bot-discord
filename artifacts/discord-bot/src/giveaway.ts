/**
 * giveaway.ts — Système de giveaway
 *
 * Commandes : /giveaway créer | terminer | reroll | liste
 * Participants : bouton 🎉 (toggle join/leave)
 * Persistance : data/giveaways.json
 */

import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  type ButtonInteraction,
  type Client,
  type Guild,
  type TextChannel,
} from "discord.js";
import { loadJson, saveJson } from "./persist.js";

// ─────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────

export interface Giveaway {
  messageId: string;
  channelId: string;
  guildId: string;
  hostId: string;
  prize: string;
  winnersCount: number;
  endsAt: number;
  ended: boolean;
  winners: string[];
  participants: string[];
}

type GiveawayDb = Record<string, Giveaway>; // messageId → giveaway

export const GIVEAWAY_BUTTON_PREFIX = "giveaway:enter:";

// ─────────────────────────────────────────────
// Timers
// ─────────────────────────────────────────────

const activeTimers = new Map<string, ReturnType<typeof setTimeout>>();

// ─────────────────────────────────────────────
// Persistence
// ─────────────────────────────────────────────

async function loadDb(): Promise<GiveawayDb> {
  return loadJson<GiveawayDb>("giveaways.json", {});
}

async function saveDb(db: GiveawayDb): Promise<void> {
  await saveJson("giveaways.json", db);
}

// ─────────────────────────────────────────────
// Duration parser
// ─────────────────────────────────────────────

/** Parse "1d2h30m10s" → milliseconds. Returns null on invalid input. */
export function parseDuration(input: string): number | null {
  const pattern = /^(?:(\d+)d)?(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s)?$/i;
  const match = pattern.exec(input.trim());
  if (!match || !match[0] || match[0].length === 0) return null;

  const [, d = "0", h = "0", m = "0", s = "0"] = match;
  const ms =
    parseInt(d) * 86_400_000 +
    parseInt(h) * 3_600_000 +
    parseInt(m) * 60_000 +
    parseInt(s) * 1_000;

  return ms > 0 ? ms : null;
}

/** Format milliseconds as a human string "2j 3h 15m". */
export function formatDuration(ms: number): string {
  const d = Math.floor(ms / 86_400_000);
  const h = Math.floor((ms % 86_400_000) / 3_600_000);
  const m = Math.floor((ms % 3_600_000) / 60_000);
  const parts: string[] = [];
  if (d) parts.push(`${d}j`);
  if (h) parts.push(`${h}h`);
  if (m) parts.push(`${m}m`);
  if (!parts.length) parts.push("< 1m");
  return parts.join(" ");
}

// ─────────────────────────────────────────────
// Embed builder
// ─────────────────────────────────────────────

function buildEmbed(g: Giveaway, finished = false): EmbedBuilder {
  const embed = new EmbedBuilder()
    .setTitle(`🎉 ${g.prize}`)
    .setColor(finished ? 0x95a5a6 : 0xf1c40f);

  if (finished) {
    const mention =
      g.winners.length > 0
        ? g.winners.map((id) => `<@${id}>`).join(", ")
        : "_Aucun participant_";
    embed
      .setDescription(`**Gagnant${g.winners.length > 1 ? "s" : ""} :** ${mention}`)
      .addFields(
        { name: "Organisé par", value: `<@${g.hostId}>`, inline: true },
        { name: "Gagnants tirés", value: String(g.winners.length), inline: true },
      )
      .setFooter({ text: `Giveaway terminé • ${g.participants.length} participant(s)` })
      .setTimestamp();
  } else {
    embed
      .setDescription(
        `Clique sur 🎉 pour participer !\n\n**Se termine <t:${Math.floor(g.endsAt / 1000)}:R>**`,
      )
      .addFields(
        { name: "Organisé par", value: `<@${g.hostId}>`, inline: true },
        { name: "Gagnant(s)", value: String(g.winnersCount), inline: true },
      )
      .setFooter({ text: `${g.participants.length} participant(s)` })
      .setTimestamp(g.endsAt);
  }

  return embed;
}

function buildButton(g: Giveaway, disabled = false): ActionRowBuilder<ButtonBuilder> {
  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(`${GIVEAWAY_BUTTON_PREFIX}${g.messageId}`)
      .setLabel(`🎉 Participer (${g.participants.length})`)
      .setStyle(ButtonStyle.Primary)
      .setDisabled(disabled),
  );
}

// ─────────────────────────────────────────────
// Core logic
// ─────────────────────────────────────────────

/** Pick random unique winners from the participants list. */
function pickWinners(participants: string[], count: number): string[] {
  const pool = [...participants];
  const winners: string[] = [];
  const n = Math.min(count, pool.length);
  for (let i = 0; i < n; i++) {
    const idx = Math.floor(Math.random() * pool.length);
    winners.push(pool[idx]!);
    pool.splice(idx, 1);
  }
  return winners;
}

/** End a giveaway and update the original message. */
export async function endGiveaway(
  messageId: string,
  client: Client,
  early = false,
): Promise<Giveaway | null> {
  const db = await loadDb();
  const g = db[messageId];
  if (!g || g.ended) return null;

  g.ended = true;
  g.winners = pickWinners(g.participants, g.winnersCount);

  await saveDb(db);

  // Clear scheduled timer
  const timer = activeTimers.get(messageId);
  if (timer) {
    clearTimeout(timer);
    activeTimers.delete(messageId);
  }

  // Update original message
  try {
    const guild = client.guilds.cache.get(g.guildId) as Guild | undefined;
    const channel = guild?.channels.cache.get(g.channelId) as TextChannel | undefined;
    if (channel) {
      const msg = await channel.messages.fetch(messageId).catch(() => null);
      if (msg) {
        await msg.edit({
          embeds: [buildEmbed(g, true)],
          components: [buildButton(g, true)],
        });

        // Announce winner(s)
        if (g.winners.length > 0) {
          const congratText =
            g.winners.length === 1
              ? `🎉 Félicitations <@${g.winners[0]}> ! Tu as gagné **${g.prize}** !`
              : `🎉 Félicitations ${g.winners.map((id) => `<@${id}>`).join(", ")} ! Vous avez gagné **${g.prize}** !`;
          await channel.send({
            content: congratText,
            reply: { messageReference: messageId, failIfNotExists: false },
          });
        } else {
          await channel.send({
            content: `😔 Personne ne participait au giveaway **${g.prize}**${early ? " (terminé manuellement)" : ""}.`,
            reply: { messageReference: messageId, failIfNotExists: false },
          });
        }
      }
    }
  } catch (err) {
    console.error("[giveaway] endGiveaway message update failed:", err);
  }

  return g;
}

/** Schedule the auto-end timer for a giveaway. */
export function scheduleGiveawayEnd(g: Giveaway, client: Client): void {
  if (g.ended) return;

  const delay = Math.max(0, g.endsAt - Date.now());

  const timer = setTimeout(() => {
    void endGiveaway(g.messageId, client).catch((err) =>
      console.error("[giveaway] auto-end failed:", err),
    );
  }, delay);

  timer.unref?.();
  activeTimers.set(g.messageId, timer);
}

/** Load persisted giveaways and re-schedule pending ones. Called at startup. */
export async function loadAndScheduleGiveaways(client: Client): Promise<void> {
  try {
    const db = await loadDb();
    const pending = Object.values(db).filter((g) => !g.ended);
    for (const g of pending) {
      if (g.endsAt <= Date.now()) {
        // Already expired — end immediately
        void endGiveaway(g.messageId, client).catch(() => {});
      } else {
        scheduleGiveawayEnd(g, client);
      }
    }
    if (pending.length > 0) {
      console.log(`[giveaway] Rescheduled ${pending.length} pending giveaway(s)`);
    }
  } catch (err) {
    console.error("[giveaway] loadAndScheduleGiveaways failed:", err);
  }
}

/** Create a giveaway: post the message, persist, schedule end. */
export async function createGiveaway(
  channel: TextChannel,
  hostId: string,
  prize: string,
  winnersCount: number,
  durationMs: number,
  client: Client,
): Promise<Giveaway> {
  const endsAt = Date.now() + durationMs;

  // Placeholder — we need the real messageId after posting
  const placeholder: Giveaway = {
    messageId: "__pending__",
    channelId: channel.id,
    guildId: channel.guild.id,
    hostId,
    prize,
    winnersCount,
    endsAt,
    ended: false,
    winners: [],
    participants: [],
  };

  const embed = buildEmbed(placeholder);
  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(`${GIVEAWAY_BUTTON_PREFIX}__pending__`)
      .setLabel(`🎉 Participer (0)`)
      .setStyle(ButtonStyle.Primary),
  );

  const msg = await channel.send({ embeds: [embed], components: [row] });

  const g: Giveaway = { ...placeholder, messageId: msg.id };

  // Fix the button customId with real messageId
  await msg.edit({
    embeds: [buildEmbed(g)],
    components: [buildButton(g)],
  });

  // Persist
  const db = await loadDb();
  db[g.messageId] = g;
  await saveDb(db);

  scheduleGiveawayEnd(g, client);

  return g;
}

/** Handle the 🎉 button click: toggle participation. */
export async function handleGiveawayButton(
  interaction: ButtonInteraction,
  client: Client,
): Promise<void> {
  const messageId = interaction.customId.slice(GIVEAWAY_BUTTON_PREFIX.length);
  const db = await loadDb();
  const g = db[messageId];

  if (!g || g.ended) {
    await interaction.reply({ content: "❌ Ce giveaway est terminé.", ephemeral: true });
    return;
  }

  const userId = interaction.user.id;
  const idx = g.participants.indexOf(userId);

  if (idx === -1) {
    g.participants.push(userId);
    await interaction.reply({
      content: `✅ Tu participes au giveaway **${g.prize}** !`,
      ephemeral: true,
    });
  } else {
    g.participants.splice(idx, 1);
    await interaction.reply({
      content: `↩️ Tu t'es retiré du giveaway **${g.prize}**.`,
      ephemeral: true,
    });
  }

  await saveDb(db);

  // Update message
  try {
    const channel = interaction.channel as TextChannel;
    const msg = await channel.messages.fetch(messageId).catch(() => null);
    if (msg) {
      await msg.edit({ embeds: [buildEmbed(g)], components: [buildButton(g)] });
    }
  } catch {
    // Non-critical
  }
}

/** Reroll: pick new winners from existing participants. */
export async function rerollGiveaway(
  messageId: string,
  client: Client,
): Promise<Giveaway | null> {
  const db = await loadDb();
  const g = db[messageId];
  if (!g || !g.ended) return null;

  g.winners = pickWinners(g.participants, g.winnersCount);
  await saveDb(db);

  try {
    const guild = client.guilds.cache.get(g.guildId) as Guild | undefined;
    const channel = guild?.channels.cache.get(g.channelId) as TextChannel | undefined;
    if (channel) {
      const msg = await channel.messages.fetch(messageId).catch(() => null);
      if (msg) {
        await msg.edit({ embeds: [buildEmbed(g, true)], components: [buildButton(g, true)] });
      }
      const congratText =
        g.winners.length > 0
          ? `🎲 **Reroll !** Nouveaux gagnant${g.winners.length > 1 ? "s" : ""} pour **${g.prize}** : ${g.winners.map((id) => `<@${id}>`).join(", ")} 🎉`
          : `😔 Toujours aucun participant pour le reroll de **${g.prize}**.`;
      await channel.send({
        content: congratText,
        reply: { messageReference: messageId, failIfNotExists: false },
      });
    }
  } catch (err) {
    console.error("[giveaway] rerollGiveaway message update failed:", err);
  }

  return g;
}

/** Get all active giveaways for a guild. */
export async function getActiveGiveaways(guildId: string): Promise<Giveaway[]> {
  const db = await loadDb();
  return Object.values(db).filter((g) => g.guildId === guildId && !g.ended);
}
