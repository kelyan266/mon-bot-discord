if (process.env.DISABLE_BOT === "true") {
  console.log("[Bot] DISABLE_BOT=true — instance de dev désactivée, seule la production tourne.");
  process.exit(0);
}

import {
  ActivityType,
  ChannelType,
  Client,
  EmbedBuilder,
  Events,
  GatewayIntentBits,
  REST,
  Routes,
  type Message,
  type VoiceState,
} from "discord.js";
import {
  commandDefinitions,
  handleHelpSelect,
  handleInteraction,
  handleLeaderboardButton,
  handleLeaderboardSelect,
  handleMarryButton,
  handlePollVote,
  HELP_SELECT_ID,
  initMusic,
} from "./commands.js";
import {
  initInviteCache,
  handleInviteMemberJoin,
  handleInviteMemberLeave,
  updateInviteCacheEntry,
  removeFromInviteCache,
} from "./invites.js";
import {
  handleGiveawayButton,
  loadAndScheduleGiveaways,
  GIVEAWAY_BUTTON_PREFIX,
} from "./giveaway.js";
import { MARRY_ACCEPT_PREFIX, MARRY_DECLINE_PREFIX } from "./marriage.js";
import { cleanupAllOrphanedTempVCs, cleanupTempVC, isHubChannel, isTempVC, registerTempVC } from "./tempvc.js";
import { checkSpam, resetActivity } from "./antiSpam.js";
import { isBlacklisted } from "./blacklist.js";
import { addWarning, getAutoRole, getWarnings } from "./storage.js";
import { analyzeWithAI, toxicityEnabled } from "./toxicity.js";
import { saveSnipe } from "./snipes.js";
import {
  generateWelcomeMessage,
  getWelcomeConfig,
} from "./aiWelcome.js";
import { aiChatEnabled, replyWithAI } from "./ai-chat.js";
import { checkEventReminders } from "./events.js";
import {
  handleAuditLogEntry,
  handleMemberJoinRaid,
  handleWebhookUpdate,
} from "./antinuke.js";
import {
  handleMessageDelete as logMessageDelete,
  handleMessageEdit as logMessageEdit,
  handleVoiceLog,
} from "./logging.js";
import { recordChannelMessage } from "./channelStats.js";
import { addMessageXp, addVoiceXp, shutdownFlush } from "./levels.js";
import { startRestore } from "./persist.js";
import { getRolesUpToLevel } from "./levelRoles.js";
import { getBotRoles, isAutomodEnabled, isXpEnabled } from "./settings.js";
import { getAllPerms } from "./permissions.js";
import {
  CLOSE_BUTTON_ID,
  PANEL_BUTTON_ID,
  PANEL_SELECT_ID,
  handleTicketClose,
  handleTicketOpen,
} from "./tickets.js";
import type { GuildMember } from "discord.js";

const token = process.env["DISCORD_BOT_TOKEN"];
if (!token) {
  console.error(
    "DISCORD_BOT_TOKEN is not set. Add it to your secrets and restart the bot.",
  );
  process.exit(1);
}

const SPAM_TIMEOUT_MINUTES = 5;
const AUTO_WARN_THRESHOLD = 3;
const TOXICITY_DELETE_THRESHOLD = 0.8;
const TOXICITY_TIMEOUT_THRESHOLD = 0.95;
const TOXICITY_TIMEOUT_MINUTES = 10;
const AUTO_ROLE_NAME = "random";

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildVoiceStates,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildPresences,
    GatewayIntentBits.GuildModeration,
    GatewayIntentBits.GuildInvites,
  ],
});

async function syncCommands(applicationId: string): Promise<void> {
  const rest = new REST({ version: "10" }).setToken(token!);
  try {
    // Clear any stale guild-specific commands to avoid duplicates
    const guilds = client.guilds.cache;
    await Promise.all(
      guilds.map((guild) =>
        rest
          .put(Routes.applicationGuildCommands(applicationId, guild.id), {
            body: [],
          })
          .catch((err) =>
            console.error(`Failed to clear guild commands for ${guild.id}:`, err),
          ),
      ),
    );

    // Register globally (single source of truth, no duplicates)
    await rest.put(Routes.applicationCommands(applicationId), {
      body: commandDefinitions,
    });
    console.log(
      `Synced ${commandDefinitions.length} global commands. Guild-specific commands cleared.`,
    );
  } catch (err) {
    console.error("Failed to sync slash commands:", err);
  }
}

