import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  AuditLogEvent,
  EmbedBuilder,
  PermissionFlagsBits,
  type Client,
  type GuildMember,
  type Message,
  type PartialMessage,
  type TextChannel,
  type VoiceState,
  type Guild,
} from "discord.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(__dirname, "..", "data");
const FILE = path.join(DATA_DIR, "logging.json");

// ──────────────────────────────────────────────
// Config
// ──────────────────────────────────────────────

export interface LoggingConfig {
  enabled: boolean;
  channelId: string | null;
  logMessages: boolean;
  logVoice: boolean;
}

const DEFAULT: LoggingConfig = {
  enabled: false,
  channelId: null,
  logMessages: true,
  logVoice: true,
};

type LoggingDb = Record<string, LoggingConfig>;

let cache: LoggingDb | null = null;
let writeLock: Promise<void> = Promise.resolve();

async function load(): Promise<LoggingDb> {
  if (cache) return cache;
  try {
    await fs.mkdir(DATA_DIR, { recursive: true });
    const text = await fs.readFile(FILE, "utf8");
    cache = JSON.parse(text) as LoggingDb;
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") {
      cache = {};
      await persist();
    } else throw err;
  }
  return cache!;
}

async function persist(): Promise<void> {
  if (!cache) return;
  const snap = JSON.stringify(cache, null, 2);
  writeLock = writeLock.then(async () => {
    await fs.mkdir(DATA_DIR, { recursive: true });
    await fs.writeFile(FILE, snap, "utf8");
  });
  await writeLock;
}

export async function getLoggingConfig(guildId: string): Promise<LoggingConfig> {
  const db = await load();
  if (!db[guildId]) {
    db[guildId] = { ...DEFAULT };
    await persist();
  }
  return db[guildId]!;
}

export async function saveLoggingConfig(guildId: string, config: LoggingConfig): Promise<void> {
  const db = await load();
  db[guildId] = config;
  await persist();
}

// ──────────────────────────────────────────────
// Helper
// ──────────────────────────────────────────────

async function getLogChannel(guild: Guild): Promise<TextChannel | null> {
  const cfg = await getLoggingConfig(guild.id);
  if (!cfg.enabled || !cfg.channelId) return null;
  const ch = guild.channels.cache.get(cfg.channelId);
  return ch?.isTextBased() ? (ch as TextChannel) : null;
}

function truncate(text: string, max = 1024): string {
  return text.length > max ? text.slice(0, max - 3) + "…" : text;
}

// ──────────────────────────────────────────────
// Event handlers
// ──────────────────────────────────────────────

export async function handleMessageDelete(
  message: Message | PartialMessage,
  client: Client,
): Promise<void> {
  if (!message.guildId || message.author?.bot) return;
  const guild = client.guilds.cache.get(message.guildId);
  if (!guild) return;

  const cfg = await getLoggingConfig(guild.id);
  if (!cfg.enabled || !cfg.logMessages) return;

  const logChannel = await getLogChannel(guild);
  if (!logChannel) return;

  // Try to find who deleted from audit log
  let deletedBy: string | null = null;
  try {
    const audit = await guild.fetchAuditLogs({
      limit: 1,
      type: AuditLogEvent.MessageDelete,
    });
    const entry = audit.entries.first();
    if (
      entry &&
      entry.target?.id === message.author?.id &&
      Date.now() - entry.createdTimestamp < 5000
    ) {
      deletedBy = entry.executor?.id ?? null;
    }
  } catch {
    /* ignore — no audit log perms */
  }

  const embed = new EmbedBuilder()
    .setColor(0xed4245)
    .setTitle("🗑️ Message supprimé")
    .addFields(
      {
        name: "Auteur",
        value: message.author ? `<@${message.author.id}> (${message.author.tag})` : "Inconnu",
        inline: true,
      },
      {
        name: "Salon",
        value: message.channelId ? `<#${message.channelId}>` : "Inconnu",
        inline: true,
      },
    );

  if (deletedBy) {
    embed.addFields({ name: "Supprimé par", value: `<@${deletedBy}>`, inline: true });
  }

  if (message.content) {
    embed.addFields({ name: "Contenu", value: truncate(message.content), inline: false });
  }

  if (message.attachments && message.attachments.size > 0) {
    embed.addFields({
      name: "Pièces jointes",
      value: message.attachments.map((a) => a.url).join("\n"),
      inline: false,
    });
  }

  embed.setFooter({ text: `ID message : ${message.id}` }).setTimestamp();

  await logChannel.send({ embeds: [embed] }).catch(() => undefined);
}

