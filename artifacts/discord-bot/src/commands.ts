import {
  ApplicationCommandOptionType,
  ChatInputCommandInteraction,
  EmbedBuilder,
  GuildMember,
  PermissionFlagsBits,
  type RESTPostAPIChatInputApplicationCommandsJSONBody,
} from "discord.js";
import {
  addWarning,
  clearAutoRole,
  clearWarnings,
  getAutoRole,
  getWarnings,
  removeWarning,
  setAutoRole,
} from "./storage.js";
import { getUserStats } from "./antiSpam.js";
import { getSnipe } from "./snipes.js";

const COLOR_PRIMARY = 0x5865f2;
const COLOR_SUCCESS = 0x57f287;
const COLOR_WARN = 0xfee75c;
const COLOR_DANGER = 0xed4245;

export const commandDefinitions: RESTPostAPIChatInputApplicationCommandsJSONBody[] =
  [
    {
      name: "ping",
      description: "Check that the bot is alive",
    },
    {
      name: "kick",
      description: "Kick a member from the server",
      default_member_permissions: PermissionFlagsBits.KickMembers.toString(),
      dm_permission: false,
      options: [
        {
          name: "user",
          description: "The member to kick",
          type: ApplicationCommandOptionType.User,
          required: true,
        },
        {
          name: "reason",
          description: "Reason for the kick",
          type: ApplicationCommandOptionType.String,
          required: false,
        },
      ],
    },
    {
      name: "ban",
      description: "Ban a member from the server",
      default_member_permissions: PermissionFlagsBits.BanMembers.toString(),
      dm_permission: false,
      options: [
        {
          name: "user",
          description: "The member to ban",
          type: ApplicationCommandOptionType.User,
          required: true,
        },
        {
          name: "reason",
          description: "Reason for the ban",
          type: ApplicationCommandOptionType.String,
          required: false,
        },
        {
          name: "delete_days",
          description: "Days of message history to delete (0-7)",
          type: ApplicationCommandOptionType.Integer,
          required: false,
          min_value: 0,
          max_value: 7,
        },
      ],
    },
    {
      name: "unban",
      description: "Unban a user by their ID",
      default_member_permissions: PermissionFlagsBits.BanMembers.toString(),
      dm_permission: false,
      options: [
        {
          name: "user_id",
          description: "The user ID to unban",
          type: ApplicationCommandOptionType.String,
          required: true,
        },
      ],
    },
    {
      name: "timeout",
      description: "Time out a member (mute) for a duration in minutes",
      default_member_permissions: PermissionFlagsBits.ModerateMembers.toString(),
      dm_permission: false,
      options: [
        {
          name: "user",
          description: "The member to time out",
          type: ApplicationCommandOptionType.User,
          required: true,
        },
        {
          name: "minutes",
          description: "Duration in minutes (1 - 40320 = 28 days)",
          type: ApplicationCommandOptionType.Integer,
          required: true,
          min_value: 1,
          max_value: 40320,
        },
        {
          name: "reason",
          description: "Reason for the timeout",
          type: ApplicationCommandOptionType.String,
          required: false,
        },
      ],
    },
    {
      name: "untimeout",
      description: "Remove an active timeout from a member",
      default_member_permissions: PermissionFlagsBits.ModerateMembers.toString(),
      dm_permission: false,
      options: [
        {
          name: "user",
          description: "The member to remove the timeout from",
          type: ApplicationCommandOptionType.User,
          required: true,
        },
      ],
    },
    {
      name: "warn",
      description: "Issue a warning to a member",
      default_member_permissions: PermissionFlagsBits.ModerateMembers.toString(),
      dm_permission: false,
      options: [
        {
          name: "user",
          description: "The member to warn",
          type: ApplicationCommandOptionType.User,
          required: true,
        },
        {
          name: "reason",
          description: "Reason for the warning",
          type: ApplicationCommandOptionType.String,
          required: true,
        },
      ],
    },
    {
      name: "warnings",
      description: "List warnings for a member",
      default_member_permissions: PermissionFlagsBits.ModerateMembers.toString(),
      dm_permission: false,
      options: [
        {
          name: "user",
          description: "The member to look up",
          type: ApplicationCommandOptionType.User,
          required: true,
        },
      ],
    },
    {
      name: "clearwarnings",
      description: "Remove all warnings from a member",
      default_member_permissions: PermissionFlagsBits.ModerateMembers.toString(),
      dm_permission: false,
      options: [
        {
          name: "user",
          description: "The member whose warnings should be cleared",
          type: ApplicationCommandOptionType.User,
          required: true,
        },
      ],
    },
    {
      name: "delwarning",
      description: "Delete a single warning by its ID",
      default_member_permissions: PermissionFlagsBits.ModerateMembers.toString(),
      dm_permission: false,
      options: [
        {
          name: "warning_id",
          description: "The ID of the warning to delete",
          type: ApplicationCommandOptionType.String,
          required: true,
        },
      ],
    },
    {
      name: "purge",
      description: "Bulk delete recent messages in this channel",
      default_member_permissions:
        PermissionFlagsBits.ManageMessages.toString(),
      dm_permission: false,
      options: [
        {
          name: "amount",
          description: "Number of messages to delete (1-100)",
          type: ApplicationCommandOptionType.Integer,
          required: true,
          min_value: 1,
          max_value: 100,
        },
        {
          name: "user",
          description: "Only delete messages from this user",
          type: ApplicationCommandOptionType.User,
          required: false,
        },
      ],
    },
    {
      name: "userstats",
      description: "Show anti-spam stats for a member (since the bot started)",
      default_member_permissions:
        PermissionFlagsBits.ModerateMembers.toString(),
      dm_permission: false,
      options: [
        {
          name: "user",
          description: "The member to look up",
          type: ApplicationCommandOptionType.User,
          required: true,
        },
      ],
    },
    {
      name: "snipe",
      description: "Show the most recently deleted message in this channel",
      dm_permission: false,
    },
    {
      name: "autorole",
      description:
        "Configure the role automatically given to new members on join",
      default_member_permissions: PermissionFlagsBits.ManageGuild.toString(),
      dm_permission: false,
      options: [
        {
          name: "set",
          description: "Set the role to auto-assign on join",
          type: ApplicationCommandOptionType.Subcommand,
          options: [
            {
              name: "role",
              description: "The role to assign",
              type: ApplicationCommandOptionType.Role,
              required: true,
            },
          ],
        },
        {
          name: "clear",
          description: "Disable auto-role on this server",
          type: ApplicationCommandOptionType.Subcommand,
        },
        {
          name: "show",
          description: "Show the currently configured auto-role",
          type: ApplicationCommandOptionType.Subcommand,
        },
      ],
    },
    {
      name: "slowmode",
      description: "Set the slowmode delay for this channel (0 to disable)",
      default_member_permissions:
        PermissionFlagsBits.ManageChannels.toString(),
      dm_permission: false,
      options: [
        {
          name: "seconds",
          description: "Delay between messages in seconds (0-21600)",
          type: ApplicationCommandOptionType.Integer,
          required: true,
          min_value: 0,
          max_value: 21600,
        },
      ],
    },
  ];