let presenceIndex = 0;

function updatePresence(): void {
  if (!client.user) return;
  const guilds = client.guilds.cache.size;
  const members = client.guilds.cache.reduce((acc, g) => acc + g.memberCount, 0);
  const cmds = commandDefinitions.length;

  type Activity = NonNullable<Parameters<typeof client.user.setPresence>[0]["activities"]>[number];
  const statuses: Activity[] = [
    {
      name: `${members.toLocaleString("fr-FR")} membres`,
      type: ActivityType.Watching,
    },
    {
      name: `/help • ${guilds} serveur${guilds !== 1 ? "s" : ""}`,
      type: ActivityType.Playing,
    },
    {
      name: `un vocal • ${guilds} serveur${guilds !== 1 ? "s" : ""}`,
      type: ActivityType.Streaming,
      url: "https://www.twitch.tv/louboutin",
    },
    {
      name: `${cmds} commandes`,
      type: ActivityType.Playing,
    },
    {
      name: `la modération`,
      type: ActivityType.Watching,
    },
  ];

  const activity = statuses[presenceIndex % statuses.length]!;
  presenceIndex++;

  client.user.setPresence({ status: "online", activities: [activity] });
}

setInterval(() => updatePresence(), 30_000).unref();

client.once(Events.ClientReady, async (c) => {
  console.log(`Logged in as ${c.user.tag} (id: ${c.user.id})`);
  console.log(`Serving ${c.guilds.cache.size} guild(s).`);
  console.log(
    `Toxicity detection: ${toxicityEnabled ? "enabled (gpt-5-nano)" : "disabled"}`,
  );
  await syncCommands(c.user.id);
  updatePresence();
  void initMusic();

  // Pre-warm permission + settings caches and invite tracking for every guild.
  for (const guild of c.guilds.cache.values()) {
    void Promise.all([
      getBotRoles(guild.id),
      getAllPerms(guild.id),
      initInviteCache(guild),
    ]).catch(() => {});
  }

  // Reschedule any giveaways that were still active before the last restart
  void loadAndScheduleGiveaways(client);

  // Clean up orphaned temp VCs from before last restart
  for (const guild of c.guilds.cache.values()) {
    cleanupAllOrphanedTempVCs(guild).catch((err) =>
      console.error(`TempVC startup cleanup failed for ${guild.id}:`, err),
    );
  }
});

client.on(Events.GuildCreate, () => updatePresence());
client.on(Events.GuildDelete, () => updatePresence());

const recentWelcomes = new Map<string, number>();
const WELCOME_DEDUP_MS = 10_000;

client.on(Events.GuildMemberAdd, async (member) => {
  if (!member.guild) return;

  const key = `${member.guild.id}:${member.id}`;
  const now = Date.now();
  if (recentWelcomes.has(key) && now - recentWelcomes.get(key)! < WELCOME_DEDUP_MS) return;
  recentWelcomes.set(key, now);
  setTimeout(() => recentWelcomes.delete(key), WELCOME_DEDUP_MS);

  try {
    const config = await getWelcomeConfig(member.guild.id);
    if (!config) return;

    const channel = member.guild.channels.cache.get(config.channelId);
    if (!channel || !channel.isTextBased()) return;

    const memberCount = member.guild.memberCount;
    const message = await generateWelcomeMessage(
      member.user.username,
      member.guild.name,
      memberCount,
      config.tone,
    );

    const embed = new EmbedBuilder()
      .setColor(0x5865f2)
      .setTitle(`👋 Bienvenue sur ${member.guild.name} !`)
      .setDescription(message)
      .setThumbnail(member.user.displayAvatarURL({ size: 256 }))
      .addFields(
        { name: "Membre", value: `<@${member.id}>`, inline: true },
        { name: "N° de membre", value: `#${memberCount}`, inline: true },
      )
      .setFooter({ text: `ID : ${member.id}` })
      .setTimestamp();

    await (channel as import("discord.js").TextChannel).send({
      content: `<@${member.id}>`,
      embeds: [embed],
    });
  } catch (err) {
    console.error("AI welcome failed:", err);
  }
});

