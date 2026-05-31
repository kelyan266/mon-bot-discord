import { loadJson, saveJson } from "./persist.js";
import {
  AuditLogEvent,
  EmbedBuilder,
  PermissionFlagsBits,
  type Client,
  type GuildAuditLogsEntry,
  type GuildMember,
  type TextChannel,
  type Guild,
  type PartialGuildMember,
  type NonThreadGuildBasedChannel,
  type Role,
} from "discord.js";

// ──────────────────────────────────────────────
// Config types
// ──────────────────────────────────────────────

export interface AntiNukeConfig {
  enabled: boolean;
  banThreshold: number;
  kickThreshold: number;
  channelDeleteThreshold: number;
  roleDeleteThreshold: number;
  windowSeconds: number;
  action: "ban" | "kick" | "strip";
  alertChannelId: string | null;
}

export interface AntiRaidConfig {
  enabled: boolean;
  joinThreshold: number;
  windowSeconds: number;
  action: "kick" | "ban" | "timeout";
  minAccountAgeDays: number;
  alertChannelId: string | null;
}

export interface AntiWebhookConfig {
  enabled: boolean;
  alertChannelId: string | null;
}

export interface ProtectionConfig {
  antinuke: AntiNukeConfig;
  antiraid: AntiRaidConfig;
  antiwebhook: AntiWebhookConfig;
}

const DEFAULT: ProtectionConfig = {
  antinuke: {
    enabled: false,
    banThreshold: 3,
    kickThreshold: 5,
    channelDeleteThreshold: 3,
    roleDeleteThreshold: 3,
    windowSeconds: 10,
    action: "strip",
    alertChannelId: null,
  },
  antiraid: {
    enabled: false,
    joinThreshold: 10,
    windowSeconds: 10,
    action: "kick",
    minAccountAgeDays: 7,
    alertChannelId: null,
  },
  antiwebhook: {
    enabled: false,
    alertChannelId: null,
  },
};

type ProtectionDb = Record<string, ProtectionConfig>;

let cache: ProtectionDb | null = null;

async function load(): Promise<ProtectionDb> {
  if (cache) return cache;
  cache = await loadJson<ProtectionDb>("protection.json", {});
  return cache;
}

async function persist(): Promise<void> {
  if (!cache) return;
  await saveJson("protection.json", cache);
}

export async function getProtectionConfig(
  guildId: string,
): Promise<ProtectionConfig> {
  const db = await load();
  if (!db[guildId]) {
    db[guildId] = JSON.parse(JSON.stringify(DEFAULT)) as ProtectionConfig;
    await persist();
  }
  return db[guildId]!;
}

export async function saveProtectionConfig(
  guildId: string,
  config: ProtectionConfig,
): Promise<void> {
  const db = await load();
  db[guildId] = config;
  await persist();
}

// ──────────────────────────────────────────────
// In-memory action tracker (resets on restart)
// ──────────────────────────────────────────────

interface ActionEntry {
  type: "ban" | "kick" | "channelDelete" | "roleDelete";
  timestamp: number;
}

const nukeTracker = new Map<string, ActionEntry[]>(); // key: guildId:userId

function trackAction(
  guildId: string,
  userId: string,
  type: ActionEntry["type"],
  windowSeconds: number,
): ActionEntry[] {
  const key = `${guildId}:${userId}`;
  const now = Date.now();
  const windowMs = windowSeconds * 1000;
  const existing = (nukeTracker.get(key) ?? []).filter(
    (e) => now - e.timestamp < windowMs,
  );
  existing.push({ type, timestamp: now });
  nukeTracker.set(key, existing);
  return existing;
}

// Anti-raid: track recent joins per guild
const raidTracker = new Map<string, number[]>(); // guildId → timestamps

// ──────────────────────────────────────────────
// Alert helper
// ──────────────────────────────────────────────

async function sendAlert(
  guild: Guild,
  channelId: string | null,
  embed: EmbedBuilder,
): Promise<void> {
  if (!channelId) return;
  const ch = guild.channels.cache.get(channelId);
  if (ch?.isTextBased()) {
    await (ch as TextChannel).send({ embeds: [embed] }).catch(() => undefined);
  }
}

// ──────────────────────────────────────────────
// Anti-nuke action
// ──────────────────────────────────────────────

