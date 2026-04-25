import {
  Client,
  EmbedBuilder,
  Events,
  GatewayIntentBits,
  REST,
  Routes,
  type Message,
} from "discord.js";
import { commandDefinitions, handleInteraction } from "./commands.js";
import { checkSpam, resetActivity } from "./antiSpam.js";
import { addWarning, getAutoRole, getWarnings } from "./storage.js";
import { analyzeWithAI, toxicityEnabled } from "./toxicity.js";
import { saveSnipe } from "./snipes.js";

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
    GatewayIntentBits.MessageContent,
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

client.once(Events.ClientReady, async (c) => {
  console.log(`Logged in as ${c.user.tag} (id: ${c.user.id})`);
  console.log(`Serving ${c.guilds.cache.size} guild(s).`);
  console.log(
    `Toxicity detection: ${toxicityEnabled ? "enabled (gpt-5-nano)" : "disabled"}`,
  );
  await syncCommands(c.user.id);
});

client.on(Events.InteractionCreate, async (interaction) => {
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

  const me = message.guild.members.me;
  if (!me) return;
  if (
    message.member.permissions.has("ManageMessages") ||
    message.member.id === message.guild.ownerId ||
    message.member.premiumSince !== null
  ) {
    return;
  }

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

client.on(Events.Error, (err) => {
  console.error("Discord client error:", err);
});

process.on("SIGTERM", () => {
  console.log("SIGTERM received, shutting down...");
  client.destroy().finally(() => process.exit(0));
});

process.on("SIGINT", () => {
  console.log("SIGINT received, shutting down...");
  client.destroy().finally(() => process.exit(0));
});

client.login(token).catch((err) => {
  console.error("Failed to log in to Discord:", err);
  process.exit(1);
});