function moderatableMember(
  interaction: ChatInputCommandInteraction,
  target: GuildMember,
): string | null {
  const me = interaction.guild?.members.me;
  if (!me) return "I cannot find my own member profile in this guild.";
  if (target.id === interaction.user.id) {
    return "You cannot use this action on yourself.";
  }
  if (target.id === me.id) {
    return "I cannot perform this action on myself.";
  }
  if (target.id === interaction.guild?.ownerId) {
    return "The server owner cannot be moderated.";
  }
  if (
    interaction.member &&
    "roles" in interaction.member &&
    interaction.member.roles instanceof Object
  ) {
    const invokerHighest = (interaction.member as GuildMember).roles.highest;
    if (
      invokerHighest &&
      target.roles.highest.position >= invokerHighest.position
    ) {
      return "You cannot moderate a member with an equal or higher role than yours.";
    }
  }
  if (target.roles.highest.position >= me.roles.highest.position) {
    return "I cannot moderate a member whose top role is equal to or above mine.";
  }
  return null;
}

async function reply(
  interaction: ChatInputCommandInteraction,
  embed: EmbedBuilder,
  ephemeral = false,
): Promise<void> {
  if (interaction.deferred || interaction.replied) {
    await interaction.editReply({ embeds: [embed] });
  } else {
    await interaction.reply({ embeds: [embed], ephemeral });
  }
}

