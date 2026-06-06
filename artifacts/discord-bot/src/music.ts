/**
 * music.ts — Lecture musicale via @discordjs/voice + play-dl
 *
 * Commandes exposées : play, skip, stop, pause, resume, queue, nowplaying
 */
import {
  joinVoiceChannel,
  createAudioPlayer,
  createAudioResource,
  AudioPlayerStatus,
  VoiceConnectionStatus,
  getVoiceConnection,
  entersState,
  type AudioPlayer,
  type VoiceConnection,
  StreamType,
} from "@discordjs/voice";
import play from "play-dl";
import {
  EmbedBuilder,
  type ChatInputCommandInteraction,
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

interface GuildQueue {
  tracks: Track[];
  player: AudioPlayer;
  voiceChannelId: string;
  textChannelId: string;
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

/** Resolve a YouTube URL or search query → Track */
async function resolveTrack(query: string, requestedBy: string): Promise<Track | null> {
  try {
    // Direct YouTube URL
    if (/^https?:\/\/(www\.)?(youtube\.com|youtu\.be)/.test(query)) {
      const info = await play.video_info(query);
      const d = info.video_details;
      return {
        url: d.url,
        title: d.title ?? "Titre inconnu",
        durationFmt: fmtSeconds(d.durationInSec),
        thumbnail: d.thumbnails?.[0]?.url ?? null,
        requestedBy,
      };
    }

    // Search
    const results = await play.search(query, { source: { youtube: "video" }, limit: 1 });
    const v = results[0];
    if (!v) return null;
    return {
      url: v.url,
      title: v.title ?? "Titre inconnu",
      durationFmt: fmtSeconds(v.durationInSec ?? 0),
      thumbnail: v.thumbnails?.[0]?.url ?? null,
      requestedBy,
    };
  } catch {
    return null;
  }
}

/** Start playing the next track in the queue */
async function playNext(guildId: string): Promise<void> {
  const q = queues.get(guildId);
  if (!q || q.tracks.length === 0) {
    // Queue empty — leave voice
    destroyQueue(guildId);
    return;
  }

  const track = q.tracks[0]!;

  try {
    const stream = await play.stream(track.url, { discordPlayerCompatibility: true });
    const resource = createAudioResource(stream.stream, {
      inputType: stream.type as StreamType,
    });
    q.player.play(resource);
  } catch {
    // Skip broken track and try the next one
    q.tracks.shift();
    await playNext(guildId);
  }
}

function destroyQueue(guildId: string): void {
  const q = queues.get(guildId);
  if (q) {
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

  const track = await resolveTrack(query, interaction.user.username);
  if (!track) {
    await interaction.editReply({ content: "❌ Aucun résultat trouvé pour cette recherche." });
    return;
  }

  let q = queues.get(guildId);

  if (!q) {
    // Create a new connection + player
    const connection = joinVoiceChannel({
      channelId: voiceChannel.id,
      guildId,
      adapterCreator: interaction.guild!.voiceAdapterCreator,
    });

    const player = createAudioPlayer();
    connection.subscribe(player);

    q = {
      tracks: [],
      player,
      voiceChannelId: voiceChannel.id,
      textChannelId: interaction.channelId,
    };
    queues.set(guildId, q);

    // Auto-disconnect on network errors
    connection.on(VoiceConnectionStatus.Disconnected, async () => {
      try {
        await Promise.race([
          entersState(connection, VoiceConnectionStatus.Signalling, 5_000),
          entersState(connection, VoiceConnectionStatus.Connecting, 5_000),
        ]);
      } catch {
        destroyQueue(guildId);
      }
    });

    // Advance queue when a track finishes
    player.on(AudioPlayerStatus.Idle, () => {
      const current = queues.get(guildId);
      if (!current) return;
      current.tracks.shift();
      void playNext(guildId);
    });

    player.on("error", () => {
      const current = queues.get(guildId);
      if (!current) return;
      current.tracks.shift();
      void playNext(guildId);
    });
  } else if (q.voiceChannelId !== voiceChannel.id) {
    // Move bot to caller's channel
    const conn = getVoiceConnection(guildId);
    if (conn) {
      conn.joinConfig.channelId = voiceChannel.id;
      conn.rejoin({ channelId: voiceChannel.id, selfDeaf: true, selfMute: false });
      q.voiceChannelId = voiceChannel.id;
    }
  }

  q.tracks.push(track);

  const isFirst = q.tracks.length === 1;

  if (isFirst) {
    await playNext(guildId);
    await interaction.editReply({
      embeds: [buildTrackEmbed("▶️ Lecture", track)],
    });
  } else {
    await interaction.editReply({
      embeds: [buildTrackEmbed(`📥 Ajouté à la file (#${q.tracks.length})`, track)],
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
  q.tracks.shift();
  await playNext(guildId);
  await interaction.reply({
    embeds: [
      new EmbedBuilder()
        .setColor(0x5865f2)
        .setDescription(`⏭️ **${skipped}** ignorée.`),
    ],
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
    embeds: [
      new EmbedBuilder()
        .setColor(0xed4245)
        .setDescription("⏹️ Lecture arrêtée. À bientôt !"),
    ],
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

  await interaction.reply({
    embeds: [
      new EmbedBuilder()
        .setColor(0x5865f2)
        .setTitle(`🎵 File d'attente (${q.tracks.length} piste${q.tracks.length > 1 ? "s" : ""})`)
        .setDescription(lines.join("\n") + more),
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
  await interaction.reply({ embeds: [buildTrackEmbed("🎶 En cours", track)] });
}

// ─────────────────────────────────────────────
// Shared embed builder
// ─────────────────────────────────────────────

function buildTrackEmbed(title: string, track: Track): EmbedBuilder {
  const embed = new EmbedBuilder()
    .setColor(0x5865f2)
    .setTitle(title)
    .setDescription(`**[${track.title}](${track.url})**`)
    .addFields(
      { name: "⏱️ Durée", value: track.durationFmt, inline: true },
      { name: "👤 Demandé par", value: track.requestedBy, inline: true },
    );
  if (track.thumbnail) embed.setThumbnail(track.thumbnail);
  return embed;
}
