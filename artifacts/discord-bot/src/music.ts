/**
 * music.ts — Lecture musicale via yt-dlp + @discordjs/voice
 *
 * play-dl était bloqué par YouTube ("Sign in to confirm you're not a bot").
 * yt-dlp contourne cette détection de manière fiable avec son propre client.
 *
 * Architecture :
 *  - Métadonnées (titre, durée, thumbnail) → yt-dlp --print-json --no-download
 *  - Stream audio                           → yt-dlp -o - stdout | ffmpeg → Opus
 */
import { spawn, type ChildProcess } from "node:child_process";
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
  currentProc?: ChildProcess;
}

interface YtDlpInfo {
  webpage_url?: string;
  url?: string;
  title?: string;
  duration?: number;
  thumbnail?: string;
  thumbnails?: Array<{ url: string }>;
}

// ─────────────────────────────────────────────
// State
// ─────────────────────────────────────────────

const queues = new Map<string, GuildQueue>();

// ─────────────────────────────────────────────
// yt-dlp helpers
// ─────────────────────────────────────────────

function fmtSeconds(s: number): string {
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
  return `${m}:${String(sec).padStart(2, "0")}`;
}

/** Fetch video metadata via yt-dlp (no download). Works for URLs and search queries. */
async function resolveTrack(query: string, requestedBy: string): Promise<Track | null> {
  return new Promise((resolve) => {
    const isUrl = /^https?:\/\//.test(query);
    const target = isUrl ? query : `ytsearch1:${query}`;

    const args = [
      "--print-json",
      "--no-download",
      "--quiet",
      "--no-playlist",
      "--socket-timeout", "10",
      "--extractor-args", "youtube:player_client=android,ios",
      target,
    ];

    const proc = spawn("yt-dlp", args);
    let stdout = "";
    let stderr = "";
    proc.stdout.on("data", (d: Buffer) => (stdout += d.toString()));
    proc.stderr.on("data", (d: Buffer) => (stderr += d.toString()));

    const timeout = setTimeout(() => {
      proc.kill();
      console.error("[music] yt-dlp info timeout");
      resolve(null);
    }, 15_000);

    proc.on("close", (code) => {
      clearTimeout(timeout);
      if (code !== 0) {
        console.error("[music] yt-dlp info error:", stderr.trim().split("\n")[0]);
        resolve(null);
        return;
      }
      try {
        // yt-dlp may print multiple JSON lines for playlists; take the first
        const firstLine = stdout.trim().split("\n")[0];
        if (!firstLine) { resolve(null); return; }
        const info = JSON.parse(firstLine) as YtDlpInfo;
        const url = info.webpage_url ?? info.url ?? query;
        const thumbnail =
          info.thumbnail ??
          info.thumbnails?.[info.thumbnails.length - 1]?.url ??
          null;
        resolve({
          url,
          title: info.title ?? "Titre inconnu",
          durationFmt: fmtSeconds(info.duration ?? 0),
          thumbnail,
          requestedBy,
        });
      } catch (e) {
        console.error("[music] yt-dlp JSON parse error:", e);
        resolve(null);
      }
    });
  });
}

/**
 * Spawn yt-dlp to download audio to stdout.
 * @discordjs/voice + FFmpeg (StreamType.Arbitrary) handles the transcoding.
 */
function spawnAudioStream(url: string): ChildProcess {
  return spawn("yt-dlp", [
    "-o", "-",
    "-f", "bestaudio/best",
    "--quiet",
    "--no-playlist",
    "--no-warnings",
    "--socket-timeout", "10",
    "--extractor-args", "youtube:player_client=android,ios",
    url,
  ]);
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

  // Kill any previous yt-dlp process
  q.currentProc?.kill();
  q.currentProc = undefined;

  try {
    const proc = spawnAudioStream(track.url);
    q.currentProc = proc;

    // Log yt-dlp stderr for debugging
    proc.stderr?.on("data", (d: Buffer) => {
      const msg = d.toString().trim();
      if (msg) console.error("[music] yt-dlp:", msg);
    });

    // If yt-dlp exits with error before the stream is consumed, skip track
    proc.on("error", (err) => {
      console.error("[music] yt-dlp spawn error:", err.message);
      const current = queues.get(guildId);
      if (!current || current.destroying) return;
      current.tracks.shift();
      void playNext(guildId);
    });

    const resource = createAudioResource(proc.stdout!, {
      inputType: StreamType.Arbitrary, // FFmpeg transcodes to Opus
    });

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
    q.currentProc?.kill();
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

  // Resolve metadata BEFORE joining voice
  await interaction.editReply({ content: "🔍 Recherche en cours…" });
  const track = await resolveTrack(query, interaction.user.username);
  if (!track) {
    await interaction.editReply({ content: "❌ Aucun résultat trouvé (YouTube peut bloquer temporairement — réessaie dans quelques secondes)." });
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

    // Reconnect on unexpected network drops
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

    // Advance queue when a track finishes
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
  q.currentProc?.kill();
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