async function executeNukeAction(
  guild: Guild,
  executor: GuildMember,
  action: AntiNukeConfig["action"],
  reason: string,
): Promise<string> {
  if (action === "ban") {
    if (executor.bannable) {
      await executor.ban({ reason }).catch(() => undefined);
      return "banni";
    }
  } else if (action === "kick") {
    if (executor.kickable) {
      await executor.kick(reason).catch(() => undefined);
      return "expulsé";
    }
  } else {
    // strip: remove dangerous permissions from all roles
    const dangerPerms = [
      PermissionFlagsBits.Administrator,
      PermissionFlagsBits.BanMembers,
      PermissionFlagsBits.KickMembers,
      PermissionFlagsBits.ManageChannels,
      PermissionFlagsBits.ManageRoles,
      PermissionFlagsBits.ManageGuild,
    ];
    for (const role of executor.roles.cache.values()) {
      if (role.managed || role.id === guild.id) continue;
      try {
        await executor.roles.remove(role, reason).catch(() => undefined);
      } catch {
        /* ignore */
      }
    }
    void dangerPerms; // mark used
    return "rôles supprimés";
  }
  return "aucune action (permissions insuffisantes)";
}

// ──────────────────────────────────────────────
// Public handlers
// ──────────────────────────────────────────────

export async function handleAuditLogEntry(
  entry: GuildAuditLogsEntry,
  guild: Guild,
  client: Client,
): Promise<void> {
  if (!entry.executor || entry.executor.id === client.user?.id) return;

  const cfg = await getProtectionConfig(guild.id);
  if (!cfg.antinuke.enabled) return;

  const executorId = entry.executor.id;
  if (executorId === guild.ownerId) return;

  const executor = await guild.members
    .fetch(executorId)
    .catch(() => null);
  if (!executor) return;
  if (executor.permissions.has(PermissionFlagsBits.Administrator)) return;

  type NukeType = ActionEntry["type"];
  const actionMap: Partial<Record<AuditLogEvent, NukeType>> = {
    [AuditLogEvent.MemberBanAdd]: "ban",
    [AuditLogEvent.MemberKick]: "kick",
    [AuditLogEvent.ChannelDelete]: "channelDelete",
    [AuditLogEvent.RoleDelete]: "roleDelete",
  };

  const nukeType = actionMap[entry.action as AuditLogEvent];
  if (!nukeType) return;

  const actions = trackAction(
    guild.id,
    executorId,
    nukeType,
    cfg.antinuke.windowSeconds,
  );

  const counts = {
    ban: actions.filter((a) => a.type === "ban").length,
    kick: actions.filter((a) => a.type === "kick").length,
    channelDelete: actions.filter((a) => a.type === "channelDelete").length,
    roleDelete: actions.filter((a) => a.type === "roleDelete").length,
  };

  const triggered =
    counts.ban >= cfg.antinuke.banThreshold ||
    counts.kick >= cfg.antinuke.kickThreshold ||
    counts.channelDelete >= cfg.antinuke.channelDeleteThreshold ||
    counts.roleDelete >= cfg.antinuke.roleDeleteThreshold;

  if (!triggered) return;

  // Clear tracker to avoid repeat triggers
  nukeTracker.delete(`${guild.id}:${executorId}`);

  const reason = `Anti-nuke : actions suspectes détectées (${counts.ban} bans, ${counts.kick} kicks, ${counts.channelDelete} salons supprimés, ${counts.roleDelete} rôles supprimés)`;
  const result = await executeNukeAction(
    guild,
    executor,
    cfg.antinuke.action,
    reason,
  );

  const embed = new EmbedBuilder()
    .setColor(0xed4245)
    .setTitle("🛡️ Anti-Nuke déclenché")
    .setDescription(`Action prise contre **${executor.user.tag}** : ${result}`)
    .addFields(
      { name: "Bans", value: `${counts.ban}`, inline: true },
      { name: "Kicks", value: `${counts.kick}`, inline: true },
      { name: "Salons supprimés", value: `${counts.channelDelete}`, inline: true },
      { name: "Rôles supprimés", value: `${counts.roleDelete}`, inline: true },
      {
        name: "Fenêtre de détection",
        value: `${cfg.antinuke.windowSeconds}s`,
        inline: true,
      },
    )
    .setTimestamp();

  await sendAlert(guild, cfg.antinuke.alertChannelId, embed);
}

