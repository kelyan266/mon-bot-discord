/**
 * music.ts — Lecture musicale via SoundCloud + @discordjs/voice
 *
 * Source : SoundCloud uniquement (YouTube/HLS CDN bloqués sur les IPs Replit prod).
 * Stream : API SoundCloud v2 → URL progressive MP3 → ffmpeg → OggOpus → Discord.
 *
 * Fonctionnalités :
 *  - File d'attente multi-serveur
 *  - Volume 0-200%
 *  - Loop : off | track | queue
 *  - Shuffle
 *  - Auto-leave si seul en vocal (60 s)
 */

import play from "play-dl";
import {
  joinVoiceChannel,
  createAudioPlayer,
  createAudioResource,
  AudioPlayerStatus,
  VoiceConnectionStatus,
  getVoiceConnection,
  entersState,
  type AudioPlayer,
  type AudioResource,
} from "@discordjs/voice";
import {
  EmbedBuilder,
  type ChatInputCommandInteraction,
  type Client,
  type Guild,
  type GuildMember,
  type VoiceBasedChannel,
} from "discord.js";

// ─────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────

export interface Track {
  url: string;
  title: string;
  durationFmt: string;
  thumbnail: string | null;
  requestedBy: string;
}

export type LoopMode = "off" | "track" | "queue";

interface GuildQueue {
  tracks: Track[];
  player: AudioPlayer;
  currentResource: AudioResource | null;
  voiceChannelId: string;
  textChannelId: string;
  destroying: boolean;
  volume: number;       // 0–200 (100 = normal)
  loop: LoopMode;
  shuffle: boolean;
  autoLeaveTimer: ReturnType<typeof setTimeout> | null;
}

// ─────────────────────────────────────────────
// Initialisation
// ─────────────────────────────────────────────

let scClientId: string | null = null;

export async function initMusic(): Promise<void> {
  try {
    const clientId = await play.getFreeClientID();
    play.setToken({ soundcloud: { client_id: clientId } });
    scClientId = clientId;
    console.log("[music] SoundCloud client_id initialisé.");
  } catch (err) {
    console.error("[music] Impossible d'initialiser SoundCloud :", (err as Error).message);
  }
}

// ─────────────────────────────────────────────
// State
// ─────────────────────────────────────────────

const queues = new Map<string, GuildQueue>();


// ─────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────

function fmtSeconds(s: number): string {
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
  return `${m}:${String(sec).padStart(2, "0")}`;
}

async function resolveTrack(query: string, requestedBy: string): Promise<Track | null> {
  try {
    const isUrl = /^https?:\/\//.test(query);
    let info: { url: string; title: string; durationInSec: number; thumbnail?: { url: string } } | null = null;

    if (isUrl) {
      if (play.yt_validate(query) === "video") return null; // YouTube bloqué
      const scInfo = await play.soundcloud(query);
      const thumb = "thumbnail" in scInfo && scInfo.thumbnail ? scInfo.thumbnail : undefined;
      info = {
        url: scInfo.url,
        title: scInfo.name,
        durationInSec: scInfo.durationInSec,
        thumbnail: thumb ? { url: thumb } : undefined,
      };
    } else {
      const results = await play.search(query, { source: { soundcloud: "tracks" }, limit: 1 });
      if (!results.length) return null;
      const r = results[0]!;
      info = {
        url: r.url,
        title: r.name,
        durationInSec: r.durationInSec,
        thumbnail: r.thumbnail ? { url: r.thumbnail } : undefined,
      };
    }

    if (!info) return null;
    return {
      url: info.url,
      title: info.title,
      durationFmt: fmtSeconds(info.durationInSec),
      thumbnail: info.thumbnail?.url ?? null,
      requestedBy,
    };
  } catch (err) {
    console.error("[music] resolveTrack:", (err as Error).message);
    return null;
  }
}

function shuffleArray<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j]!, a[i]!];
  }
  return a;
}

// ─────────────────────────────────────────────
// Auto-leave
// ─────────────────────────────────────────────

function clearAutoLeave(q: GuildQueue): void {
  if (q.autoLeaveTimer) {
    clearTimeout(q.autoLeaveTimer);
    q.autoLeaveTimer = null;
  }
}

function scheduleAutoLeave(guildId: string, delayMs = 60_000): void {
  const q = queues.get(guildId);
  if (!q) return;
  clearAutoLeave(q);
  q.autoLeaveTimer = setTimeout(() => {
    const current = queues.get(guildId);
    if (current && current.tracks.length === 0) {
      destroyQueue(guildId);
    }
  }, delayMs);
}

