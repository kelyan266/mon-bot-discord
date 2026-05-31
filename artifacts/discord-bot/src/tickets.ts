import { loadJson, saveJson } from "./persist.js";
import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelType,
  EmbedBuilder,
  OverwriteType,
  PermissionFlagsBits,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
  type ButtonInteraction,
  type Guild,
  type GuildMember,
  type MessageComponentInteraction,
  type TextChannel,
} from "discord.js";

export interface TicketCategory {
  id: string;
  label: string;
  emoji: string;
  description: string;
  mentionRoleIds: string[];
}

export interface TicketGuildConfig {
  supportRoleIds: string[];
  categoryId?: string;
  logChannelId?: string;
  welcomeMessage?: string;
  ticketCount: number;
  openTickets: Record<string, string>;
  categories: TicketCategory[];
  /** @deprecated migrated to supportRoleIds */
  supportRoleId?: string;
}

interface TicketsDb {
  guilds: Record<string, TicketGuildConfig>;
}

let cache: TicketsDb | null = null;

async function ensureLoaded(): Promise<TicketsDb> {
  if (cache) return cache;
  cache = await loadJson<TicketsDb>("tickets.json", { guilds: {} });
  return cache;
}

async function persist(): Promise<void> {
  if (!cache) return;
  await saveJson("tickets.json", cache);
}

function getGuild(db: TicketsDb, guildId: string): TicketGuildConfig {
  const g = (db.guilds[guildId] ??= {
    supportRoleIds: [],
    ticketCount: 0,
    openTickets: {},
    categories: [],
  });
  if (!g.supportRoleIds) {
    g.supportRoleIds = g.supportRoleId ? [g.supportRoleId] : [];
    delete g.supportRoleId;
  }
  if (!g.categories) g.categories = [];
  for (const cat of g.categories) {
    if (!cat.mentionRoleIds) {
      const legacy = (cat as unknown as Record<string, string>)["mentionRoleId"];
      cat.mentionRoleIds = legacy ? [legacy] : [];
      delete (cat as unknown as Record<string, string>)["mentionRoleId"];
    }
  }
  return g;
}

export async function getTicketConfig(
  guildId: string,
): Promise<TicketGuildConfig> {
  const db = await ensureLoaded();
  return { ...getGuild(db, guildId) };
}

export async function saveTicketConfig(
  guildId: string,
  patch: Partial<Pick<TicketGuildConfig, "categoryId" | "logChannelId" | "welcomeMessage">>,
): Promise<void> {
  const db = await ensureLoaded();
  const guild = getGuild(db, guildId);
  if (patch.categoryId !== undefined) guild.categoryId = patch.categoryId;
  if (patch.logChannelId !== undefined) guild.logChannelId = patch.logChannelId;
  if (patch.welcomeMessage !== undefined) guild.welcomeMessage = patch.welcomeMessage;
  await persist();
}

export async function addTicketSupportRole(
  guildId: string,
  roleId: string,
): Promise<boolean> {
  const db = await ensureLoaded();
  const guild = getGuild(db, guildId);
  if (guild.supportRoleIds.includes(roleId)) return false;
  guild.supportRoleIds.push(roleId);
  await persist();
  return true;
}

export async function removeTicketSupportRole(
  guildId: string,
  roleId: string,
): Promise<boolean> {
  const db = await ensureLoaded();
  const guild = getGuild(db, guildId);
  const before = guild.supportRoleIds.length;
  guild.supportRoleIds = guild.supportRoleIds.filter((id) => id !== roleId);
  if (guild.supportRoleIds.length === before) return false;
  await persist();
  return true;
}

export async function addTicketCategory(
  guildId: string,
  cat: TicketCategory,
): Promise<boolean> {
  const db = await ensureLoaded();
  const guild = getGuild(db, guildId);
  if (guild.categories.some((c) => c.id === cat.id)) return false;
  if (guild.categories.length >= 25) return false;
  guild.categories.push(cat);
  await persist();
  return true;
}

export async function editTicketCategory(
  guildId: string,
  catId: string,
  patch: Partial<Omit<TicketCategory, "id">>,
  clearRole?: boolean,
): Promise<TicketCategory | null> {
  const db = await ensureLoaded();
  const guild = getGuild(db, guildId);
  const cat = guild.categories.find((c) => c.id === catId);
  if (!cat) return null;
  if (patch.label !== undefined) cat.label = patch.label;
  if (patch.emoji !== undefined) cat.emoji = patch.emoji;
  if (patch.description !== undefined) cat.description = patch.description;
  if (clearRole) {
    cat.mentionRoleIds = [];
  } else if (patch.mentionRoleIds !== undefined && patch.mentionRoleIds.length > 0) {
    cat.mentionRoleIds = patch.mentionRoleIds;
  }
  await persist();
  return { ...cat };
}

export async function addCategoryRole(
  guildId: string,
  catId: string,
  roleId: string,
): Promise<TicketCategory | null> {
  const db = await ensureLoaded();
  const guild = getGuild(db, guildId);
  const cat = guild.categories.find((c) => c.id === catId);
  if (!cat) return null;
  if (!cat.mentionRoleIds.includes(roleId)) cat.mentionRoleIds.push(roleId);
  await persist();
  return { ...cat };
}

export async function removeCategoryRole(
  guildId: string,
  catId: string,
  roleId: string,
): Promise<TicketCategory | null> {
  const db = await ensureLoaded();
  const guild = getGuild(db, guildId);
  const cat = guild.categories.find((c) => c.id === catId);
  if (!cat) return null;
  cat.mentionRoleIds = cat.mentionRoleIds.filter((id) => id !== roleId);
  await persist();
  return { ...cat };
}