export async function handleMemberJoinRaid(
  member: GuildMember | PartialGuildMember,
  client: Client,
): Promise<void> {
  if (member.user?.bot) return;
  const guild = member.guild;
  const cfg = await getProtectionConfig(guild.id);
  if (!cfg.antiraid.enabled) return;

  const now = Date.now();
  const windowMs = cfg.antiraid.windowSeconds * 1000;
  const existing = (raidTracker.get(guild.id) ?? []).filter(
    (t) => now - t < windowMs,
  );
  existing.push(now);
  raidTracker.set(guild.id, existing);

  if (existing.length < cfg.antiraid.joinThreshold) return;

  // Raid detected — clear tracker to avoid spam
  raidTracker.set(guild.id, []);

  const minAgeMs = cfg.antiraid.minAccountAgeDays * 24 * 60 * 60 * 1000;

  const embed = new EmbedBuilder()
    .setColor(0xed4245)
    .setTitle("🚨 Anti-Raid déclenché")
    .setDescription(
      `**${existing.length}** membres ont rejoint en moins de **${cfg.antiraid.windowSeconds}s**. ` +
        `Action : \`${cfg.antiraid.action}\` sur les comptes < ${cfg.antiraid.minAccountAgeDays} jours.`,
    )
    .setTimestamp();

  await sendAlert(guild, cfg.antiraid.alertChannelId, embed);

  const recentMembers = guild.members.cache.filter((m) => {
    if (m.user.bot) return false;
    const joinedAt = m.joinedTimestamp;
    const createdAt = m.user.createdTimestamp;
    if (!joinedAt) return false;
    const isRecent = now - joinedAt < windowMs * 3;
    const isNew = now - createdAt < minAgeMs;
    return isRecent && isNew;
  });

  const reason = `Anti-raid : ${existing.length} jointures en ${cfg.antiraid.windowSeconds}s`;

  for (const [, m] of recentMembers) {
    try {
      if (cfg.antiraid.action === "ban" && m.bannable) {
        await m.ban({ reason }).catch(() => undefined);
      } else if (cfg.antiraid.action === "kick" && m.kickable) {
        await m.kick(reason).catch(() => undefined);
      } else if (cfg.antiraid.action === "timeout" && m.moderatable) {
        await m
          .timeout(10 * 60 * 1000, reason)
          .catch(() => undefined);
      }
    } catch {
      /* ignore individual failures */
    }
  }

  void client;
}

export async function handleWebhookUpdate(
  channel: NonThreadGuildBasedChannel,
  client: Client,
): Promise<void> {
  const guild = channel.guild;
  const cfg = await getProtectionConfig(guild.id);
  if (!cfg.antiwebhook.enabled) return;

  if (!("fetchWebhooks" in channel)) return;
  const webhookChannel = channel as import("discord.js").TextChannel;
  const webhooks = await webhookChannel.fetchWebhooks().catch(() => null);
  if (!webhooks) return;

  const newWebhooks = webhooks.filter((wh: import("discord.js").Webhook) => {
    if (!wh.createdTimestamp) return false;
    return Date.now() - wh.createdTimestamp < 30_000;
  });

  if (newWebhooks.size === 0) return;

  for (const [, wh] of newWebhooks as import("discord.js").Collection<string, import("discord.js").Webhook>) {
    await (wh as import("discord.js").Webhook).delete("Anti-webhook : webhook non autorisé supprimé").catch(() => undefined);
  }

  const embed = new EmbedBuilder()
    .setColor(0xfee75c)
    .setTitle("🕸️ Anti-Webhook déclenché")
    .setDescription(
      `**${newWebhooks.size}** webhook(s) non autorisé(s) détecté(s) et supprimé(s) dans <#${channel.id}>.`,
    )
    .addFields(
      ...(newWebhooks as import("discord.js").Collection<string, import("discord.js").Webhook>).map((wh: import("discord.js").Webhook) => ({
        name: wh.name ?? "webhook",
        value: `Créé par : ${wh.owner ? `<@${wh.owner.id}>` : "inconnu"}`,
        inline: true as const,
      })),
    )
    .setTimestamp();

  await sendAlert(guild, cfg.antiwebhook.alertChannelId, embed);
  void client;
}

// Unused type hints kept for TS
void (null as unknown as Role);
void (null as unknown as NonThreadGuildBasedChannel);