client.on(Events.InteractionCreate, async (interaction) => {
  if (interaction.isButton()) {
    try {
      if (interaction.customId === PANEL_BUTTON_ID) {
        await handleTicketOpen(interaction);
        return;
      }
      if (interaction.customId === CLOSE_BUTTON_ID) {
        const channel = interaction.channel;
        const member = interaction.member as import("discord.js").GuildMember;
        if (!channel || !channel.isTextBased() || !("guild" in channel)) return;
        await handleTicketClose(
          interaction,
          channel as import("discord.js").TextChannel,
          member,
        );
        return;
      }
      if (interaction.customId.startsWith("bj_")) {
        const { handleBlackjackButton } = await import("./casino.js");
        await handleBlackjackButton(interaction);
        return;
      }
      if (interaction.customId.startsWith("lb_") && interaction.customId !== "lb_noop") {
        await handleLeaderboardButton(interaction);
        return;
      }
      if (
        interaction.customId.startsWith(MARRY_ACCEPT_PREFIX) ||
        interaction.customId.startsWith(MARRY_DECLINE_PREFIX)
      ) {
        await handleMarryButton(interaction);
        return;
      }
      if (interaction.customId.startsWith("poll_")) {
        await handlePollVote(interaction);
        return;
      }
      if (interaction.customId.startsWith(GIVEAWAY_BUTTON_PREFIX)) {
        await handleGiveawayButton(interaction, client);
        return;
      }
    } catch (err) {
      console.error("Button interaction error:", err);
    }
    return;
  }

  if (interaction.isStringSelectMenu()) {
    try {
      if (interaction.customId === PANEL_SELECT_ID) {
        const categoryId = interaction.values[0];
        await handleTicketOpen(interaction, categoryId);
      } else if (interaction.customId === "lb_select") {
        await handleLeaderboardSelect(interaction);
      } else if (interaction.customId === HELP_SELECT_ID) {
        await handleHelpSelect(interaction);
      }
    } catch (err) {
      console.error("Select menu interaction error:", err);
    }
    return;
  }

  if (!interaction.isChatInputCommand()) return;
  try {
    await handleInteraction(interaction);
  } catch (err) {
    console.error(`Error handling /${interaction.commandName}:`, err);
    const message = "Something went wrong while running that command.";
    try {
      if (interaction.deferred || interaction.replied) {
        await interaction.editReply(message);
      } else {
        await interaction.reply({ content: message, ephemeral: true });
      }
    } catch {
      /* swallow secondary error */
    }
  }
});

