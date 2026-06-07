/**
 * music.ts — Lecture musicale via Lavalink + lavalink-client
 *
 * Source : YouTube en priorité (SoundCloud en fallback) via des nœuds Lavalink
 * publics hébergés hors Replit → aucune restriction d'IP.
 *
 * Fonctionnalités :
 *  - File d'attente multi-serveur
 *  - Volume 0-200%
 *  - Loop : off | track | queue
 *  - Shuffle (mélange instantané)
 *  - Auto-leave si seul en vocal (60 s)
 */

import { LavalinkManager, type Track } from "lavalink-client";
import {
  EmbedBuilder,
  type ChatInputCommandInteraction,
  type Client,
  type Guild,
  type GuildMember,
} from "discord.js";

// ─────────────────────────────────────────────
// State
// ─────────────────────────────────────────────

let lavalink: LavalinkManager | null = null;
let discordClient: Client | null = null;
const autoLeaveTimers = new Map<string, ReturnType<typeof setTimeout>>();
const shuffleModes = new Map<string, boolean>(); // guildId → shuffle actif

// ─────────────────────────────────────────────
// Init
// ─────────────────────────────────────────────

export async function initMusic(client: Client): Promise<void> {
  discordClient = client;
  lavalink = new LavalinkManager({
    nodes: [
      // Nœud principal (env override possible)
      {
        id: "main",
        host: process.env.LAVALINK_HOST ?? "lavalink.jirayu.net",
        port: parseInt(process.env.LAVALINK_PORT ?? "13592"),
        authorization: process.env.LAVALINK_PASSWORD ?? "youshallnotpass",
        secure: false,
        retryDelay: 5000,
        retryAmount: 3,
      },
      // Nœuds de fallback publics v4
      {
        id: "fallback1",
        host: "v4.lavalink.rocks",
        port: 443,
        authorization: "horizxon.tech",
        secure: true,
        retryDelay: 5000,
        retryAmount: 3,
      },
      {
        id: "fallback2",
        host: "lavalink.darrennathanael.com",
        port: 443,
        authorization: "aaaa",
        secure: true,
        retryDelay: 5000,
        retryAmount: 3,
      },
    ],
    sendToShard: (guildId: string, payload: unknown) => {
      const guild = client.guilds.cache.get(guildId);
      guild?.shard?.send(payload);
    },
    client: { id: client.user!.id, username: client.user!.username ?? "Bot" },
    autoSkip: true,
    playerOptions: {
      // SoundCloud en priorité — YouTube streaming souvent bloqué sur nœuds publics
      defaultSearchPlatform: "scsearch",
    },
  });

  lavalink.nodeManager.on("error", (_node, error) => {
    console.error("[music] Lavalink node error:", (error as Error).message);
  });

  lavalink.nodeManager.on("connect", (node) => {
    console.log(`[music] Lavalink connecté: ${node.options.host}`);
  });

  lavalink.nodeManager.on("disconnect", (node) => {
    console.warn(`[music] Lavalink déconnecté: ${node.options.host}`);
  });

  // Player events — pour diagnostiquer l'absence de son
  lavalink.on("trackStart", (player, track) => {
    console.log(`[music] trackStart guild=${player.guildId} track="${track?.info.title ?? "inconnu"}"`);
  });

  lavalink.on("trackEnd", (player, track, payload) => {
    console.log(`[music] trackEnd guild=${player.guildId} track="${track?.info.title ?? "inconnu"}" reason=${payload.reason}`);
  });

  lavalink.on("trackError", (player, track, payload) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const exc = (payload as any)?.exception;
    const msg = exc?.message ?? exc?.cause ?? "erreur inconnue";
    console.error(`[music] trackError guild=${player.guildId} track="${track?.info.title ?? "inconnu"}" message="${msg}" severity=${exc?.severity ?? "?"}`);

    if (player.textChannelId && discordClient) {
      const ch = discordClient.channels.cache.get(player.textChannelId);
      if (ch && "send" in ch && typeof (ch as { send?: unknown }).send === "function") {
        void (ch as { send: (opts: unknown) => Promise<unknown> }).send({
          embeds: [
            new EmbedBuilder()
              .setColor(0xed4245)
              .setTitle("❌ Erreur de lecture")
              .setDescription(
                `Impossible de lire **${track?.info.title ?? "cette piste"}**.\n\`${msg}\`\n\nEssaie une autre source ou un autre titre.`,
              ),
          ],
        });
      }
    }
  });

  lavalink.on("trackStuck", (player, track, payload) => {
    console.warn(`[music] trackStuck guild=${player.guildId} track="${track?.info.title ?? "inconnu"}" threshold=${payload.thresholdMs}ms`);
  });

  lavalink.on("playerSocketClosed", (player, payload) => {
    console.warn(`[music] playerSocketClosed guild=${player.guildId} code=${payload.code} reason="${payload.reason}" byRemote=${payload.byRemote}`);
  });

  try {
    await lavalink.init({ id: client.user!.id, username: client.user!.username ?? "Bot" });
    console.log("[music] Lavalink initialisé.");
  } catch (err) {
    console.error("[music] Lavalink init échoué (music désactivée):", (err as Error).message);
    lavalink = null;
  }
}