export async function handleInteraction(
  interaction: ChatInputCommandInteraction,
): Promise<void> {
  switch (interaction.commandName) {
    case "ping":
      return handlePing(interaction);
    case "kick":
      return handleKick(interaction);
    case "ban":
      return handleBan(interaction);
    case "unban":
      return handleUnban(interaction);
    case "timeout":
      return handleTimeout(interaction);
    case "untimeout":
      return handleUntimeout(interaction);
    case "warn":
      return handleWarn(interaction);
    case "warnings":
      return handleWarnings(interaction);
    case "clearwarnings":
      return handleClearWarnings(interaction);
    case "delwarning":
      return handleDelWarning(interaction);
    case "purge":
      return handlePurge(interaction);
    case "slowmode":
      return handleSlowmode(interaction);
    case "userstats":
      return handleUserStats(interaction);
    case "autorole":
      return handleAutoRole(interaction);
    case "snipe":
      return handleSnipe(interaction);
    default:
      await reply(
        interaction,
        new EmbedBuilder()
          .setColor(COLOR_DANGER)
          .setDescription("Unknown command."),
        true,
      );
  }
}

async function handlePing(
  interaction: ChatInputCommandInteraction,
): Promise<void> {
  const sent = Date.now();
  await interaction.reply({ content: "Pinging...", ephemeral: true });
  const roundtrip = Date.now() - sent;
  await interaction.editReply(
    `Pong! Roundtrip: ${roundtrip}ms · WebSocket: ${interaction.client.ws.ping}ms`,
  );
}

async function handleKick(
  interaction: ChatInputCommandInteraction,
): Promise<void> {
  const target = interaction.options.getMember("user") as GuildMember | null;
  const reason = interaction.options.getString("reason") ?? "No reason provided";
  if (!target) {
    await reply(
      interaction,
      new EmbedBuilder()
        .setColor(COLOR_DANGER)
        .setDescription("That user is not a member of this server."),
      true,
    );
    return;
  }
  const guard = moderatableMember(interaction, target);
  if (guard) {
    await reply(
      interaction,
      new EmbedBuilder().setColor(COLOR_DANGER).setDescription(guard),
      true,
    );
    return;
  }
  if (!target.kickable) {
    await reply(
      interaction,
      new EmbedBuilder()
        .setColor(COLOR_DANGER)
        .setDescription("I do not have permission to kick this member."),
      true,
    );
    return;
  }
  await target.kick(`${interaction.user.tag}: ${reason}`);
  await reply(
    interaction,
    new EmbedBuilder()
      .setColor(COLOR_SUCCESS)
      .setTitle("Member kicked")
      .setDescription(`${target.user.tag} was removed from the server.`)
      .addFields(
        { name: "Reason", value: reason },
        { name: "Moderator", value: `<@${interaction.user.id}>` },
      )
      .setTimestamp(),
  );
}

async function handleBan(
  interaction: ChatInputCommandInteraction,
): Promise<void> {
  const targetUser = interaction.options.getUser("user", true);
  const reason = interaction.options.getString("reason") ?? "No reason provided";
  const deleteDays = interaction.options.getInteger("delete_days") ?? 0;
  const member = interaction.options.getMember("user") as GuildMember | null;
  if (member) {
    const guard = moderatableMember(interaction, member);
    if (guard) {
      await reply(
        interaction,
        new EmbedBuilder().setColor(COLOR_DANGER).setDescription(guard),
        true,
      );
      return;
    }
    if (!member.bannable) {
      await reply(
        interaction,
        new EmbedBuilder()
          .setColor(COLOR_DANGER)
          .setDescription("I do not have permission to ban this member."),
        true,
      );
      return;
    }
  }
  await interaction.guild!.members.ban(targetUser.id, {
    reason: `${interaction.user.tag}: ${reason}`,
    deleteMessageSeconds: deleteDays * 24 * 60 * 60,
  });
  await reply(
    interaction,
    new EmbedBuilder()
      .setColor(COLOR_DANGER)
      .setTitle("Member banned")
      .setDescription(`${targetUser.tag} (\`${targetUser.id}\`) was banned.`)
      .addFields(
        { name: "Reason", value: reason },
        { name: "Message history deleted", value: `${deleteDays} day(s)` },
        { name: "Moderator", value: `<@${interaction.user.id}>` },
      )
      .setTimestamp(),
  );
}