/** Call from VoiceStateUpdate — leaves if bot is alone in the channel. */
export function checkVoiceIdle(guildId: string, guild: Guild): void {
  const q = queues.get(guildId);
  if (!q) return;

  const channel = guild.channels.cache.get(q.voiceChannelId);
  if (!channel || !channel.isVoiceBased()) return;

  const humans = channel.members.filter((m) => !m.user.bot).size;
  if (humans === 0) {
    scheduleAutoLeave(guildId, 60_000);
  } else {
    const current = queues.get(guildId);
    if (current) clearAutoLeave(current);
  }
}

// ─────────────────────────────────────────────
// Queue management
// ─────────────────────────────────────────────

async function playNext(guildId: string): Promise<void> {
  const q = queues.get(guildId);
  if (!q || q.tracks.length === 0) {
    scheduleAutoLeave(guildId, 60_000);
    return;
  }

  const track = q.tracks[0]!;

  try {
    // play-dl handles SoundCloud auth internally (same token as search)
    const stream = await play.stream(track.url, { quality: 1 });

    const resource = createAudioResource(stream.stream, {
      inputType: stream.type,
      inlineVolume: true,
    });
    resource.volume?.setVolume(q.volume / 100);
    q.currentResource = resource;
    q.player.play(resource);
  } catch (err) {
    console.error("[music] playNext error:", (err as Error).message);
    q.tracks.shift();
    await playNext(guildId);
  }
}

function destroyQueue(guildId: string): void {
  const q = queues.get(guildId);
  if (q) {
    q.destroying = true;
    clearAutoLeave(q);
    q.player.stop(true);
    queues.delete(guildId);
  }
  const conn = getVoiceConnection(guildId);
  if (conn) conn.destroy();
}

// ─────────────────────────────────────────────
// Command handlers
// ─────────────────────────────────────────────

export async function handlePlay(interaction: ChatInputCommandInteraction): Promise<void> {
  await interaction.deferReply();

  const member = interaction.member as GuildMember;
  const voiceChannel = member.voice?.channel as VoiceBasedChannel | null;

  if (!voiceChannel) {
    await interaction.editReply({ content: "❌ Tu dois être dans un salon vocal." });
    return;
  }

  const query = interaction.options.getString("query", true);
  const guildId = interaction.guildId!;

  await interaction.editReply({ content: "🔍 Recherche en cours sur SoundCloud…" });
  const track = await resolveTrack(query, interaction.user.username);
  if (!track) {
    await interaction.editReply({
      content: "❌ Aucun résultat sur SoundCloud. Essaie un titre différent ou colle une URL SoundCloud directe.",
    });
    return;
  }

  let q = queues.get(guildId);

  if (!q) {
    const connection = joinVoiceChannel({
      channelId: voiceChannel.id,
      guildId,
      adapterCreator: interaction.guild!.voiceAdapterCreator,
      selfDeaf: true,
      selfMute: false,
    });

    try {
      await entersState(connection, VoiceConnectionStatus.Ready, 15_000);
    } catch {
      connection.destroy();
      await interaction.editReply({ content: "❌ Impossible de rejoindre le salon vocal (timeout)." });
      return;
    }

    const player = createAudioPlayer();
    connection.subscribe(player);

    q = {
      tracks: [],
      player,
      currentResource: null,
      voiceChannelId: voiceChannel.id,
      textChannelId: interaction.channelId,
      destroying: false,
      volume: 100,
      loop: "off",
      shuffle: false,
      autoLeaveTimer: null,
    };
    queues.set(guildId, q);

    connection.on(VoiceConnectionStatus.Disconnected, async () => {
      const current = queues.get(guildId);
      if (!current || current.destroying) return;
      try {
        await Promise.race([
          entersState(connection, VoiceConnectionStatus.Signalling, 20_000),
          entersState(connection, VoiceConnectionStatus.Connecting, 20_000),
        ]);
      } catch {
        destroyQueue(guildId);
      }
    });

    player.on(AudioPlayerStatus.Idle, () => {
      const current = queues.get(guildId);
      if (!current || current.destroying) return;

      const finished = current.tracks[0];

      if (current.loop === "track" && finished) {
        // Replay same track — keep it at position 0
        void playNext(guildId);
        return;
      }

      if (current.loop === "queue" && finished) {
        // Move current to end of queue
        current.tracks.push(current.tracks.shift()!);
      } else {
        current.tracks.shift();
      }

      if (current.shuffle && current.tracks.length > 1) {
        const [next, ...rest] = current.tracks;
        current.tracks = [next!, ...shuffleArray(rest)];
      }

      void playNext(guildId);
    });

    player.on("error", (err) => {
      console.error("[music] Player error:", err.message);
      const current = queues.get(guildId);
      if (!current || current.destroying) return;
      current.tracks.shift();
      void playNext(guildId);
    });
  } else if (q.voiceChannelId !== voiceChannel.id) {
    const conn = getVoiceConnection(guildId);
    if (conn) {
      conn.rejoin({ channelId: voiceChannel.id, selfDeaf: true, selfMute: false });
      q.voiceChannelId = voiceChannel.id;
    }
  }

  // Cancel any pending auto-leave
  clearAutoLeave(q);

  q.tracks.push(track);

  if (q.tracks.length === 1) {
    await playNext(guildId);
    await interaction.editReply({ embeds: [buildTrackEmbed("▶️ Lecture", track, q)] });
  } else {
    await interaction.editReply({
      embeds: [buildTrackEmbed(`📥 Ajouté à la file (#${q.tracks.length})`, track, q)],
    });
  }
}