export function getLavalinkManager(): LavalinkManager | null {
  return lavalink;
}

// ─────────────────────────────────────────────
// Auto-leave
// ─────────────────────────────────────────────

function clearAutoLeave(guildId: string): void {
  const timer = autoLeaveTimers.get(guildId);
  if (timer) {
    clearTimeout(timer);
    autoLeaveTimers.delete(guildId);
  }
}

function scheduleAutoLeave(guildId: string, delayMs = 60_000): void {
  clearAutoLeave(guildId);
  const timer = setTimeout(() => {
    autoLeaveTimers.delete(guildId);
    shuffleModes.delete(guildId);
    const player = lavalink?.players.get(guildId);
    if (player && !player.playing) {
      void player.destroy();
    }
  }, delayMs);
  autoLeaveTimers.set(guildId, timer);
}

/** Appelé depuis VoiceStateUpdate — quitte si le bot est seul 60 s. */
export function checkVoiceIdle(guildId: string, guild: Guild): void {
  if (!lavalink) return;
  const player = lavalink.players.get(guildId);
  if (!player || !player.voiceChannelId) return;

  const channel = guild.channels.cache.get(player.voiceChannelId);
  if (!channel?.isVoiceBased()) return;

  const humans = channel.members.filter((m) => !m.user.bot).size;
  if (humans === 0) {
    scheduleAutoLeave(guildId);
  } else {
    clearAutoLeave(guildId);
  }
}

// ─────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────