async function handleUnban(
  interaction: ChatInputCommandInteraction,
): Promise<void> {
  const userId = interaction.options.getString("user_id", true);
  if (!/^\d{15,25}$/.test(userId)) {
    await reply(
      interaction,
      new EmbedBuilder()
        .setColor(COLOR_DANGER)
        .setDescription("That doesn't look like a valid Discord user ID."),
      true,
    );
    return;
  }
  try {
    await interaction.guild!.members.unban(
      userId,
      `${interaction.user.tag}: unbanned via /unban`,
    );
    await reply(
      interaction,
      new EmbedBuilder()
        .setColor(COLOR_SUCCESS)
        .setTitle("User unbanned")
        .setDescription(`<@${userId}> (\`${userId}\`) has been unbanned.`)
        .setTimestamp(),
    );
  } catch {
    await reply(
      interaction,
      new EmbedBuilder()
        .setColor(COLOR_DANGER)
        .setDescription("That user is not banned, or the unban failed."),
      true,
    );
  }
}

async function handleTimeout(
  interaction: ChatInputCommandInteraction,
): Promise<void> {
  const target = interaction.options.getMember("user") as GuildMember | null;
  const minutes = interaction.options.getInteger("minutes", true);
  const reason = interaction.options.getString("reason") ?? "No reason provided";
  if (!target) {
    await reply(
      interaction,
      new EmbedBuilder()
        .setColor(COLOR_DANGER)
        .setDescription("That user is not a member of this server."),
      true,
    );
    return;
  }
  const guard = moderatableMember(interaction, target);
  if (guard) {
    await reply(
      interaction,
      new EmbedBuilder().setColor(COLOR_DANGER).setDescription(guard),
      true,
    );
    return;
  }
  if (!target.moderatable) {
    await reply(
      interaction,
      new EmbedBuilder()
        .setColor(COLOR_DANGER)
        .setDescription("I do not have permission to time out this member."),
      true,
    );
    return;
  }
  await target.timeout(minutes * 60 * 1000, `${interaction.user.tag}: ${reason}`);
  await reply(
    interaction,
    new EmbedBuilder()
      .setColor(COLOR_WARN)
      .setTitle("Member timed out")
      .setDescription(
        `${target.user.tag} has been muted for ${minutes} minute(s).`,
      )
      .addFields(
        { name: "Reason", value: reason },
        { name: "Moderator", value: `<@${interaction.user.id}>` },
      )
      .setTimestamp(),
  );
}

async function handleUntimeout(
  interaction: ChatInputCommandInteraction,
): Promise<void> {
  const target = interaction.options.getMember("user") as GuildMember | null;
  if (!target) {
    await reply(
      interaction,
      new EmbedBuilder()
        .setColor(COLOR_DANGER)
        .setDescription("That user is not a member of this server."),
      true,
    );
    return;
  }
  if (!target.moderatable) {
    await reply(
      interaction,
      new EmbedBuilder()
        .setColor(COLOR_DANGER)
        .setDescription("I do not have permission to manage this member."),
      true,
    );
    return;
  }
  await target.timeout(null, `${interaction.user.tag}: timeout removed`);
  await reply(
    interaction,
    new EmbedBuilder()
      .setColor(COLOR_SUCCESS)
      .setTitle("Timeout removed")
      .setDescription(`${target.user.tag} can speak again.`)
      .setTimestamp(),
  );
}