export async function handleMessageEdit(
  oldMessage: Message | PartialMessage,
  newMessage: Message | PartialMessage,
  client: Client,
): Promise<void> {
  if (!newMessage.guildId || newMessage.author?.bot) return;
  if (oldMessage.content === newMessage.content) return;
  const guild = client.guilds.cache.get(newMessage.guildId);
  if (!guild) return;

  const cfg = await getLoggingConfig(guild.id);
  if (!cfg.enabled || !cfg.logMessages) return;

  const logChannel = await getLogChannel(guild);
  if (!logChannel) return;

  const embed = new EmbedBuilder()
    .setColor(0xfee75c)
    .setTitle("✏️ Message modifié")
    .addFields(
      {
        name: "Auteur",
        value: newMessage.author
          ? `<@${newMessage.author.id}> (${newMessage.author.tag})`
          : "Inconnu",
        inline: true,
      },
      {
        name: "Salon",
        value: `<#${newMessage.channelId}>`,
        inline: true,
      },
      {
        name: "Avant",
        value: truncate(oldMessage.content ?? "*(inconnu)*"),
        inline: false,
      },
      {
        name: "Après",
        value: truncate(newMessage.content ?? "*(vide)*"),
        inline: false,
      },
    )
    .setFooter({ text: `ID message : ${newMessage.id}` })
    .setTimestamp();

  if (newMessage.url) {
    embed.setDescription(`[Voir le message](${newMessage.url})`);
  }

  await logChannel.send({ embeds: [embed] }).catch(() => undefined);
}

export async function handleVoiceLog(
  oldState: VoiceState,
  newState: VoiceState,
  client: Client,
): Promise<void> {
  const guild = oldState.guild;
  const cfg = await getLoggingConfig(guild.id);
  if (!cfg.enabled || !cfg.logVoice) return;

  const logChannel = await getLogChannel(guild);
  if (!logChannel) return;

  const member = oldState.member ?? newState.member;
  if (!member || member.user.bot) return;

  let embed: EmbedBuilder | null = null;

  if (!oldState.channelId && newState.channelId) {
    // Joined a voice channel
    embed = new EmbedBuilder()
      .setColor(0x57f287)
      .setTitle("🔊 Vocal — Connexion")
      .addFields(
        { name: "Membre", value: `<@${member.id}> (${member.user.tag})`, inline: true },
        { name: "Salon", value: `<#${newState.channelId}>`, inline: true },
      )
      .setTimestamp();
  } else if (oldState.channelId && !newState.channelId) {
    // Left a voice channel
    embed = new EmbedBuilder()
      .setColor(0xed4245)
      .setTitle("🔇 Vocal — Déconnexion")
      .addFields(
        { name: "Membre", value: `<@${member.id}> (${member.user.tag})`, inline: true },
        { name: "Salon quitté", value: `<#${oldState.channelId}>`, inline: true },
      )
      .setTimestamp();
  } else if (
    oldState.channelId &&
    newState.channelId &&
    oldState.channelId !== newState.channelId
  ) {
    // Moved between channels
    embed = new EmbedBuilder()
      .setColor(0x5865f2)
      .setTitle("↔️ Vocal — Changement de salon")
      .addFields(
        { name: "Membre", value: `<@${member.id}> (${member.user.tag})`, inline: false },
        { name: "De", value: `<#${oldState.channelId}>`, inline: true },
        { name: "Vers", value: `<#${newState.channelId}>`, inline: true },
      )
      .setTimestamp();
  } else if (!oldState.mute && newState.mute && newState.serverMute) {
    embed = new EmbedBuilder()
      .setColor(0xfee75c)
      .setTitle("🔕 Vocal — Mute serveur")
      .addFields(
        { name: "Membre", value: `<@${member.id}>`, inline: true },
        { name: "Salon", value: newState.channelId ? `<#${newState.channelId}>` : "—", inline: true },
      )
      .setTimestamp();
  } else if (oldState.mute && !newState.mute && !newState.serverMute) {
    embed = new EmbedBuilder()
      .setColor(0x57f287)
      .setTitle("🔔 Vocal — Unmute serveur")
      .addFields(
        { name: "Membre", value: `<@${member.id}>`, inline: true },
        { name: "Salon", value: newState.channelId ? `<#${newState.channelId}>` : "—", inline: true },
      )
      .setTimestamp();
  }

  if (!embed) return;
  await logChannel.send({ embeds: [embed] }).catch(() => undefined);
  void client;
}

// ──────────────────────────────────────────────
// Channel auto-creation utility
// ──────────────────────────────────────────────

export async function createLogsChannel(guild: Guild): Promise<TextChannel | null> {
  const me = guild.members.me;
  if (!me) return null;

  const existing = guild.channels.cache.find(
    (c) => c.name === "logs" && c.isTextBased(),
  ) as TextChannel | undefined;
  if (existing) return existing;

  try {
    const channel = await guild.channels.create({
      name: "logs",
      reason: "Création automatique du salon de logs par le bot",
      permissionOverwrites: [
        {
          id: guild.id,
          deny: [PermissionFlagsBits.ViewChannel],
        },
        {
          id: me.id,
          allow: [
            PermissionFlagsBits.ViewChannel,
            PermissionFlagsBits.SendMessages,
            PermissionFlagsBits.EmbedLinks,
          ],
        },
      ],
    });
    return channel;
  } catch {
    return null;
  }
}
