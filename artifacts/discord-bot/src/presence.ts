import {
  ActivityType,
  EmbedBuilder,
  type Activity,
  type GuildMember,
  type Collection,
  type Snowflake,
} from "discord.js";

// ──────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────

function progressBar(current: number, total: number, length = 18): string {
  if (total <= 0) return "░".repeat(length);
  const filled = Math.min(Math.round((current / total) * length), length);
  return "▰".repeat(filled) + "▱".repeat(length - filled);
}

function fmtMs(ms: number): string {
  const s = Math.floor(ms / 1000);
  const m = Math.floor(s / 60);
  const h = Math.floor(m / 60);
  if (h > 0) return `${h}h${String(m % 60).padStart(2, "0")}m`;
  return `${m}:${String(s % 60).padStart(2, "0")}`;
}

function fmtDuration(ms: number): string {
  const s = Math.floor(ms / 1000);
  const m = Math.floor(s / 60);
  const h = Math.floor(m / 60);
  if (h > 0) return `${h}h ${m % 60}min`;
  if (m > 0) return `${m}min`;
  return `${s}s`;
}

const PLATFORM_EMOJI: Record<string, string> = {
  desktop: "🖥️",
  mobile: "📱",
  web: "🌐",
};

export function getPlatformEmoji(member: GuildMember): string {
  const s = member.presence?.clientStatus;
  if (!s) return "";
  const platforms = Object.keys(s) as Array<keyof typeof s>;
  return platforms.map((p) => PLATFORM_EMOJI[p] ?? "").join(" ");
}

// ──────────────────────────────────────────────
// Spotify embed
// ──────────────────────────────────────────────

export function buildSpotifyEmbed(activity: Activity, member: GuildMember): EmbedBuilder {
  const now = Date.now();
  const start = activity.timestamps?.start?.getTime() ?? now;
  const end = activity.timestamps?.end?.getTime() ?? now + 1;
  const duration = end - start;
  const elapsed = Math.max(0, now - start);
  const progress = Math.min(elapsed / duration, 1);

  const bar = progressBar(elapsed, duration);
  const elapsedFmt = fmtMs(elapsed);
  const totalFmt = fmtMs(duration);

  const track = activity.details ?? "Titre inconnu";
  const artists = activity.state ?? "Artiste inconnu";
  const album = activity.assets?.largeText ?? "";
  const coverUrl = activity.assets?.largeImageURL() ?? null;

  const embed = new EmbedBuilder()
    .setColor(0x1db954)
    .setAuthor({
      name: `${member.user.username} écoute Spotify`,
      iconURL: member.user.displayAvatarURL(),
    })
    .setTitle(track)
    .setDescription(
      `**${artists}**${album ? `\n${album}` : ""}\n\n` +
      `${bar}\n\`${elapsedFmt}\` ─────── \`${totalFmt}\``,
    )
    .setFooter({ text: `🎵 Spotify  ${getPlatformEmoji(member)}` })
    .setTimestamp();

  if (coverUrl) embed.setThumbnail(coverUrl);

  return embed;
}

// ──────────────────────────────────────────────
// Game/rich presence embed
// ──────────────────────────────────────────────

export function buildGameEmbed(activity: Activity, member: GuildMember): EmbedBuilder {
  const now = Date.now();
  const sessionStart = activity.timestamps?.start?.getTime();
  const sessionDuration = sessionStart ? now - sessionStart : null;

  const largeImage = activity.assets?.largeImageURL();
  const smallImage = activity.assets?.smallImageURL();

  const typeLabel: Record<number, string> = {
    [ActivityType.Playing]: "Joue à",
    [ActivityType.Streaming]: "Stream",
    [ActivityType.Watching]: "Regarde",
    [ActivityType.Competing]: "Participe à",
  };

  const typeColors: Record<number, number> = {
    [ActivityType.Playing]: 0x5865f2,
    [ActivityType.Streaming]: 0x9146ff,
    [ActivityType.Watching]: 0xed4245,
    [ActivityType.Competing]: 0xfee75c,
  };

  const embed = new EmbedBuilder()
    .setColor(typeColors[activity.type] ?? 0x5865f2)
    .setAuthor({
      name: `${member.user.username} — ${typeLabel[activity.type] ?? "Actif sur"} ${activity.name}`,
      iconURL: member.user.displayAvatarURL(),
    })
    .setTitle(activity.name);

  if (largeImage) embed.setThumbnail(largeImage);
  if (smallImage) embed.setImage(smallImage);

  const fields: { name: string; value: string; inline: boolean }[] = [];

  if (activity.details) {
    fields.push({ name: "📌 Détails", value: activity.details, inline: true });
  }
  if (activity.state) {
    fields.push({ name: "🔵 État", value: activity.state, inline: true });
  }
  if (sessionDuration !== null) {
    fields.push({ name: "⏱️ Session", value: fmtDuration(sessionDuration), inline: true });
  }
  if (activity.assets?.largeText) {
    fields.push({ name: "🗺️", value: activity.assets.largeText, inline: true });
  }
  if (activity.assets?.smallText) {
    fields.push({ name: "🏅", value: activity.assets.smallText, inline: true });
  }

  if (fields.length > 0) embed.addFields(fields);

  const platform = getPlatformEmoji(member);
  embed.setFooter({ text: `Rich Presence  ${platform}` }).setTimestamp();

  return embed;
}