function fmtMs(ms: number): string {
  const s = Math.floor(ms / 1000);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (h > 0)
    return `${h}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
  return `${m}:${String(sec).padStart(2, "0")}`;
}

function buildVolumeBar(level: number): string {
  const filled = Math.round(level / 10);
  return "█".repeat(Math.min(filled, 20)) + "░".repeat(Math.max(0, 20 - filled));
}

function buildTrackEmbed(
  title: string,
  track: Track,
  volume: number,
  repeatMode = "off",
  shuffled = false,
): EmbedBuilder {
  const loopLabel =
    repeatMode === "track"
      ? " · 🔂 Track"
      : repeatMode === "queue"
        ? " · 🔁 Queue"
        : "";
  const shuffleLabel = shuffled ? " · 🔀 Shuffle" : "";
  const source =
    track.info.sourceName === "soundcloud" ? "SoundCloud" : "YouTube";

  const embed = new EmbedBuilder()
    .setColor(0x5865f2)
    .setTitle(title)
    .setDescription(`**[${track.info.title}](${track.info.uri ?? ""})**`)
    .addFields(
      { name: "⏱️ Durée", value: fmtMs(track.info.duration), inline: true },
      { name: "👤 Artiste", value: track.info.author, inline: true },
      { name: "🔊 Volume", value: `${volume}%`, inline: true },
    )
    .setFooter({ text: `${source}${loopLabel}${shuffleLabel}` });

  if (track.info.artworkUrl) embed.setThumbnail(track.info.artworkUrl);
  return embed;
}

// ─────────────────────────────────────────────
// Command handlers
// ─────────────────────────────────────────────

export async function handlePlay(
  interaction: ChatInputCommandInteraction,
): Promise<void> {
  await interaction.deferReply();

  if (!lavalink) {
    await interaction.editReply({ content: "❌ Lavalink non initialisé." });
    return;
  }

  const member = interaction.member as GuildMember;
  const voiceChannel = member.voice?.channel;

  if (!voiceChannel) {
    await interaction.editReply({ content: "❌ Tu dois être dans un salon vocal." });
    return;
  }

  const query = interaction.options.getString("query", true);
  const guildId = interaction.guildId!;

  // Obtenir ou créer le player
  let player = lavalink.players.get(guildId);
  if (!player) {
    player = lavalink.createPlayer({
      guildId,
      voiceChannelId: voiceChannel.id,
      textChannelId: interaction.channelId,
      selfDeaf: true,
      volume: 100,
    });
  }

  if (!player.connected) {
    await player.connect();
  }

  await interaction.editReply({ content: "🔍 Recherche en cours…" });

  // SoundCloud en priorité (streaming stable) → YouTube en fallback
  let result = await player.search({ query, source: "scsearch" }, interaction.user);

  if (
    !result.tracks.length ||
    result.loadType === "error" ||
    result.loadType === "empty"
  ) {
    result = await player.search({ query, source: "ytsearch" }, interaction.user);
  }

  if (!result.tracks.length || result.loadType === "error") {
    await interaction.editReply({
      content: "❌ Aucun résultat trouvé. Essaie un autre titre ou colle une URL.",
    });
    if (!player.playing && !player.paused) await player.destroy().catch(() => {});
    return;
  }

  clearAutoLeave(guildId);

  const track = result.tracks[0]! as Track;
  await player.queue.add(track);

  const wasAlreadyPlaying = player.playing || player.paused;
  if (!wasAlreadyPlaying) {
    await player.play({ paused: false });
  }

  const queuePos = wasAlreadyPlaying ? player.queue.tracks.length : 1;
  const embedTitle = wasAlreadyPlaying
    ? `📥 Ajouté à la file (#${queuePos})`
    : "▶️ Lecture";

  const volume = player.volume ?? 100;
  const repeatMode = (player.repeatMode as string | undefined) ?? "off";
  const shuffled = shuffleModes.get(guildId) ?? false;

  await interaction.editReply({
    embeds: [buildTrackEmbed(embedTitle, track, volume, repeatMode, shuffled)],
  });
}

export async function handleSkip(
  interaction: ChatInputCommandInteraction,
): Promise<void> {
  const guildId = interaction.guildId!;
  const player = lavalink?.players.get(guildId);

  if (!player || (!player.playing && !player.paused)) {
    await interaction.reply({
      content: "❌ Aucune musique en cours.",
      ephemeral: true,
    });
    return;
  }

  const skipped = player.queue.current?.info.title ?? "Piste inconnue";
  await player.skip();

  await interaction.reply({
    embeds: [
      new EmbedBuilder()
        .setColor(0x5865f2)
        .setDescription(`⏭️ **${skipped}** ignorée.`),
    ],
  });
}

export async function handleStop(
  interaction: ChatInputCommandInteraction,
): Promise<void> {
  const guildId = interaction.guildId!;
  const player = lavalink?.players.get(guildId);

  if (!player) {
    await interaction.reply({
      content: "❌ Aucune musique en cours.",
      ephemeral: true,
    });
    return;
  }

  clearAutoLeave(guildId);
  shuffleModes.delete(guildId);
  await player.destroy();

  await interaction.reply({
    embeds: [
      new EmbedBuilder()
        .setColor(0xed4245)
        .setDescription("⏹️ Lecture arrêtée. À bientôt !"),
    ],
  });
}

export async function handlePause(
  interaction: ChatInputCommandInteraction,
): Promise<void> {
  const guildId = interaction.guildId!;
  const player = lavalink?.players.get(guildId);

  if (!player || !player.playing) {
    await interaction.reply({
      content: "❌ Aucune musique en cours.",
      ephemeral: true,
    });
    return;
  }

  await player.pause();
  await interaction.reply({
    embeds: [
      new EmbedBuilder()
        .setColor(0xfee75c)
        .setDescription("⏸️ Musique mise en pause."),
    ],
  });
}

export async function handleResume(
  interaction: ChatInputCommandInteraction,
): Promise<void> {
  const guildId = interaction.guildId!;
  const player = lavalink?.players.get(guildId);

  if (!player || !player.paused) {
    await interaction.reply({
      content: "❌ La musique n'est pas en pause.",
      ephemeral: true,
    });
    return;
  }

  await player.resume();
  await interaction.reply({
    embeds: [
      new EmbedBuilder()
        .setColor(0x57f287)
        .setDescription("▶️ Lecture reprise !"),
    ],
  });
}

export async function handleQueue(
  interaction: ChatInputCommandInteraction,
): Promise<void> {
  const guildId = interaction.guildId!;
  const player = lavalink?.players.get(guildId);

  if (!player || !player.queue.current) {
    await interaction.reply({ content: "📭 La file est vide.", ephemeral: true });
    return;
  }

  const current = player.queue.current;
  const upcoming = player.queue.tracks;
  const volume = player.volume ?? 100;
  const repeatMode = (player.repeatMode as string | undefined) ?? "off";
  const shuffled = shuffleModes.get(guildId) ?? false;

  const lines: string[] = [
    `▶️ **${current.info.title}** \`${fmtMs(current.info.duration)}\` — *${current.info.author}*`,
    ...upcoming
      .slice(0, 9)
      .map(
        (t, i) =>
          `\`${i + 2}.\` ${t.info.title} \`${fmtMs((t as Track).info.duration)}\` — *${t.info.author}*`,
      ),
  ];
  const more =
    upcoming.length > 9 ? `\n*… et ${upcoming.length - 9} autre(s)*` : "";

  const loopIcon =
    repeatMode === "track" ? " 🔂" : repeatMode === "queue" ? " 🔁" : "";
  const shuffleIcon = shuffled ? " 🔀" : "";
  const total = 1 + upcoming.length;

  await interaction.reply({
    embeds: [
      new EmbedBuilder()
        .setColor(0x5865f2)
        .setTitle(
          `🎵 File d'attente (${total} piste${total > 1 ? "s" : ""})${loopIcon}${shuffleIcon}`,
        )
        .setDescription(lines.join("\n") + more)
        .setFooter({ text: `Volume: ${volume}%` }),
    ],
  });
}

export async function handleNowPlaying(
  interaction: ChatInputCommandInteraction,
): Promise<void> {
  const guildId = interaction.guildId!;
  const player = lavalink?.players.get(guildId);
  const track = player?.queue.current;

  if (!track) {
    await interaction.reply({
      content: "❌ Aucune musique en cours.",
      ephemeral: true,
    });
    return;
  }

  const volume = player!.volume ?? 100;
  const repeatMode = (player!.repeatMode as string | undefined) ?? "off";
  const shuffled = shuffleModes.get(guildId) ?? false;

  await interaction.reply({
    embeds: [buildTrackEmbed("🎶 En cours", track, volume, repeatMode, shuffled)],
  });
}

export async function handleVolume(
  interaction: ChatInputCommandInteraction,
): Promise<void> {
  const guildId = interaction.guildId!;
  const player = lavalink?.players.get(guildId);
  const level = interaction.options.getInteger("niveau", true);

  if (!player) {
    await interaction.reply({
      content: "❌ Aucune musique en cours.",
      ephemeral: true,
    });
    return;
  }

  await player.setVolume(level, true);

  await interaction.reply({
    embeds: [
      new EmbedBuilder()
        .setColor(0x5865f2)
        .setDescription(`🔊 Volume : **${level}%**\n${buildVolumeBar(level)}`),
    ],
  });
}

export async function handleLoop(
  interaction: ChatInputCommandInteraction,
): Promise<void> {
  const guildId = interaction.guildId!;
  const player = lavalink?.players.get(guildId);

  if (!player) {
    await interaction.reply({
      content: "❌ Aucune musique en cours.",
      ephemeral: true,
    });
    return;
  }

  const mode = interaction.options.getString("mode", true) as
    | "off"
    | "track"
    | "queue";
  await player.setRepeatMode(mode);

  const icons: Record<string, string> = {
    off: "▶️ Lecture normale (pas de répétition)",
    track: "🔂 Répétition de la piste actuelle",
    queue: "🔁 Répétition de toute la file",
  };

  await interaction.reply({
    embeds: [
      new EmbedBuilder()
        .setColor(0x5865f2)
        .setDescription(icons[mode] ?? "Mode mis à jour."),
    ],
  });
}

export async function handleShuffle(
  interaction: ChatInputCommandInteraction,
): Promise<void> {
  const guildId = interaction.guildId!;
  const player = lavalink?.players.get(guildId);

  if (!player) {
    await interaction.reply({
      content: "❌ Aucune musique en cours.",
      ephemeral: true,
    });
    return;
  }

  const current = shuffleModes.get(guildId) ?? false;
  shuffleModes.set(guildId, !current);

  if (!current && player.queue.tracks.length > 1) {
    await player.queue.shuffle();
  }

  await interaction.reply({
    embeds: [
      new EmbedBuilder()
        .setColor(0x5865f2)
        .setDescription(
          !current
            ? "🔀 Lecture aléatoire **activée** — la file a été mélangée."
            : "➡️ Lecture aléatoire **désactivée**.",
        ),
    ],
  });
}