async function handleWarn(
  interaction: ChatInputCommandInteraction,
): Promise<void> {
  const target = interaction.options.getMember("user") as GuildMember | null;
  const reason = interaction.options.getString("reason", true);
  if (!target) {
    await reply(
      interaction,
      new EmbedBuilder()
        .setColor(COLOR_DANGER)
        .setDescription("That user is not a member of this server."),
      true,
    );
    return;
  }
  const guard = moderatableMember(interaction, target);
  if (guard) {
    await reply(
      interaction,
      new EmbedBuilder().setColor(COLOR_DANGER).setDescription(guard),
      true,
    );
    return;
  }
  const warning = await addWarning({
    guildId: interaction.guild!.id,
    userId: target.id,
    moderatorId: interaction.user.id,
    reason,
  });
  const total = (await getWarnings(interaction.guild!.id, target.id)).length;

  try {
    await target.send({
      embeds: [
        new EmbedBuilder()
          .setColor(COLOR_WARN)
          .setTitle(`You were warned in ${interaction.guild!.name}`)
          .setDescription(reason)
          .setFooter({ text: `Warning ID: ${warning.id}` })
          .setTimestamp(),
      ],
    });
  } catch {
    /* user has DMs closed - silently continue */
  }

  await reply(
    interaction,
    new EmbedBuilder()
      .setColor(COLOR_WARN)
      .setTitle("Warning issued")
      .setDescription(`${target.user.tag} now has ${total} warning(s).`)
      .addFields(
        { name: "Reason", value: reason },
        { name: "Warning ID", value: `\`${warning.id}\`` },
        { name: "Moderator", value: `<@${interaction.user.id}>` },
      )
      .setTimestamp(),
  );
}

async function handleWarnings(
  interaction: ChatInputCommandInteraction,
): Promise<void> {
  const targetUser = interaction.options.getUser("user", true);
  const list = await getWarnings(interaction.guild!.id, targetUser.id);
  if (list.length === 0) {
    await reply(
      interaction,
      new EmbedBuilder()
        .setColor(COLOR_PRIMARY)
        .setTitle(`Warnings for ${targetUser.tag}`)
        .setDescription("No warnings on record."),
      true,
    );
    return;
  }
  const lines = list
    .slice(0, 15)
    .map((w, i) => {
      const when = `<t:${Math.floor(w.timestamp / 1000)}:R>`;
      return `**${i + 1}.** ${w.reason}\nID: \`${w.id}\` · By <@${w.moderatorId}> · ${when}`;
    })
    .join("\n\n");
  const footer =
    list.length > 15
      ? `Showing 15 of ${list.length} warnings`
      : `${list.length} warning(s) total`;
  await reply(
    interaction,
    new EmbedBuilder()
      .setColor(COLOR_WARN)
      .setTitle(`Warnings for ${targetUser.tag}`)
      .setDescription(lines)
      .setFooter({ text: footer }),
    true,
  );
}

async function handleClearWarnings(
  interaction: ChatInputCommandInteraction,
): Promise<void> {
  const targetUser = interaction.options.getUser("user", true);
  const removed = await clearWarnings(interaction.guild!.id, targetUser.id);
  await reply(
    interaction,
    new EmbedBuilder()
      .setColor(removed > 0 ? COLOR_SUCCESS : COLOR_PRIMARY)
      .setTitle("Warnings cleared")
      .setDescription(
        removed > 0
          ? `Removed ${removed} warning(s) from ${targetUser.tag}.`
          : `${targetUser.tag} had no warnings.`,
      )
      .setTimestamp(),
  );
}

async function handleDelWarning(
  interaction: ChatInputCommandInteraction,
): Promise<void> {
  const id = interaction.options.getString("warning_id", true);
  const removed = await removeWarning(interaction.guild!.id, id);
  await reply(
    interaction,
    new EmbedBuilder()
      .setColor(removed ? COLOR_SUCCESS : COLOR_DANGER)
      .setDescription(
        removed
          ? `Warning \`${id}\` was deleted.`
          : `No warning with ID \`${id}\` was found in this server.`,
      ),
    true,
  );
}

