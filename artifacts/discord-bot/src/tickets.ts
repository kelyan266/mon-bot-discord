import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelType,
  EmbedBuilder,
  OverwriteType,
  PermissionFlagsBits,
  type ButtonInteraction,
  type Guild,
  type GuildMember,
  type TextChannel,
} from "discord.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(__dirname, "..", "data");
const FILE = path.join(DATA_DIR, "tickets.json");

export interface TicketGuildConfig {
  supportRoleId?: string;
  categoryId?: string;
  logChannelId?: string;
  welcomeMessage?: string;
  ticketCount: number;
  openTickets: Record<string, string>;
}

interface TicketsDb {
  guilds: Record<string, TicketGuildConfig>;
}

let cache: TicketsDb | null = null;
let writeLock: Promise<void> = Promise.resolve();

async function ensureLoaded(): Promise<TicketsDb> {
  if (cache) return cache;
  try {
    await fs.mkdir(DATA_DIR, { recursive: true });
    const text = await fs.readFile(FILE, "utf8");
    cache = JSON.parse(text) as TicketsDb;
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") {
      cache = { guilds: {} };
    } else {
      throw err;
    }
  }
  return cache;
}

async function persist(): Promise<void> {
  if (!cache) return;
  const snapshot = JSON.stringify(cache, null, 2);
  writeLock = writeLock.then(async () => {
    await fs.mkdir(DATA_DIR, { recursive: true });
    await fs.writeFile(FILE, snapshot, "utf8");
  });
  await writeLock;
}

function getGuild(db: TicketsDb, guildId: string): TicketGuildConfig {
  return (db.guilds[guildId] ??= { ticketCount: 0, openTickets: {} });
}

export async function getTicketConfig(
  guildId: string,
): Promise<TicketGuildConfig> {
  const db = await ensureLoaded();
  return { ...getGuild(db, guildId) };
}

export async function saveTicketConfig(
  guildId: string,
  patch: Partial<Omit<TicketGuildConfig, "ticketCount" | "openTickets">>,
): Promise<void> {
  const db = await ensureLoaded();
  const guild = getGuild(db, guildId);
  if (patch.supportRoleId !== undefined)
    guild.supportRoleId = patch.supportRoleId;
  if (patch.categoryId !== undefined) guild.categoryId = patch.categoryId;
  if (patch.logChannelId !== undefined)
    guild.logChannelId = patch.logChannelId;
  if (patch.welcomeMessage !== undefined)
    guild.welcomeMessage = patch.welcomeMessage;
  await persist();
}

export async function getOpenTicket(
  guildId: string,
  userId: string,
): Promise<string | null> {
  const db = await ensureLoaded();
  return getGuild(db, guildId).openTickets[userId] ?? null;
}

export async function registerTicket(
  guildId: string,
  userId: string,
  channelId: string,
): Promise<number> {
  const db = await ensureLoaded();
  const guild = getGuild(db, guildId);
  guild.ticketCount += 1;
  guild.openTickets[userId] = channelId;
  await persist();
  return guild.ticketCount;
}

export async function removeTicket(
  guildId: string,
  userId: string,
): Promise<void> {
  const db = await ensureLoaded();
  const guild = getGuild(db, guildId);
  delete guild.openTickets[userId];
  await persist();
}

export const PANEL_BUTTON_ID = "ticket:open";
export const CLOSE_BUTTON_ID = "ticket:close";

export function buildPanel(description?: string): {
  embeds: EmbedBuilder[];
  components: ActionRowBuilder<ButtonBuilder>[];
} {
  return {
    embeds: [
      new EmbedBuilder()
        .setColor(0x5865f2)
        .setTitle("🎫 Support & Tickets")
        .setDescription(
          description ??
            "Clique sur le bouton ci-dessous pour ouvrir un ticket.\nUn canal privé sera créé et l'équipe support sera notifiée.",
        ),
    ],
    components: [
      new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder()
          .setCustomId(PANEL_BUTTON_ID)
          .setLabel("📩 Ouvrir un ticket")
          .setStyle(ButtonStyle.Primary),
      ),
    ],
  };
}

function buildCloseRow(): ActionRowBuilder<ButtonBuilder> {
  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(CLOSE_BUTTON_ID)
      .setLabel("🔒 Fermer le ticket")
      .setStyle(ButtonStyle.Danger),
  );
}