client.on(Events.MessageCreate, async (message) => {
  if (!message.guild || message.author.bot || !message.member) return;

  recordChannelMessage(message.guild.id, message.channelId);

  const guildId = message.guild.id;
  void isXpEnabled(guildId).then((on) => {
    if (!on) return;
    addMessageXp(guildId, message.author.id)
      .then((result) => {
        if (result?.leveledUp) announceLevelUp(message, result.level);
      })
      .catch((err) => console.error("Message XP failed:", err));
  });

  const me = message.guild.members.me;
  if (!me) return;

  const isMentioned =
    message.mentions.users.has(client.user!.id) &&
    !message.mentions.everyone;

  if (isMentioned && aiChatEnabled) {
    const text = message.content
      .replace(/<@!?\d+>/g, "")
      .trim();
    if (text.length > 0) {
      try {
        await message.channel.sendTyping();
        const aiReply = await replyWithAI({
          guildId: message.guild.id,
          channelId: message.channel.id,
          userId: message.author.id,
          username: message.author.username,
          content: text,
        });
        await message.reply({ content: aiReply, allowedMentions: { repliedUser: false } });
      } catch (err) {
        console.error("AI chat reply failed:", err);
      }
    }
    return;
  }

  if (
    message.member.permissions.has("ManageMessages") ||
    message.member.id === message.guild.ownerId
  ) {
    return;
  }
  if (message.member.premiumSince !== null) {
    console.log("Booster détecté :", message.author.tag);
    return;
  }

  const automodOn = await isAutomodEnabled(message.guild.id);
  if (!automodOn) return;

  const result = checkSpam(message);

  if (result.isSpam) {
    // Anti-spam prend la main — on ne lance pas la toxicité pour éviter les doubles avertissements
  } else if (toxicityEnabled && message.content.trim().length > 0) {
    void handleToxicity(message).catch((err) =>
      console.error("Toxicity handler failed:", err),
    );
    return;
  } else {
    return;
  }

  const reasonText =
    result.reason === "rate"
      ? "Sending messages too quickly"
      : result.reason === "duplicate"
        ? "Repeating the same message"
        : result.reason === "mass-mentions"
          ? "Mass-mentioning users or roles"
          : result.reason === "links"
            ? "Suspicious link spam"
            : "Suspicious activity (multiple spam signals)";

  try {
    if (message.deletable) {
      await message.delete().catch(() => undefined);
    }
    if (
      message.member.moderatable &&
      message.member.roles.highest.position < me.roles.highest.position
    ) {
      await message.member.timeout(
        SPAM_TIMEOUT_MINUTES * 60 * 1000,
        `Auto-mod: ${reasonText}`,
      );
    }
    const warning = await addWarning({
      guildId: message.guild.id,
      userId: message.author.id,
      moderatorId: client.user!.id,
      reason: `Auto-mod: ${reasonText}${result.detail ? ` (${result.detail})` : ""}`,
    });
    resetActivity(message.guild.id, message.author.id);

    const total = (await getWarnings(message.guild.id, message.author.id))
      .length;
    const channel = message.channel;
    if (channel.isTextBased() && "send" in channel) {
      const embed = new EmbedBuilder()
        .setColor(0xfee75c)
        .setTitle("Anti-spam triggered")
        .setDescription(
          `<@${message.author.id}> was muted for ${SPAM_TIMEOUT_MINUTES} minute(s).`,
        )
        .addFields(
          { name: "Reason", value: reasonText },
          { name: "Total warnings", value: `${total}` },
          { name: "Warning ID", value: `\`${warning.id}\`` },
        )
        .setTimestamp();
      await channel.send({ embeds: [embed] }).catch(() => undefined);
    }

    if (total >= AUTO_WARN_THRESHOLD && message.member.kickable) {
      await message.member
        .kick(
          `Auto-mod: reached ${AUTO_WARN_THRESHOLD} warnings for spam-related behavior.`,
        )
        .catch(() => undefined);
      if (channel.isTextBased() && "send" in channel) {
        await channel
          .send(
            `<@${message.author.id}> was kicked after reaching ${AUTO_WARN_THRESHOLD} warnings.`,
          )
          .catch(() => undefined);
      }
    }
  } catch (err) {
    console.error("Anti-spam handler failed:", err);
  }
});