export async function handleSkip(interaction: ChatInputCommandInteraction): Promise<void> {
  const guildId = interaction.guildId!;
  const q = queues.get(guildId);
  if (!q || q.tracks.length === 0) {
    await interaction.reply({ content: "❌ Aucune musique en cours.", ephemeral: true });
    return;
  }
  const skipped = q.tracks[0]!.title;
  // Override loop for manual skip — always advance
  q.tracks.shift();
  if (q.shuffle && q.tracks.length > 1) {
    const [next, ...rest] = q.tracks;
    q.tracks = [next!, ...shuffleArray(rest)];
  }
  await playNext(guildId);
  await interaction.reply({
    embeds: [new EmbedBuilder().setColor(0x5865f2).setDescription(`⏭️ **${skipped}** ignorée.`)],
  });
}

export async function handleStop(interaction: ChatInputCommandInteraction): Promise<void> {
  const guildId = interaction.guildId!;
  if (!queues.has(guildId)) {
    await interaction.reply({ content: "❌ Aucune musique en cours.", ephemeral: true });
    return;
  }
  destroyQueue(guildId);
  await interaction.reply({
    embeds: [new EmbedBuilder().setColor(0xed4245).setDescription("⏹️ Lecture arrêtée. À bientôt !")],
  });
}

export async function handlePause(interaction: ChatInputCommandInteraction): Promise<void> {
  const guildId = interaction.guildId!;
  const q = queues.get(guildId);
  if (!q) {
    await interaction.reply({ content: "❌ Aucune musique en cours.", ephemeral: true });
    return;
  }
  const paused = q.player.pause();
  await interaction.reply({
    embeds: [
      new EmbedBuilder()
        .setColor(0xfee75c)
        .setDescription(paused ? "⏸️ Musique mise en pause." : "❌ Impossible de mettre en pause."),
    ],
  });
}

export async function handleResume(interaction: ChatInputCommandInteraction): Promise<void> {
  const guildId = interaction.guildId!;
  const q = queues.get(guildId);
  if (!q) {
    await interaction.reply({ content: "❌ Aucune musique en cours.", ephemeral: true });
    return;
  }
  const resumed = q.player.unpause();
  await interaction.reply({
    embeds: [
      new EmbedBuilder()
        .setColor(0x57f287)
        .setDescription(resumed ? "▶️ Lecture reprise !" : "❌ La musique n'était pas en pause."),
    ],
  });
}

export async function handleQueue(interaction: ChatInputCommandInteraction): Promise<void> {
  const guildId = interaction.guildId!;
  const q = queues.get(guildId);
  if (!q || q.tracks.length === 0) {
    await interaction.reply({ content: "📭 La file est vide.", ephemeral: true });
    return;
  }
  const lines = q.tracks.slice(0, 10).map((t, i) =>
    i === 0
      ? `▶️ **${t.title}** \`${t.durationFmt}\` — *${t.requestedBy}*`
      : `\`${i + 1}.\` ${t.title} \`${t.durationFmt}\` — *${t.requestedBy}*`,
  );
  const more = q.tracks.length > 10 ? `\n*… et ${q.tracks.length - 10} autre(s)*` : "";
  const loopIcon = q.loop === "track" ? " 🔂" : q.loop === "queue" ? " 🔁" : "";
  const shuffleIcon = q.shuffle ? " 🔀" : "";
  await interaction.reply({
    embeds: [
      new EmbedBuilder()
        .setColor(0x5865f2)
        .setTitle(`🎵 File d'attente (${q.tracks.length} piste${q.tracks.length > 1 ? "s" : ""})${loopIcon}${shuffleIcon}`)
        .setDescription(lines.join("\n") + more)
        .setFooter({ text: `Volume: ${q.volume}%` }),
    ],
  });
}