async function handlePurge(
  interaction: ChatInputCommandInteraction,
): Promise<void> {
  const amount = interaction.options.getInteger("amount", true);
  const userFilter = interaction.options.getUser("user");
  const channel = interaction.channel;
  if (!channel || !("bulkDelete" in channel)) {
    await reply(
      interaction,
      new EmbedBuilder()
        .setColor(COLOR_DANGER)
        .setDescription("This channel does not support bulk deletion."),
      true,
    );
    return;
  }
  await interaction.deferReply({ ephemeral: true });
  let deleted = 0;
  if (userFilter) {
    const messages = await channel.messages.fetch({ limit: 100 });
    const toDelete = messages
      .filter((m) => m.author.id === userFilter.id)
      .first(amount);
    if (toDelete.length === 0) {
      await interaction.editReply(
        `No recent messages from ${userFilter.tag} were found in the last 100 messages.`,
      );
      return;
    }
    const result = await channel.bulkDelete(toDelete, true);
    deleted = result.size;
  } else {
    const result = await channel.bulkDelete(amount, true);
    deleted = result.size;
  }
  await interaction.editReply(
    `Deleted ${deleted} message(s)${userFilter ? ` from ${userFilter.tag}` : ""}.`,
  );
}

async function handleUserStats(
  interaction: ChatInputCommandInteraction,
): Promise<void> {
  const targetUser = interaction.options.getUser("user", true);
  const stats = getUserStats(interaction.guild!.id, targetUser.id);
  if (!stats) {
    await reply(
      interaction,
      new EmbedBuilder()
        .setColor(COLOR_PRIMARY)
        .setTitle(`Stats for ${targetUser.tag}`)
        .setDescription(
          "No activity recorded for this user since the bot last started.",
        ),
      true,
    );
    return;
  }
  const avg =
    stats.messages > 0 ? (stats.totalScore / stats.messages).toFixed(3) : "0";
  await reply(
    interaction,
    new EmbedBuilder()
      .setColor(COLOR_PRIMARY)
      .setTitle(`Anti-spam stats for ${targetUser.tag}`)
      .addFields(
        { name: "Messages tracked", value: `${stats.messages}`, inline: true },
        {
          name: "Total spam score",
          value: stats.totalScore.toFixed(2),
          inline: true,
        },
        { name: "Avg score / msg", value: avg, inline: true },
        { name: "Spam triggers", value: `${stats.spamHits}`, inline: true },
        {
          name: "Last seen",
          value: `<t:${Math.floor(stats.lastSeen / 1000)}:R>`,
          inline: true,
        },
      )
      .setFooter({
        text: "Stats reset whenever the bot restarts.",
      }),
    true,
  );
}

async function handleSnipe(
  interaction: ChatInputCommandInteraction,
): Promise<void> {
  const channel = interaction.channel;
  if (!channel) {
    await reply(
      interaction,
      new EmbedBuilder()
        .setColor(COLOR_DANGER)
        .setDescription("This command must be used in a channel."),
      true,
    );
    return;
  }
  const snipe = getSnipe(channel.id);
  if (!snipe) {
    await reply(
      interaction,
      new EmbedBuilder()
        .setColor(COLOR_PRIMARY)
        .setDescription("Nothing to snipe in this channel (within the last hour)."),
      true,
    );
    return;
  }
  const embed = new EmbedBuilder()
    .setColor(COLOR_PRIMARY)
    .setAuthor({
      name: snipe.authorTag,
      iconURL: snipe.authorAvatar ?? undefined,
    })
    .setDescription(snipe.content || "*(no text content)*")
    .setFooter({ text: `Deleted` })
    .setTimestamp(snipe.deletedAt);
  if (snipe.attachments.length > 0) {
    embed.addFields({
      name: `Attachment${snipe.attachments.length > 1 ? "s" : ""}`,
      value: snipe.attachments.join("\n"),
    });
    const firstImage = snipe.attachments.find((url) =>
      /\.(png|jpe?g|gif|webp)(\?|$)/i.test(url),
    );
    if (firstImage) embed.setImage(firstImage);
  }
  await reply(interaction, embed);
}