// ──────────────────────────────────────────────
// Full /activity embed (all activities)
// ──────────────────────────────────────────────

export function buildActivityEmbed(member: GuildMember): EmbedBuilder[] {
  const activities = member.presence?.activities ?? [];
  if (activities.length === 0) return [];

  const embeds: EmbedBuilder[] = [];

  for (const act of activities) {
    if (act.name === "Spotify" && act.type === ActivityType.Listening) {
      embeds.push(buildSpotifyEmbed(act, member));
    } else if (
      act.type === ActivityType.Playing ||
      act.type === ActivityType.Streaming ||
      act.type === ActivityType.Watching ||
      act.type === ActivityType.Competing
    ) {
      embeds.push(buildGameEmbed(act, member));
    }
    // Skip Custom status activities
  }

  return embeds;
}

// ──────────────────────────────────────────────
// /whoisplaying helper
// ──────────────────────────────────────────────

export interface PlayerInfo {
  member: GuildMember;
  activity: Activity;
  sessionMs: number | null;
}

export function getPlayersOf(
  guild: import("discord.js").Guild,
  query: string,
): PlayerInfo[] {
  const q = query.toLowerCase();
  const results: PlayerInfo[] = [];

  for (const [userId, presence] of guild.presences.cache) {
    const member = guild.members.cache.get(userId);
    if (!member || member.user.bot) continue;
    for (const act of presence.activities) {
      if (act.type !== ActivityType.Playing && act.type !== ActivityType.Competing) continue;
      if (!act.name.toLowerCase().includes(q)) continue;
      const sessionMs = act.timestamps?.start
        ? Date.now() - act.timestamps.start.getTime()
        : null;
      results.push({ member, activity: act, sessionMs });
    }
  }

  return results.sort((a, b) => (b.sessionMs ?? 0) - (a.sessionMs ?? 0));
}

// ──────────────────────────────────────────────
// /listening helper
// ──────────────────────────────────────────────

export interface ListenerInfo {
  member: GuildMember;
  activity: Activity;
}

export function getSpotifyListeners(
  guild: import("discord.js").Guild,
): ListenerInfo[] {
  const results: ListenerInfo[] = [];

  for (const [userId, presence] of guild.presences.cache) {
    const member = guild.members.cache.get(userId);
    if (!member || member.user.bot) continue;
    for (const act of presence.activities) {
      if (act.name === "Spotify" && act.type === ActivityType.Listening) {
        results.push({ member, activity: act });
      }
    }
  }

  return results;
}

// ──────────────────────────────────────────────
// /sessions helper
// ──────────────────────────────────────────────

export interface SessionOverview {
  gameCounts: Map<string, number>;
  spotifyCount: number;
  streamingCount: number;
  idleCount: number;
  dndCount: number;
  onlineCount: number;
  totalActive: number;
}

export function getSessionOverview(
  guild: import("discord.js").Guild,
): SessionOverview {
  const gameCounts = new Map<string, number>();
  let spotifyCount = 0;
  let streamingCount = 0;
  let idleCount = 0;
  let dndCount = 0;
  let onlineCount = 0;
  let totalActive = 0;

  for (const [userId, presence] of guild.presences.cache) {
    const member = guild.members.cache.get(userId);
    if (!member || member.user.bot) continue;
    if (presence.status === "offline") continue;
    totalActive++;

    if (presence.status === "idle") idleCount++;
    else if (presence.status === "dnd") dndCount++;
    else onlineCount++;

    for (const act of presence.activities) {
      if (act.name === "Spotify" && act.type === ActivityType.Listening) {
        spotifyCount++;
      } else if (act.type === ActivityType.Streaming) {
        streamingCount++;
      } else if (act.type === ActivityType.Playing) {
        gameCounts.set(act.name, (gameCounts.get(act.name) ?? 0) + 1);
      }
    }
  }

  return {
    gameCounts,
    spotifyCount,
    streamingCount,
    idleCount,
    dndCount,
    onlineCount,
    totalActive,
  };
}