async function handleToxicity(message: Message): Promise<void> {
  if (!message.guild || !message.member) return;
  const me = message.guild.members.me;
  if (!me) return;

  const toxicity = await analyzeWithAI(message.content);
  if (toxicity > 0) {
    console.log(
      `${message.author.tag} -> toxicity: ${toxicity.toFixed(2)}`,
    );
  }

  if (toxicity < TOXICITY_DELETE_THRESHOLD) return;

  if (message.deletable) {
    await message.delete().catch(() => undefined);
  }

  const channel = message.channel;
  if (channel.isTextBased() && "send" in channel) {
    await channel
      .send(
        `<@${message.author.id}>, message supprimé (toxique — score ${toxicity.toFixed(2)}).`,
      )
      .catch(() => undefined);
  }

  await addWarning({
    guildId: message.guild.id,
    userId: message.author.id,
    moderatorId: client.user!.id,
    reason: `Auto-mod: toxic message removed (score ${toxicity.toFixed(2)})`,
  }).catch(() => undefined);

  if (
    toxicity >= TOXICITY_TIMEOUT_THRESHOLD &&
    message.member.moderatable &&
    message.member.roles.highest.position < me.roles.highest.position
  ) {
    await message.member
      .timeout(
        TOXICITY_TIMEOUT_MINUTES * 60 * 1000,
        `Auto-mod: severe toxicity (score ${toxicity.toFixed(2)})`,
      )
      .catch(() => undefined);
  }

  const total = (await getWarnings(message.guild.id, message.author.id))
    .length;
  if (total >= AUTO_WARN_THRESHOLD && message.member.kickable) {
    await message.member
      .kick(`Auto-mod: reached ${AUTO_WARN_THRESHOLD} warnings.`)
      .catch(() => undefined);
    if (channel.isTextBased() && "send" in channel) {
      await channel
        .send(
          `<@${message.author.id}> was kicked after reaching ${AUTO_WARN_THRESHOLD} warnings.`,
        )
        .catch(() => undefined);
    }
  }
}

client.on(Events.MessageDelete, (message) => {
  try {
    if (!message.guild || !message.author || message.author.bot) return;
    if (!message.content && message.attachments.size === 0) return;
    saveSnipe(message.channelId, {
      authorId: message.author.id,
      authorTag: message.author.tag,
      authorAvatar: message.author.displayAvatarURL({ size: 128 }),
      content: message.content ?? "",
      attachments: message.attachments.map((a) => a.url),
      deletedAt: Date.now(),
      createdAt: message.createdTimestamp,
    });
  } catch (err) {
    console.error("Snipe handler failed:", err);
  }
  void logMessageDelete(message, client).catch((err) =>
    console.error("Log message delete failed:", err),
  );
});

client.on(Events.MessageUpdate, (oldMessage, newMessage) => {
  void logMessageEdit(oldMessage, newMessage, client).catch((err) =>
    console.error("Log message edit failed:", err),
  );
});

client.on(Events.GuildMemberAdd, async (member) => {
  if (member.user.bot) return;

  const configuredId = await getAutoRole(member.guild.id).catch(() => null);
  const role = configuredId
    ? member.guild.roles.cache.get(configuredId)
    : member.guild.roles.cache.find((r) => r.name === AUTO_ROLE_NAME);

  if (!role) {
    if (configuredId) {
      console.log(
        `Auto-role: configured role ${configuredId} no longer exists in ${member.guild.name}`,
      );
    }
    return;
  }
  const me = member.guild.members.me;
  if (!me || role.position >= me.roles.highest.position) {
    console.log(
      `Auto-role: cannot assign "${role.name}" — bot role is not high enough.`,
    );
    return;
  }
  try {
    await member.roles.add(role, "Auto-role on join");
    console.log(`${member.user.tag} a reçu le rôle ${role.name}`);
  } catch (error) {
    console.error("Auto-role error:", error);
  }
});

// Blacklist: kick members on join if they are blacklisted
client.on(Events.GuildMemberAdd, (member) => {
  if (member.user.bot) return;
  void isBlacklisted(member.guild.id, member.id).then(async (entry) => {
    if (!entry) return;
    try {
      await member.send({
        embeds: [
          new EmbedBuilder()
            .setColor(0xed4245)
            .setTitle("🚫 Tu es blacklisté de ce serveur")
            .setDescription(`Tu as été blacklisté de **${member.guild.name}** et ne peux pas y rejoindre.`)
            .addFields({ name: "Raison", value: entry.reason }),
        ],
      }).catch(() => undefined);
      await member.ban({ reason: `[BL] ${entry.reason}` });
    } catch {
      // Ignore if ban fails
    }
  }).catch((err) => console.error("Blacklist join check failed:", err));
});