export async function handleNowPlaying(interaction: ChatInputCommandInteraction): Promise<void> {
  const guildId = interaction.guildId!;
  const q = queues.get(guildId);
  const track = q?.tracks[0];
  if (!track) {
    await interaction.reply({ content: "❌ Aucune musique en cours.", ephemeral: true });
    return;
  }
  await interaction.reply({ embeds: [buildTrackEmbed("🎶 En cours", track, q!)] });
}

export async function handleVolume(interaction: ChatInputCommandInteraction): Promise<void> {
  const guildId = interaction.guildId!;
  const q = queues.get(guildId);
  const level = interaction.options.getInteger("niveau", true);

  if (!q) {
    await interaction.reply({ content: "❌ Aucune musique en cours.", ephemeral: true });
    return;
  }

  q.volume = level;
  // Apply immediately to current resource
  q.currentResource?.volume?.setVolume(level / 100);

  const bar = buildVolumeBar(level);
  await interaction.reply({
    embeds: [
      new EmbedBuilder()
        .setColor(0x5865f2)
        .setDescription(`🔊 Volume : **${level}%**\n${bar}`),
    ],
  });
}

export async function handleLoop(interaction: ChatInputCommandInteraction): Promise<void> {
  const guildId = interaction.guildId!;
  const q = queues.get(guildId);
  if (!q) {
    await interaction.reply({ content: "❌ Aucune musique en cours.", ephemeral: true });
    return;
  }

  const mode = interaction.options.getString("mode", true) as LoopMode;
  q.loop = mode;

  const icons: Record<LoopMode, string> = {
    off: "▶️ Lecture normale (pas de répétition)",
    track: "🔂 Répétition de la piste actuelle",
    queue: "🔁 Répétition de toute la file",
  };

  await interaction.reply({
    embeds: [
      new EmbedBuilder()
        .setColor(0x5865f2)
        .setDescription(`${icons[mode]}`),
    ],
  });
}

export async function handleShuffle(interaction: ChatInputCommandInteraction): Promise<void> {
  const guildId = interaction.guildId!;
  const q = queues.get(guildId);
  if (!q) {
    await interaction.reply({ content: "❌ Aucune musique en cours.", ephemeral: true });
    return;
  }

  q.shuffle = !q.shuffle;

  if (q.shuffle && q.tracks.length > 1) {
    const [current, ...rest] = q.tracks;
    q.tracks = [current!, ...shuffleArray(rest)];
  }

  await interaction.reply({
    embeds: [
      new EmbedBuilder()
        .setColor(0x5865f2)
        .setDescription(
          q.shuffle
            ? "🔀 Lecture aléatoire **activée** — la file a été mélangée."
            : "➡️ Lecture aléatoire **désactivée**.",
        ),
    ],
  });
}

// ─────────────────────────────────────────────
// Shared embed builder
// ─────────────────────────────────────────────

function buildVolumeBar(level: number): string {
  const filled = Math.round(level / 10);
  return "█".repeat(Math.min(filled, 20)) + "░".repeat(Math.max(0, 20 - filled));
}

function buildTrackEmbed(title: string, track: Track, q: GuildQueue): EmbedBuilder {
  const loopLabel = q.loop === "track" ? " · 🔂 Track" : q.loop === "queue" ? " · 🔁 Queue" : "";
  const shuffleLabel = q.shuffle ? " · 🔀 Shuffle" : "";

  const embed = new EmbedBuilder()
    .setColor(0x5865f2)
    .setTitle(title)
    .setDescription(`**[${track.title}](${track.url})**`)
    .addFields(
      { name: "⏱️ Durée", value: track.durationFmt, inline: true },
      { name: "👤 Demandé par", value: track.requestedBy, inline: true },
      { name: "🔊 Volume", value: `${q.volume}%`, inline: true },
    )
    .setFooter({ text: `SoundCloud${loopLabel}${shuffleLabel}` });

  if (track.thumbnail) embed.setThumbnail(track.thumbnail);
  return embed;
}
