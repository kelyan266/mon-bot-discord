/**
 * music.ts — Lecture musicale via play-dl (SoundCloud) + @discordjs/voice
 *
 * Source : SoundCloud via play-dl (HTTP natif Node.js — pas de processus externe).
 * yt-dlp était bloqué en prod car les sites audio sont filtrés au niveau réseau.
 * play-dl utilise l'API SoundCloud directement via fetch, ce qui contourne le blocage.
 *
 * Architecture :
 *  - Métadonnées + stream → play.search() / play.stream()
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
  StreamType,
  type AudioPlayer,
} from "@discordjs/voice";
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
  destroying: boolean;
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

/**
 * Resolve a search query or URL into a Track via play-dl (SoundCloud).
 */
async function resolveTrack(query: string, requestedBy: string): Promise<Track | null> {
  try {
    const isUrl = /^https?:\/\//.test(query);

    let info: { url: string; title: string; durationInSec: number; thumbnail?: { url: string } } | null = null;

    if (isUrl) {
      // Direct SoundCloud URL
      const validated = play.yt_validate(query);
      if (validated === "video") {
        // YouTube URL — won't work in prod, reject early
        return null;
      }
      const scInfo = await play.soundcloud(query);
      // SoundCloud returns SoundCloudTrack | SoundCloudPlaylist; thumbnail only on tracks
      const thumb = "thumbnail" in scInfo && scInfo.thumbnail ? scInfo.thumbnail : undefined;
      info = {
        url: scInfo.url,
        title: scInfo.name,
        durationInSec: scInfo.durationInSec,
        thumbnail: thumb ? { url: thumb } : undefined,
      };
    } else {
      // Text search → SoundCloud
      const results = await play.search(query, {
        source: { soundcloud: "tracks" },
        limit: 1,
      });
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
    console.error("[music] resolveTrack error:", (err as Error).message);
    return null;
  }
}

// ─────────────────────────────────────────────
// Queue management
// ─────────────────────────────────────────────

async function playNext(guildId: string): Promise<void> {
  const q = queues.get(guildId);
  if (!q || q.tracks.length === 0) {
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
  } catch (err) {
    console.error("[music] playNext stream error:", (err as Error).message);
    q.tracks.shift();
    await playNext(guildId);
  }
}

function destroyQueue(guildId: string): void {
  const q = queues.get(guildId);
  if (q) {
    q.destroying = true;
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

  await interaction.editReply({ content: "🔍 Recherche en cours…" });
  const track = await resolveTrack(query, interaction.user.username);
  if (!track) {
    await interaction.editReply({
      content: "❌ Aucun résultat trouvé sur SoundCloud. Essaie un titre différent ou colle une URL SoundCloud directe.",
    });
    return;
  }

  let q = queues.get(guildId);

  if (!q) {
    const connection = joinVoiceChannel({
      channelId: voiceChannel.id,
      guildId,
      adapterCreator: interaction.guild!.voiceAdapterCreator,
      selfDeaf: false,
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
      voiceChannelId: voiceChannel.id,
      textChannelId: interaction.channelId,
      destroying: false,
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
      current.tracks.shift();
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
      conn.rejoin({ channelId: voiceChannel.id, selfDeaf: false, selfMute: false });
      q.voiceChannelId = voiceChannel.id;
    }
  }

  q.tracks.push(track);

  if (q.tracks.length === 1) {
    await playNext(guildId);
    await interaction.editReply({ embeds: [buildTrackEmbed("▶️ Lecture", track)] });
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