export async function removeTicketCategory(
  guildId: string,
  catId: string,
): Promise<boolean> {
  const db = await ensureLoaded();
  const guild = getGuild(db, guildId);
  const before = guild.categories.length;
  guild.categories = guild.categories.filter((c) => c.id !== catId);
  if (guild.categories.length === before) return false;
  await persist();
  return true;
}

export async function resetTicketConfig(guildId: string): Promise<void> {
  const db = await ensureLoaded();
  const guild = getGuild(db, guildId);
  guild.supportRoleIds = [];
  guild.categories = [];
  delete guild.categoryId;
  delete guild.logChannelId;
  delete guild.welcomeMessage;
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

export async function autoCreateLogChannel(guild: Guild): Promise<string> {
  const me = guild.members.me;
  if (!me) throw new Error("Bot introuvable dans le serveur.");

  const botPerms = [
    PermissionFlagsBits.ViewChannel,
    PermissionFlagsBits.SendMessages,
    PermissionFlagsBits.ReadMessageHistory,
    PermissionFlagsBits.ManageChannels,
    PermissionFlagsBits.EmbedLinks,
  ];

  let logCategory = guild.channels.cache.find(
    (c) =>
      c.type === ChannelType.GuildCategory &&
      c.name === "📋 Logs Tickets",
  );

  if (!logCategory) {
    logCategory = await guild.channels.create({
      name: "📋 Logs Tickets",
      type: ChannelType.GuildCategory,
      permissionOverwrites: [
        {
          id: guild.id,
          type: OverwriteType.Role,
          deny: [PermissionFlagsBits.ViewChannel],
        },
        {
          id: me.id,
          type: OverwriteType.Member,
          allow: botPerms,
        },
      ],
    });
  }

  let logChannel = guild.channels.cache.find(
    (c) =>
      c.type === ChannelType.GuildText &&
      c.parentId === logCategory!.id &&
      c.name === "📝-logs-tickets",
  );

  if (!logChannel) {
    logChannel = await guild.channels.create({
      name: "📝-logs-tickets",
      type: ChannelType.GuildText,
      parent: logCategory.id,
      topic: "Transcripts et logs des tickets fermés",
      permissionOverwrites: [
        {
          id: guild.id,
          type: OverwriteType.Role,
          deny: [PermissionFlagsBits.ViewChannel],
        },
        {
          id: me.id,
          type: OverwriteType.Member,
          allow: botPerms,
        },
      ],
    });
  }

  await saveTicketConfig(guild.id, { logChannelId: logChannel.id });
  return logChannel.id;
}

export const PANEL_BUTTON_ID = "ticket:open";
export const PANEL_SELECT_ID = "ticket:select";
export const CLOSE_BUTTON_ID = "ticket:close";

export function buildPanel(
  description?: string,
  categories?: TicketCategory[],
): {
  embeds: EmbedBuilder[];
  components: ActionRowBuilder<ButtonBuilder | StringSelectMenuBuilder>[];
} {
  const embed = new EmbedBuilder()
    .setColor(0x5865f2)
    .setTitle("🎫 Support & Tickets")
    .setDescription(
      description ??
        "Sélectionne le type de ticket ci-dessous.\nUn canal privé sera créé et l'équipe support sera notifiée.",
    );

  if (categories && categories.length > 0) {
    const select = new StringSelectMenuBuilder()
      .setCustomId(PANEL_SELECT_ID)
      .setPlaceholder("📩 Choisir le type de ticket...")
      .addOptions(
        categories.map((cat) =>
          new StringSelectMenuOptionBuilder()
            .setLabel(cat.label)
            .setValue(cat.id)
            .setDescription(cat.description)
            .setEmoji(cat.emoji),
        ),
      );

    return {
      embeds: [embed],
      components: [
        new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(select),
      ],
    };
  }

  return {
    embeds: [embed],
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
  interaction: MessageComponentInteraction,
  categoryId?: string,
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

  const category = categoryId
    ? config.categories.find((c) => c.id === categoryId)
    : undefined;

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

  for (const roleId of config.supportRoleIds) {
    permissionOverwrites.push({
      id: roleId,
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
  const safeName = member.user.username
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "-")
    .slice(0, 16);
  const catSlug = category ? category.id.slice(0, 10) + "-" : "";
  const channelName = `ticket-${catSlug}${safeName}-${ticketNum}`;

  const channel = await guild.channels.create({
    name: channelName,
    type: ChannelType.GuildText,
    parent: config.categoryId ?? undefined,
    topic: `${category ? `[${category.label}] ` : ""}Ticket de ${member.user.tag} · #${ticketNum}`,
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
    .setTitle(
      `${category ? category.emoji + " " : "🎫 "}Ticket #${ticketNum}${category ? ` — ${category.label}` : ""}`,
    )
    .setDescription(welcomeText)
    .addFields({
      name: "Fermer",
      value: "Clique sur le bouton ci-dessous ou utilise `/ticket close`.",
    })
    .setFooter({ text: `Ouvert par ${member.user.tag}` })
    .setTimestamp();

  const pingRoleIds =
    category?.mentionRoleIds?.length
      ? category.mentionRoleIds
      : config.supportRoleIds;
  const ping = pingRoleIds.map((id) => `<@&${id}>`).join(" ");

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
      const messages = await channel.messages
        .fetch({ limit: 50 })
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
  await channel
    .delete(`Ticket fermé par ${closer.user.tag}`)
    .catch(() => undefined);
}