// Anti-raid detection (separate listener so it runs independently)
client.on(Events.GuildMemberAdd, (member) => {
  void handleMemberJoinRaid(member, client).catch((err) =>
    console.error("Anti-raid handler failed:", err),
  );
});

// Invite tracking — detect which invite was used on join
client.on(Events.GuildMemberAdd, (member) => {
  if (member.user.bot) return;
  void handleInviteMemberJoin(member).then((inviterId) => {
    if (inviterId) console.log(`[invites] ${member.user.tag} invité par ${inviterId}`);
  }).catch((err) => console.error("Invite join tracking failed:", err));
});

// Invite tracking — mark member as left
client.on(Events.GuildMemberRemove, (member) => {
  if (member.user.bot) return;
  void handleInviteMemberLeave(member as import("discord.js").GuildMember).catch((err) =>
    console.error("Invite leave tracking failed:", err),
  );
});

// Keep invite cache fresh
client.on(Events.InviteCreate, (invite) => {
  if (!invite.inviter || !invite.guild) return;
  updateInviteCacheEntry(invite.guild.id, invite.code, invite.uses ?? 0, invite.inviter.id);
});

client.on(Events.InviteDelete, (invite) => {
  if (!invite.guild) return;
  removeFromInviteCache(invite.guild.id, invite.code);
});

// Anti-nuke: audit log entry tracking
client.on(Events.GuildAuditLogEntryCreate, (entry, guild) => {
  void handleAuditLogEntry(entry, guild, client).catch((err) =>
    console.error("Anti-nuke handler failed:", err),
  );
});

// Anti-webhook: detect new webhooks
client.on(Events.WebhooksUpdate, (channel) => {
  void handleWebhookUpdate(channel, client).catch((err) =>
    console.error("Anti-webhook handler failed:", err),
  );
});

interface VoiceSession {
  guildId: string;
  channelId: string;
}
const voiceSessions = new Map<string, VoiceSession>();

function isEligibleVoiceState(state: VoiceState): boolean {
  if (!state.channelId || !state.guild) return false;
  if (state.member?.user.bot) return false;
  if (state.selfDeaf || state.deaf || state.selfMute || state.mute) return false;
  const channel = state.channel;
  if (!channel) return false;
  if (
    channel.type !== ChannelType.GuildVoice &&
    channel.type !== ChannelType.GuildStageVoice
  ) {
    return false;
  }
  const humans = channel.members.filter((m) => !m.user.bot).size;
  return humans >= 2;
}

client.on(Events.VoiceStateUpdate, (oldState, newState) => {
  const userId = newState.id;
  if (newState.member?.user.bot) {
    voiceSessions.delete(userId);
    return;
  }
  if (isEligibleVoiceState(newState)) {
    voiceSessions.set(userId, {
      guildId: newState.guild.id,
      channelId: newState.channelId!,
    });
  } else {
    voiceSessions.delete(userId);
  }
  void handleVoiceLog(oldState, newState, client).catch((err) =>
    console.error("Log voice failed:", err),
  );

  // Auto-delete temp VC when it becomes empty
  if (oldState.channelId && oldState.channelId !== newState.channelId) {
    if (isTempVC(oldState.channelId) && oldState.guild) {
      void cleanupTempVC(oldState.guild, oldState.channelId).catch((err) =>
        console.error("TempVC cleanup failed:", err),
      );
    }
  }

  // Hub auto-create: when a member joins the hub channel, spawn a personal temp VC
  if (
    newState.channelId &&
    newState.channelId !== oldState.channelId &&
    newState.guild &&
    newState.member &&
    !newState.member.user.bot &&
    isHubChannel(newState.guild.id, newState.channelId)
  ) {
    void (async () => {
      try {
        const guild = newState.guild!;
        const member = newState.member!;
        const hubChannel = newState.channel;
        const category = hubChannel?.parent ?? null;

        const me = guild.members.me;
        if (!me?.permissions.has(0x10n)) return; // ManageChannels

        const channel = await guild.channels.create({
          name: `🎙️ ${member.displayName}`,
          type: ChannelType.GuildVoice,
          parent: category,
          userLimit: 0,
          reason: `TempVC hub — ${member.user.tag}`,
        });

        registerTempVC(channel.id, guild.id, member.id);
        await member.voice.setChannel(channel).catch(() => null);
      } catch (err) {
        console.error("Hub TempVC creation failed:", err);
      }
    })();
  }
});