export async function handleTicketOpen(
  interaction: ButtonInteraction,
): Promise<void> {
  const guild = interaction.guild!;
  const member = interaction.member as GuildMember;
  await interaction.deferReply({ ephemeral: true });

  const config = await getTicketConfig(guild.id);

  const existing = config.openTickets[member.id];
  if (existing) {
    const ch = guild.channels.cache.get(existing);
    await interaction.editReply({
      embeds: [
        new EmbedBuilder()
          .setColor(0xfee75c)
          .setTitle("⚠️ Ticket déjà ouvert")
          .setDescription(
            ch
              ? `Tu as déjà un ticket ouvert : <#${existing}>`
              : "Tu as déjà un ticket ouvert.",
          ),
      ],
    });
    return;
  }

  const me = guild.members.me;
  if (!me) return;

  const permissionOverwrites: import("discord.js").OverwriteResolvable[] = [
    {
      id: guild.id,
      type: OverwriteType.Role,
      deny: [PermissionFlagsBits.ViewChannel],
    },
    {
      id: member.id,
      type: OverwriteType.Member,
      allow: [
        PermissionFlagsBits.ViewChannel,
        PermissionFlagsBits.SendMessages,
        PermissionFlagsBits.ReadMessageHistory,
        PermissionFlagsBits.AttachFiles,
      ],
    },
    {
      id: me.id,
      type: OverwriteType.Member,
      allow: [
        PermissionFlagsBits.ViewChannel,
        PermissionFlagsBits.SendMessages,
        PermissionFlagsBits.ManageChannels,
        PermissionFlagsBits.ManageMessages,
        PermissionFlagsBits.ReadMessageHistory,
      ],
    },
  ];

  if (config.supportRoleId) {
    permissionOverwrites.push({
      id: config.supportRoleId,
      type: OverwriteType.Role,
      allow: [
        PermissionFlagsBits.ViewChannel,
        PermissionFlagsBits.SendMessages,
        PermissionFlagsBits.ReadMessageHistory,
        PermissionFlagsBits.AttachFiles,
        PermissionFlagsBits.ManageMessages,
      ],
    });
  }

  const ticketNum = config.ticketCount + 1;
  const safeName = member.user.username.toLowerCase().replace(/[^a-z0-9]/g, "-").slice(0, 20);
  const channelName = `ticket-${safeName}-${ticketNum}`;

  const channel = await guild.channels.create({
    name: channelName,
    type: ChannelType.GuildText,
    parent: config.categoryId ?? undefined,
    topic: `Ticket de ${member.user.tag} · #${ticketNum}`,
    permissionOverwrites,
  });

  await registerTicket(guild.id, member.id, channel.id);

  const defaultWelcome = `Bonjour <@${member.id}> ! Décris ton problème et l'équipe support te répondra dès que possible.`;
  const welcomeText = config.welcomeMessage
    ? config.welcomeMessage
        .replace(/\{user\}/g, `<@${member.id}>`)
        .replace(/\{username\}/g, member.user.username)
        .replace(/\{ticket_count\}/g, String(ticketNum))
        .replace(/\{server\}/g, guild.name)
    : defaultWelcome;

  const welcomeEmbed = new EmbedBuilder()
    .setColor(0x57f287)
    .setTitle(`🎫 Ticket #${ticketNum}`)
    .setDescription(welcomeText)
    .addFields({
      name: "Fermer",
      value: "Clique sur le bouton ci-dessous ou utilise `/ticket close`.",
    })
    .setFooter({ text: `Ouvert par ${member.user.tag}` })
    .setTimestamp();

  const ping = config.supportRoleId ? `<@&${config.supportRoleId}>` : "";

  await (channel as TextChannel).send({
    content: ping || undefined,
    embeds: [welcomeEmbed],
    components: [buildCloseRow()],
  });

  await interaction.editReply({
    embeds: [
      new EmbedBuilder()
        .setColor(0x57f287)
        .setTitle("✅ Ticket créé")
        .setDescription(`Ton ticket a été ouvert : <#${channel.id}>`),
    ],
  });
}

export async function handleTicketClose(
  interaction: ButtonInteraction | null,
  channel: TextChannel,
  closer: GuildMember,
  reason?: string,
): Promise<void> {
  const guild = channel.guild;
  const config = await getTicketConfig(guild.id);

  const ownerId = Object.entries(config.openTickets).find(
    ([, chId]) => chId === channel.id,
  )?.[0];

  if (interaction) {
    await interaction.deferReply({ ephemeral: true });
  }

  if (config.logChannelId) {
    const logChannel = guild.channels.cache.get(config.logChannelId) as
      | TextChannel
      | undefined;
    if (logChannel) {
      const messages = await channel
        .messages.fetch({ limit: 50 })
        .catch(() => null);
      const lines = messages
        ? [...messages.values()]
            .reverse()
            .map(
              (m) =>
                `[${new Date(m.createdTimestamp).toISOString()}] ${m.author.tag}: ${m.content || "(embed/attachment)"}`,
            )
            .join("\n")
        : "(impossible de récupérer les messages)";

      await logChannel
        .send({
          embeds: [
            new EmbedBuilder()
              .setColor(0xed4245)
              .setTitle(`🔒 Ticket fermé — #${channel.name}`)
              .addFields(
                {
                  name: "Fermé par",
                  value: `<@${closer.id}>`,
                  inline: true,
                },
                {
                  name: "Ouvert par",
                  value: ownerId ? `<@${ownerId}>` : "Inconnu",
                  inline: true,
                },
                { name: "Raison", value: reason ?? "Aucune", inline: true },
                {
                  name: "Transcript (derniers messages)",
                  value: lines.length > 1000 ? lines.slice(-1000) : lines || "(vide)",
                },
              )
              .setTimestamp(),
          ],
        })
        .catch(() => undefined);
    }
  }

  if (ownerId) await removeTicket(guild.id, ownerId);

  if (interaction) {
    await interaction.editReply({
      embeds: [
        new EmbedBuilder()
          .setColor(0x57f287)
          .setTitle("✅ Ticket fermé")
          .setDescription("Ce canal va être supprimé."),
      ],
    });
  }

  await new Promise((r) => setTimeout(r, 3000));
  await channel.delete(`Ticket fermé par ${closer.user.tag}`).catch(() => undefined);
}
