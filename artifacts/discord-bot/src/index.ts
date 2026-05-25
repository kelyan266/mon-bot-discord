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
  handleInteraction,
  handleLeaderboardButton,
  handleLeaderboardSelect,
  handlePollVote,
} from "./commands.js";
import { checkSpam, resetActivity } from "./antiSpam.js";
import { addWarning, getAutoRole, getWarnings } from "./storage.js";
import { analyzeWithAI, toxicityEnabled } from "./toxicity.js";
import { saveSnipe } from "./snipes.js";
import { recordChannelMessage } from "./channelStats.js";
import { addMessageXp, addVoiceXp, shutdownFlush } from "./levels.js";
import { getRolesUpToLevel } from "./levelRoles.js";
import { isAutomodEnabled, isXpEnabled } from "./settings.js";
import {
  CLOSE_BUTTON_ID,
  PANEL_BUTTON_ID,
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
  ],
});

async function syncCommands(applicationId: string): Promise<void> {
  const rest = new REST({ version: "10" }).setToken(token!);
  const guildId = process.env["DISCORD_GUILD_ID"];
  try {
    if (guildId) {
      await rest.put(Routes.applicationGuildCommands(applicationId, guildId), {
        body: commandDefinitions,
      });
      console.log(
        `Synced ${commandDefinitions.length} guild commands for ${guildId} (instant).`,
      );
    } else {
      await rest.put(Routes.applicationCommands(applicationId), {
        body: commandDefinitions,
      });
      console.log(
        `Synced ${commandDefinitions.length} global commands. May take up to ~1 hour to propagate.`,
      );
    }
  } catch (err) {
    console.error("Failed to sync slash commands:", err);
  }
}

function updatePresence(): void {
  if (!client.user) return;
  const count = client.guilds.cache.size;
  client.user.setPresence({
    status: "online",
    activities: [
      {
        name: "Louboutin on top",
        state: `Modère ${count} serveur${count !== 1 ? "s" : ""}`,
        type: ActivityType.Custom,
      },
    ],
  });
}

client.once(Events.ClientReady, async (c) => {
  console.log(`Logged in as ${c.user.tag} (id: ${c.user.id})`);
  console.log(`Serving ${c.guilds.cache.size} guild(s).`);
  console.log(
    `Toxicity detection: ${toxicityEnabled ? "enabled (gpt-5-nano)" : "disabled"}`,
  );
  await syncCommands(c.user.id);
  updatePresence();
});

client.on(Events.GuildCreate, () => updatePresence());
client.on(Events.GuildDelete, () => updatePresence());

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
      if (interaction.customId.startsWith("poll_")) {
        await handlePollVote(interaction);
        return;
      }
    } catch (err) {
      console.error("Button interaction error:", err);
    }
    return;
  }

  if (interaction.isStringSelectMenu()) {
    try {
      if (interaction.customId === "lb_select") {
        await handleLeaderboardSelect(interaction);
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

  if (toxicityEnabled && message.content.trim().length > 0) {
    void handleToxicity(message).catch((err) =>
      console.error("Toxicity handler failed:", err),
    );
  }

  if (!result.isSpam) return;

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
  void oldState;
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

process.on("SIGTERM", () => {
  console.log("SIGTERM received, shutting down...");
  shutdownFlush()
    .catch((err) => console.error("Final flush failed:", err))
    .finally(() => client.destroy().finally(() => process.exit(0)));
});

process.on("SIGINT", () => {
  console.log("SIGINT received, shutting down...");
  void shutdownFlush().catch((err) =>
    console.error("Final flush failed:", err),
  );
  client.destroy().finally(() => process.exit(0));
});

client.login(token).catch((err) => {
  console.error("Failed to log in to Discord:", err);
  process.exit(1);
});