setInterval(() => {
  for (const [userId, session] of voiceSessions) {
    const guild = client.guilds.cache.get(session.guildId);
    if (!guild) continue;
    const member = guild.members.cache.get(userId);
    if (!member || !isEligibleVoiceState(member.voice)) {
      voiceSessions.delete(userId);
      continue;
    }
    void isXpEnabled(session.guildId).then((on) => {
      if (!on) return;
      addVoiceXp(session.guildId, userId)
        .then(async (result) => {
          if (!result.leveledUp) return;
          const channel = guild.channels.cache.get(session.channelId);
          if (channel?.isTextBased() && "send" in channel) {
            await channel
              .send(`🎉 <@${userId}> est passé au **niveau ${result.level}** !`)
              .catch(() => undefined);
          }
          await grantLevelRoles(member, result.level);
        })
        .catch((err) => console.error("Voice XP failed:", err));
    });
  }
}, 60_000).unref();

// Event reminders: check every minute
setInterval(() => {
  void checkEventReminders(client).catch((err) =>
    console.error("Event reminder check failed:", err),
  );
}, 60_000).unref();

async function announceLevelUp(message: Message, level: number): Promise<void> {
  const channel = message.channel;
  if (channel.isTextBased() && "send" in channel) {
    await channel
      .send(`🎉 <@${message.author.id}> est passé au **niveau ${level}** !`)
      .catch(() => undefined);
  }
  if (message.member) {
    await grantLevelRoles(message.member, level);
  }
}

async function grantLevelRoles(
  member: GuildMember,
  level: number,
): Promise<void> {
  try {
    const rewards = await getRolesUpToLevel(member.guild.id, level);
    if (rewards.length === 0) return;

    const granted: string[] = [];
    for (const { roleId } of rewards) {
      if (member.roles.cache.has(roleId)) continue;
      const role = member.guild.roles.cache.get(roleId);
      if (!role) continue;
      const me = member.guild.members.me;
      if (!me || me.roles.highest.comparePositionTo(role) <= 0) continue;
      try {
        await member.roles.add(role, `Level reward (level ${level})`);
        granted.push(role.name);
      } catch (err) {
        console.error(`Failed to grant role ${role.name}:`, err);
      }
    }

    if (granted.length > 0) {
      member
        .send(
          `🎭 Tu as reçu ${granted.length === 1 ? "le rôle" : "les rôles"} **${granted.join("**, **")}** pour le niveau ${level} sur **${member.guild.name}** !`,
        )
        .catch(() => undefined);
    }
  } catch (err) {
    console.error("grantLevelRoles failed:", err);
  }
}

client.on(Events.Error, (err) => {
  console.error("Discord client error:", err);
});

async function gracefulShutdown(signal: string): Promise<void> {
  console.log(`${signal} received, flushing data...`);
  try {
    await shutdownFlush(4_000);
    console.log("Flush complete.");
  } catch (err) {
    console.error("Final flush failed:", err);
  }
  try {
    await client.destroy();
  } catch {
    // ignore
  }
  process.exit(0);
}

process.on("SIGTERM", () => {
  void gracefulShutdown("SIGTERM");
});

process.on("SIGINT", () => {
  void gracefulShutdown("SIGINT");
});

// Start DB restore in the background, then log in immediately.
// login() no longer waits for the DB — the bot goes online in ~5 s even
// if Neon is cold. loadJson() waits up to 5 s for the restore promise
// before reading, so data is correct once Neon wakes up.
startRestore();
client.login(token).catch((err) => {
  console.error("Failed to log in to Discord:", err);
  process.exit(1);
});