async function handleAutoRole(
  interaction: ChatInputCommandInteraction,
): Promise<void> {
  const guild = interaction.guild!;
  const sub = interaction.options.getSubcommand(true);

  if (sub === "show") {
    const roleId = await getAutoRole(guild.id);
    if (!roleId) {
      await reply(
        interaction,
        new EmbedBuilder()
          .setColor(COLOR_PRIMARY)
          .setTitle("Auto-role")
          .setDescription("No auto-role is configured for this server."),
        true,
      );
      return;
    }
    const role = guild.roles.cache.get(roleId);
    await reply(
      interaction,
      new EmbedBuilder()
        .setColor(COLOR_PRIMARY)
        .setTitle("Auto-role")
        .setDescription(
          role
            ? `New members will receive <@&${role.id}> on join.`
            : `Configured role \`${roleId}\` no longer exists. Use \`/autorole clear\` or set a new one.`,
        ),
      true,
    );
    return;
  }

  if (sub === "clear") {
    const removed = await clearAutoRole(guild.id);
    await reply(
      interaction,
      new EmbedBuilder()
        .setColor(removed ? COLOR_SUCCESS : COLOR_PRIMARY)
        .setTitle("Auto-role")
        .setDescription(
          removed
            ? "Auto-role has been disabled for this server."
            : "No auto-role was configured.",
        ),
      true,
    );
    return;
  }

  if (sub === "set") {
    const role = interaction.options.getRole("role", true);
    const me = guild.members.me;
    if (!me) {
      await reply(
        interaction,
        new EmbedBuilder()
          .setColor(COLOR_DANGER)
          .setDescription("I cannot find my own member profile."),
        true,
      );
      return;
    }
    if (role.id === guild.roles.everyone.id) {
      await reply(
        interaction,
        new EmbedBuilder()
          .setColor(COLOR_DANGER)
          .setDescription("You cannot use @everyone as the auto-role."),
        true,
      );
      return;
    }
    if ("managed" in role && role.managed) {
      await reply(
        interaction,
        new EmbedBuilder()
          .setColor(COLOR_DANGER)
          .setDescription(
            "That role is managed by an integration and cannot be assigned manually.",
          ),
        true,
      );
      return;
    }
    if (role.position >= me.roles.highest.position) {
      await reply(
        interaction,
        new EmbedBuilder()
          .setColor(COLOR_DANGER)
          .setDescription(
            `I cannot assign <@&${role.id}> — its position is equal to or above my highest role. Move my role above it in Server Settings → Roles.`,
          ),
        true,
      );
      return;
    }
    await setAutoRole(guild.id, role.id);
    await reply(
      interaction,
      new EmbedBuilder()
        .setColor(COLOR_SUCCESS)
        .setTitle("Auto-role updated")
        .setDescription(
          `New members will now receive <@&${role.id}> on join.`,
        )
        .setTimestamp(),
      true,
    );
    return;
  }

  await reply(
    interaction,
    new EmbedBuilder()
      .setColor(COLOR_DANGER)
      .setDescription("Unknown subcommand."),
    true,
  );
}

async function handleSlowmode(
  interaction: ChatInputCommandInteraction,
): Promise<void> {
  const seconds = interaction.options.getInteger("seconds", true);
  const channel = interaction.channel;
  if (!channel || !("setRateLimitPerUser" in channel)) {
    await reply(
      interaction,
      new EmbedBuilder()
        .setColor(COLOR_DANGER)
        .setDescription("This channel doesn't support slowmode."),
      true,
    );
    return;
  }
  await channel.setRateLimitPerUser(
    seconds,
    `${interaction.user.tag}: slowmode set to ${seconds}s`,
  );
  await reply(
    interaction,
    new EmbedBuilder()
      .setColor(seconds === 0 ? COLOR_SUCCESS : COLOR_PRIMARY)
      .setTitle("Slowmode updated")
      .setDescription(
        seconds === 0
          ? "Slowmode has been disabled for this channel."
          : `Slowmode set to ${seconds} second(s) per message.`,
      ),
  );
}
