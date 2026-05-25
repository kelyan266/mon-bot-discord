import {
  ActionRowBuilder,
  ActivityType,
  ApplicationCommandOptionType,
  ButtonBuilder,
  ButtonInteraction,
  ButtonStyle,
  ChannelType,
  ChatInputCommandInteraction,
  EmbedBuilder,
  Guild,
  GuildMember,
  PermissionFlagsBits,
  PermissionsBitField,
  StringSelectMenuBuilder,
  StringSelectMenuInteraction,
  StringSelectMenuOptionBuilder,
  UserFlags,
  type RESTPostAPIChatInputApplicationCommandsJSONBody,
  type TextChannel,
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
import {
  addRole as permAddRole,
  addUser as permAddUser,
  getAllPerms,
  CATEGORIES,
  CATEGORY_IDS,
  checkCategoryPermission,
  getCategoryForCommand,
  removeRole as permRemoveRole,
  removeUser as permRemoveUser,
  resetCategory,
  type CategoryId,
} from "./permissions.js";
import {
  handleBalance,
  handleBlackjack,
  handleCasinoConfig,
  handleDaily,
  handleEconomy,
  handleRoulette,
  handleSlots,
} from "./casino.js";
import {
  clearWelcomeConfig,
  generateWelcomeMessage,
  getToneLabel,
  getWelcomeConfig,
  setWelcomeConfig,
} from "./aiWelcome.js";
import {
  buildPollComponents,
  buildPollEmbed,
  castVote,
  createPoll,
  endPoll,
  setPollMessage,
} from "./polls.js";
import {
  addQuote,
  deleteQuote,
  getRandomQuote,
  listQuotes,
} from "./quotes.js";
import {
  getChannelStats,
  getChannelStatsSummary,
} from "./channelStats.js";
import {
  getActiveMembers24h,
  getFullLeaderboard,
  getLeaderboardTotal,
  type LbSortBy,
} from "./levels.js";
import {
  adjustXp,
  getLeaderboard,
  getRank,
  getUserLevel,
  progressToNextLevel,
  resetGuildXp,
  resetUserXp,
  setXp,
} from "./levels.js";
import {
  listLevelRoles,
  removeLevelRole,
  setLevelRole,
} from "./levelRoles.js";
import {
  addTicketSupportRole,
  buildPanel,
  getTicketConfig,
  handleTicketClose,
  removeTicket,
  removeTicketSupportRole,
  saveTicketConfig,
} from "./tickets.js";
import {
  addBotRole,
  addKeepRole,
  clearBotRoles,
  clearKeepRoles,
  getBotRoles,
  getGuildSettings,
  getKeepRoles,
  removeBotRole,
  removeKeepRole,
  setAutomodEnabled,
  setXpEnabled,
} from "./settings.js";

const COLOR_PRIMARY = 0x5865f2;
const COLOR_SUCCESS = 0x57f287;
const COLOR_WARN = 0xfee75c;
const COLOR_DANGER = 0xed4245;

export const commandDefinitions: RESTPostAPIChatInputApplicationCommandsJSONBody[] =
  [
    {
      name: "avatar",
      description: "Affiche l'avatar HD + bannière d'un membre",
      dm_permission: false,
      options: [
        {
          type: ApplicationCommandOptionType.User,
          name: "user",
          description: "Membre (par défaut : toi)",
          required: false,
        },
      ],
    },
    {
      name: "serverinfo",
      description: "Carte détaillée du serveur (boosts, membres, emojis, voix…)",
      dm_permission: false,
    },
    {
      name: "userinfo",
      description: "Profil ultra détaillé d'un membre (badges, rôles, activités, perms…)",
      dm_permission: false,
      options: [
        {
          type: ApplicationCommandOptionType.User,
          name: "user",
          description: "Membre (par défaut : toi)",
          required: false,
        },
      ],
    },
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
      name: "dm",
      description: "Send a direct message to a member as the server",
      default_member_permissions:
        PermissionFlagsBits.ManageMessages.toString(),
      dm_permission: false,
      options: [
        {
          name: "user",
          description: "The member to DM",
          type: ApplicationCommandOptionType.User,
          required: true,
        },
        {
          name: "message",
          description: "The message to send",
          type: ApplicationCommandOptionType.String,
          required: true,
        },
      ],
    },
    {
      name: "help",
      description: "Show the list of available commands (only visible to you)",
      dm_permission: false,
    },
    {
      name: "commands",
      description: "Afficher la liste des commandes (visible par tout le monde)",
      dm_permission: false,
    },
    {
      name: "embed",
      description: "Post a styled announcement embed in this channel",
      default_member_permissions:
        PermissionFlagsBits.ManageMessages.toString(),
      dm_permission: false,
      options: [
        {
          name: "message",
          description: "The announcement text",
          type: ApplicationCommandOptionType.String,
          required: true,
        },
        {
          name: "title",
          description: "Optional title (default: 📢 Annonce)",
          type: ApplicationCommandOptionType.String,
          required: false,
        },
        {
          name: "color",
          description: "Embed color",
          type: ApplicationCommandOptionType.String,
          required: false,
          choices: [
            { name: "Blue", value: "blue" },
            { name: "Green", value: "green" },
            { name: "Yellow", value: "yellow" },
            { name: "Red", value: "red" },
            { name: "Purple", value: "purple" },
          ],
        },
      ],
    },
    {
      name: "lock",
      description: "Lock this channel so @everyone cannot send messages",
      default_member_permissions: PermissionFlagsBits.ManageChannels.toString(),
      dm_permission: false,
      options: [
        {
          name: "reason",
          description: "Reason for locking the channel",
          type: ApplicationCommandOptionType.String,
          required: false,
        },
      ],
    },
    {
      name: "unlock",
      description: "Unlock this channel so @everyone can send messages again",
      default_member_permissions: PermissionFlagsBits.ManageChannels.toString(),
      dm_permission: false,
      options: [
        {
          name: "reason",
          description: "Reason for unlocking the channel",
          type: ApplicationCommandOptionType.String,
          required: false,
        },
      ],
    },
    {
      name: "channelstats",
      description: "Show the most active channels in this server (since startup)",
      default_member_permissions:
        PermissionFlagsBits.ModerateMembers.toString(),
      dm_permission: false,
    },
    {
      name: "level",
      description: "Show your level and XP (or someone else's)",
      dm_permission: false,
      options: [
        {
          type: ApplicationCommandOptionType.User,
          name: "user",
          description: "User to check",
          required: false,
        },
      ],
    },
    {
      name: "leaderboard",
      description: "🏆 Classement du serveur (XP, messages, temps vocal) avec pagination",
      dm_permission: false,
    },
    {
      name: "roleinfo",
      description: "📋 Informations détaillées sur un rôle",
      dm_permission: false,
      options: [
        {
          type: ApplicationCommandOptionType.Role,
          name: "role",
          description: "Rôle à inspecter",
          required: true,
        },
      ],
    },
    {
      name: "poll",
      description: "📊 Système de sondage interactif",
      dm_permission: false,
      options: [
        {
          type: ApplicationCommandOptionType.Subcommand,
          name: "create",
          description: "Créer un sondage avec boutons de vote",
          options: [
            {
              type: ApplicationCommandOptionType.String,
              name: "question",
              description: "Question du sondage",
              required: true,
              max_length: 200,
            },
            {
              type: ApplicationCommandOptionType.String,
              name: "option1",
              description: "Option 1",
              required: true,
              max_length: 80,
            },
            {
              type: ApplicationCommandOptionType.String,
              name: "option2",
              description: "Option 2",
              required: true,
              max_length: 80,
            },
            {
              type: ApplicationCommandOptionType.String,
              name: "option3",
              description: "Option 3 (optionnel)",
              required: false,
              max_length: 80,
            },
            {
              type: ApplicationCommandOptionType.String,
              name: "option4",
              description: "Option 4 (optionnel)",
              required: false,
              max_length: 80,
            },
            {
              type: ApplicationCommandOptionType.String,
              name: "option5",
              description: "Option 5 (optionnel)",
              required: false,
              max_length: 80,
            },
          ],
        },
        {
          type: ApplicationCommandOptionType.Subcommand,
          name: "end",
          description: "Terminer un sondage et afficher les résultats finaux",
          options: [
            {
              type: ApplicationCommandOptionType.String,
              name: "id",
              description: "ID du sondage (visible dans l'embed)",
              required: true,
            },
          ],
        },
      ],
    },
    {
      name: "quote",
      description: "💬 Système de citations du serveur",
      dm_permission: false,
      options: [
        {
          type: ApplicationCommandOptionType.Subcommand,
          name: "random",
          description: "Afficher une citation aléatoire",
        },
        {
          type: ApplicationCommandOptionType.Subcommand,
          name: "add",
          description: "Ajouter une nouvelle citation",
          options: [
            {
              type: ApplicationCommandOptionType.String,
              name: "texte",
              description: "La citation à ajouter",
              required: true,
              max_length: 1000,
            },
            {
              type: ApplicationCommandOptionType.String,
              name: "auteur",
              description: "Nom de l'auteur (optionnel)",
              required: false,
              max_length: 100,
            },
          ],
        },
        {
          type: ApplicationCommandOptionType.Subcommand,
          name: "delete",
          description: "Supprimer une citation par son ID",
          options: [
            {
              type: ApplicationCommandOptionType.Integer,
              name: "id",
              description: "ID de la citation",
              required: true,
              min_value: 1,
            },
          ],
        },
        {
          type: ApplicationCommandOptionType.Subcommand,
          name: "list",
          description: "Lister les citations du serveur",
          options: [
            {
              type: ApplicationCommandOptionType.Integer,
              name: "page",
              description: "Numéro de page",
              required: false,
              min_value: 1,
            },
          ],
        },
      ],
    },
    {
      name: "stats",
      description: "📊 Dashboard global du serveur",
      dm_permission: false,
    },
    {
      name: "membercount",
      description: "👥 Carte des membres du serveur en temps réel",
      dm_permission: false,
    },
    {
      name: "permissions",
      description: "🔐 Gérer qui peut utiliser chaque catégorie de commandes",
      dm_permission: false,
      options: [
        {
          type: ApplicationCommandOptionType.Subcommand,
          name: "view",
          description: "Voir les restrictions actuelles de toutes les catégories",
        },
        {
          type: ApplicationCommandOptionType.Subcommand,
          name: "add-role",
          description: "Restreindre une catégorie à un rôle (les autres rôles seront bloqués)",
          options: [
            {
              type: ApplicationCommandOptionType.String,
              name: "catégorie",
              description: "Catégorie de commandes",
              required: true,
              choices: [
                { name: "🔨 Modération", value: "moderation" },
                { name: "🎰 Casino", value: "casino" },
                { name: "📈 Niveaux & XP", value: "levels" },
                { name: "🎟️ Tickets", value: "tickets" },
                { name: "🛠️ Utilitaires", value: "utilities" },
                { name: "⚙️ Configuration", value: "config" },
              ],
            },
            {
              type: ApplicationCommandOptionType.Role,
              name: "rôle",
              description: "Rôle autorisé à utiliser cette catégorie",
              required: true,
            },
          ],
        },
        {
          type: ApplicationCommandOptionType.Subcommand,
          name: "remove-role",
          description: "Retirer un rôle de la liste d'accès à une catégorie",
          options: [
            {
              type: ApplicationCommandOptionType.String,
              name: "catégorie",
              description: "Catégorie de commandes",
              required: true,
              choices: [
                { name: "🔨 Modération", value: "moderation" },
                { name: "🎰 Casino", value: "casino" },
                { name: "📈 Niveaux & XP", value: "levels" },
                { name: "🎟️ Tickets", value: "tickets" },
                { name: "🛠️ Utilitaires", value: "utilities" },
                { name: "⚙️ Configuration", value: "config" },
              ],
            },
            {
              type: ApplicationCommandOptionType.Role,
              name: "rôle",
              description: "Rôle à retirer",
              required: true,
            },
          ],
        },
        {
          type: ApplicationCommandOptionType.Subcommand,
          name: "add-user",
          description: "Autoriser un membre spécifique à utiliser une catégorie",
          options: [
            {
              type: ApplicationCommandOptionType.String,
              name: "catégorie",
              description: "Catégorie de commandes",
              required: true,
              choices: [
                { name: "🔨 Modération", value: "moderation" },
                { name: "🎰 Casino", value: "casino" },
                { name: "📈 Niveaux & XP", value: "levels" },
                { name: "🎟️ Tickets", value: "tickets" },
                { name: "🛠️ Utilitaires", value: "utilities" },
                { name: "⚙️ Configuration", value: "config" },
              ],
            },
            {
              type: ApplicationCommandOptionType.User,
              name: "membre",
              description: "Membre à autoriser explicitement",
              required: true,
            },
          ],
        },
        {
          type: ApplicationCommandOptionType.Subcommand,
          name: "remove-user",
          description: "Retirer l'accès explicite d'un membre à une catégorie",
          options: [
            {
              type: ApplicationCommandOptionType.String,
              name: "catégorie",
              description: "Catégorie de commandes",
              required: true,
              choices: [
                { name: "🔨 Modération", value: "moderation" },
                { name: "🎰 Casino", value: "casino" },
                { name: "📈 Niveaux & XP", value: "levels" },
                { name: "🎟️ Tickets", value: "tickets" },
                { name: "🛠️ Utilitaires", value: "utilities" },
                { name: "⚙️ Configuration", value: "config" },
              ],
            },
            {
              type: ApplicationCommandOptionType.User,
              name: "membre",
              description: "Membre à retirer",
              required: true,
            },
          ],
        },
        {
          type: ApplicationCommandOptionType.Subcommand,
          name: "reset",
          description: "Supprimer toutes les restrictions d'une catégorie (retour accès libre)",
          options: [
            {
              type: ApplicationCommandOptionType.String,
              name: "catégorie",
              description: "Catégorie à réinitialiser",
              required: true,
              choices: [
                { name: "🔨 Modération", value: "moderation" },
                { name: "🎰 Casino", value: "casino" },
                { name: "📈 Niveaux & XP", value: "levels" },
                { name: "🎟️ Tickets", value: "tickets" },
                { name: "🛠️ Utilitaires", value: "utilities" },
                { name: "⚙️ Configuration", value: "config" },
                { name: "🔄 Toutes les catégories", value: "all" },
              ],
            },
          ],
        },
      ],
    },
    {
      name: "casino",
      description: "⚙️ Configuration du système casino (admin)",
      dm_permission: false,
      options: [
        {
          type: ApplicationCommandOptionType.SubcommandGroup,
          name: "config",
          description: "Gérer la configuration casino du serveur",
          options: [
            {
              type: ApplicationCommandOptionType.Subcommand,
              name: "view",
              description: "Voir la configuration actuelle",
            },
            {
              type: ApplicationCommandOptionType.Subcommand,
              name: "set",
              description: "Modifier une valeur de configuration",
              options: [
                {
                  type: ApplicationCommandOptionType.String,
                  name: "clé",
                  description: "Paramètre à modifier",
                  required: true,
                  choices: [
                    { name: "💰 Solde de départ", value: "startingBalance" },
                    { name: "🎁 Récompense daily", value: "dailyAmount" },
                    { name: "⏳ Cooldown daily (heures)", value: "dailyCooldownHours" },
                    { name: "🔥 Bonus streak daily (true/false)", value: "dailyStreakBonus" },
                    { name: "⬇️ Mise minimale", value: "minBet" },
                    { name: "⬆️ Mise maximale (0=illimité)", value: "maxBet" },
                    { name: "💱 Devise (emoji)", value: "currency" },
                    { name: "📺 Salon casino (#salon ou none)", value: "casinoChannelId" },
                    { name: "♠ Payout BJ naturel (150 ou 250)", value: "bjNaturalPayout" },
                    { name: "🎰 Multiplicateur jackpot 7", value: "slotsJackpotMultiplier" },
                  ],
                },
                {
                  type: ApplicationCommandOptionType.String,
                  name: "valeur",
                  description: "Nouvelle valeur",
                  required: true,
                },
              ],
            },
            {
              type: ApplicationCommandOptionType.Subcommand,
              name: "reset",
              description: "Remettre la config aux valeurs par défaut",
            },
          ],
        },
      ],
    },
    {
      name: "economy",
      description: "💰 Gestion de l'économie du serveur",
      dm_permission: false,
      options: [
        {
          type: ApplicationCommandOptionType.Subcommand,
          name: "top",
          description: "Classement des membres les plus riches",
          options: [
            {
              type: ApplicationCommandOptionType.Integer,
              name: "page",
              description: "Page",
              required: false,
              min_value: 1,
            },
          ],
        },
        {
          type: ApplicationCommandOptionType.Subcommand,
          name: "give",
          description: "Admin : donner des pièces à un membre",
          options: [
            {
              type: ApplicationCommandOptionType.User,
              name: "utilisateur",
              description: "Membre",
              required: true,
            },
            {
              type: ApplicationCommandOptionType.Integer,
              name: "montant",
              description: "Quantité à donner",
              required: true,
              min_value: 1,
            },
          ],
        },
        {
          type: ApplicationCommandOptionType.Subcommand,
          name: "take",
          description: "Admin : retirer des pièces à un membre",
          options: [
            {
              type: ApplicationCommandOptionType.User,
              name: "utilisateur",
              description: "Membre",
              required: true,
            },
            {
              type: ApplicationCommandOptionType.Integer,
              name: "montant",
              description: "Quantité à retirer",
              required: true,
              min_value: 1,
            },
          ],
        },
        {
          type: ApplicationCommandOptionType.Subcommand,
          name: "set",
          description: "Admin : fixer le solde d'un membre",
          options: [
            {
              type: ApplicationCommandOptionType.User,
              name: "utilisateur",
              description: "Membre",
              required: true,
            },
            {
              type: ApplicationCommandOptionType.Integer,
              name: "montant",
              description: "Nouveau solde",
              required: true,
              min_value: 0,
            },
          ],
        },
        {
          type: ApplicationCommandOptionType.Subcommand,
          name: "reset",
          description: "Admin : remettre le solde d'un membre au solde de départ",
          options: [
            {
              type: ApplicationCommandOptionType.User,
              name: "utilisateur",
              description: "Membre",
              required: true,
            },
          ],
        },
      ],
    },
    {
      name: "balance",
      description: "Voir le solde de pièces d'un membre",
      dm_permission: false,
      options: [
        {
          type: ApplicationCommandOptionType.User,
          name: "utilisateur",
          description: "Membre dont tu veux voir le solde (toi par défaut)",
          required: false,
        },
      ],
    },
    {
      name: "daily",
      description: "Réclame ta récompense quotidienne",
      dm_permission: false,
    },
    {
      name: "slots",
      description: "🎰 Joue à la machine à sous",
      dm_permission: false,
      options: [
        {
          type: ApplicationCommandOptionType.Integer,
          name: "mise",
          description: "Nombre de pièces à miser",
          required: true,
          min_value: 10,
        },
      ],
    },
    {
      name: "blackjack",
      description: "♠ Joue au blackjack contre le croupier",
      dm_permission: false,
      options: [
        {
          type: ApplicationCommandOptionType.Integer,
          name: "mise",
          description: "Nombre de pièces à miser",
          required: true,
          min_value: 10,
        },
      ],
    },
    {
      name: "roulette",
      description: "🎡 Joue à la roulette européenne",
      dm_permission: false,
      options: [
        {
          type: ApplicationCommandOptionType.Integer,
          name: "mise",
          description: "Nombre de pièces à miser",
          required: true,
          min_value: 10,
        },
        {
          type: ApplicationCommandOptionType.String,
          name: "choix",
          description: "Ton pari : rouge, noir, pair, impair, 1-12, 13-24, 25-36",
          required: true,
          choices: [
            { name: "Rouge 🔴", value: "rouge" },
            { name: "Noir ⚫", value: "noir" },
            { name: "Pair", value: "pair" },
            { name: "Impair", value: "impair" },
            { name: "1ère douzaine (1–12) ×3", value: "1-12" },
            { name: "2e douzaine (13–24) ×3", value: "13-24" },
            { name: "3e douzaine (25–36) ×3", value: "25-36" },
          ],
        },
        {
          type: ApplicationCommandOptionType.Integer,
          name: "nombre",
          description: "Parie sur un numéro précis 0–36 (×36) — remplace le choix",
          required: false,
          min_value: 0,
          max_value: 36,
        },
      ],
    },
    {
      name: "setavatar",
      description: "Change the bot's profile picture on this server only",
      default_member_permissions:
        PermissionFlagsBits.Administrator.toString(),
      dm_permission: false,
      options: [
        {
          type: ApplicationCommandOptionType.Attachment,
          name: "image",
          description: "Image file to use (PNG, JPG, GIF)",
          required: false,
        },
        {
          type: ApplicationCommandOptionType.String,
          name: "url",
          description: "Public URL of the image to use",
          required: false,
        },
      ],
    },
    {
      name: "levels",
      description: "Enable or disable the XP/levels system on this server",
      default_member_permissions:
        PermissionFlagsBits.ManageGuild.toString(),
      dm_permission: false,
      options: [
        {
          type: ApplicationCommandOptionType.Subcommand,
          name: "enable",
          description: "Turn on XP gain for messages and voice",
        },
        {
          type: ApplicationCommandOptionType.Subcommand,
          name: "disable",
          description: "Turn off XP gain (existing XP is kept)",
        },
        {
          type: ApplicationCommandOptionType.Subcommand,
          name: "status",
          description: "Show whether the XP system is active",
        },
      ],
    },
    {
      name: "ticket",
      description: "Manage the ticket system",
      default_member_permissions:
        PermissionFlagsBits.ManageChannels.toString(),
      dm_permission: false,
      options: [
        {
          type: ApplicationCommandOptionType.Subcommand,
          name: "setup",
          description: "Configure the ticket system (category, log channel)",
          options: [
            {
              type: ApplicationCommandOptionType.Channel,
              name: "category",
              description: "Category where ticket channels are created",
              required: false,
              channel_types: [ChannelType.GuildCategory],
            },
            {
              type: ApplicationCommandOptionType.Channel,
              name: "log",
              description: "Channel where closed ticket transcripts are sent",
              required: false,
              channel_types: [ChannelType.GuildText],
            },
          ],
        },
        {
          type: ApplicationCommandOptionType.Subcommand,
          name: "panel",
          description: "Post the ticket panel (open button) in this channel",
          options: [
            {
              type: ApplicationCommandOptionType.String,
              name: "description",
              description: "Custom text shown in the panel embed",
              required: false,
            },
          ],
        },
        {
          type: ApplicationCommandOptionType.Subcommand,
          name: "close",
          description: "Close and delete the current ticket channel",
          options: [
            {
              type: ApplicationCommandOptionType.String,
              name: "reason",
              description: "Reason for closing",
              required: false,
            },
          ],
        },
        {
          type: ApplicationCommandOptionType.Subcommand,
          name: "add",
          description: "Add a member to this ticket",
          options: [
            {
              type: ApplicationCommandOptionType.User,
              name: "user",
              description: "Member to add",
              required: true,
            },
          ],
        },
        {
          type: ApplicationCommandOptionType.Subcommand,
          name: "remove",
          description: "Remove a member from this ticket",
          options: [
            {
              type: ApplicationCommandOptionType.User,
              name: "user",
              description: "Member to remove",
              required: true,
            },
          ],
        },
        {
          type: ApplicationCommandOptionType.Subcommand,
          name: "config",
          description: "Show the current ticket system configuration",
        },
        {
          type: ApplicationCommandOptionType.Subcommand,
          name: "addsupportrole",
          description: "Add a support role that can see and manage tickets",
          options: [
            {
              type: ApplicationCommandOptionType.Role,
              name: "role",
              description: "Support role to add",
              required: true,
            },
          ],
        },
        {
          type: ApplicationCommandOptionType.Subcommand,
          name: "removesupportrole",
          description: "Remove a support role from the ticket system",
          options: [
            {
              type: ApplicationCommandOptionType.Role,
              name: "role",
              description: "Support role to remove",
              required: true,
            },
          ],
        },
        {
          type: ApplicationCommandOptionType.Subcommand,
          name: "setwelcome",
          description:
            "Set a custom welcome message for new tickets. Variables: {user} {username} {ticket_count} {server}",
          options: [
            {
              type: ApplicationCommandOptionType.String,
              name: "message",
              description:
                "Welcome message template (use {user}, {username}, {ticket_count}, {server}). Leave empty to reset.",
              required: false,
              max_length: 1000,
            },
          ],
        },
        {
          type: ApplicationCommandOptionType.Subcommand,
          name: "rename",
          description: "Rename the current ticket channel",
          options: [
            {
              type: ApplicationCommandOptionType.String,
              name: "name",
              description: "New channel name (letters, numbers, hyphens only)",
              required: true,
              max_length: 80,
            },
          ],
        },
      ],
    },
    {
      name: "resetroles",
      description:
        "Derank a member — strip all roles except those you configured to keep",
      default_member_permissions: PermissionFlagsBits.ManageRoles.toString(),
      dm_permission: false,
      options: [
        {
          type: ApplicationCommandOptionType.Subcommand,
          name: "run",
          description: "Strip all roles from a member, keeping only configured roles",
          options: [
            {
              type: ApplicationCommandOptionType.User,
              name: "user",
              description: "Member to derank",
              required: true,
            },
            {
              type: ApplicationCommandOptionType.Boolean,
              name: "confirm",
              description: "Confirm the action",
              required: true,
            },
          ],
        },
        {
          type: ApplicationCommandOptionType.Subcommand,
          name: "addrole",
          description: "Add a role to the keep list (will not be removed on derank)",
          options: [
            {
              type: ApplicationCommandOptionType.Role,
              name: "role",
              description: "Role to keep on derank",
              required: true,
            },
          ],
        },
        {
          type: ApplicationCommandOptionType.Subcommand,
          name: "removerole",
          description: "Remove a role from the keep list",
          options: [
            {
              type: ApplicationCommandOptionType.Role,
              name: "role",
              description: "Role to remove from keep list",
              required: true,
            },
          ],
        },
        {
          type: ApplicationCommandOptionType.Subcommand,
          name: "listroles",
          description: "Show all roles currently in the keep list",
        },
        {
          type: ApplicationCommandOptionType.Subcommand,
          name: "clearroles",
          description: "Clear the entire keep list",
        },
      ],
    },
    {
      name: "botrole",
      description: "Configure which roles can use bot commands",
      default_member_permissions:
        PermissionFlagsBits.Administrator.toString(),
      dm_permission: false,
      options: [
        {
          type: ApplicationCommandOptionType.Subcommand,
          name: "add",
          description: "Add a role to the authorized list",
          options: [
            {
              type: ApplicationCommandOptionType.Role,
              name: "role",
              description: "Role to authorize",
              required: true,
            },
          ],
        },
        {
          type: ApplicationCommandOptionType.Subcommand,
          name: "remove",
          description: "Remove a role from the authorized list",
          options: [
            {
              type: ApplicationCommandOptionType.Role,
              name: "role",
              description: "Role to remove",
              required: true,
            },
          ],
        },
        {
          type: ApplicationCommandOptionType.Subcommand,
          name: "clear",
          description: "Clear all restrictions — everyone can use the bot",
        },
        {
          type: ApplicationCommandOptionType.Subcommand,
          name: "list",
          description: "Show all authorized roles",
        },
      ],
    },
    {
      name: "automod",
      description: "Enable or disable automatic moderation on this server",
      default_member_permissions:
        PermissionFlagsBits.ManageGuild.toString(),
      dm_permission: false,
      options: [
        {
          type: ApplicationCommandOptionType.Subcommand,
          name: "enable",
          description: "Turn on anti-spam and toxicity detection",
        },
        {
          type: ApplicationCommandOptionType.Subcommand,
          name: "disable",
          description: "Turn off anti-spam and toxicity detection",
        },
        {
          type: ApplicationCommandOptionType.Subcommand,
          name: "status",
          description: "Show the current automod status",
        },
      ],
    },
    {
      name: "xp",
      description: "Admin: manually adjust a member's XP",
      default_member_permissions:
        PermissionFlagsBits.ManageGuild.toString(),
      dm_permission: false,
      options: [
        {
          type: ApplicationCommandOptionType.Subcommand,
          name: "give",
          description: "Add XP to a member",
          options: [
            {
              type: ApplicationCommandOptionType.User,
              name: "user",
              description: "Member to give XP to",
              required: true,
            },
            {
              type: ApplicationCommandOptionType.Integer,
              name: "amount",
              description: "Amount of XP to add",
              required: true,
              min_value: 1,
              max_value: 1_000_000,
            },
          ],
        },
        {
          type: ApplicationCommandOptionType.Subcommand,
          name: "take",
          description: "Remove XP from a member",
          options: [
            {
              type: ApplicationCommandOptionType.User,
              name: "user",
              description: "Member to remove XP from",
              required: true,
            },
            {
              type: ApplicationCommandOptionType.Integer,
              name: "amount",
              description: "Amount of XP to remove",
              required: true,
              min_value: 1,
              max_value: 1_000_000,
            },
          ],
        },
        {
          type: ApplicationCommandOptionType.Subcommand,
          name: "set",
          description: "Set a member's XP to an exact value",
          options: [
            {
              type: ApplicationCommandOptionType.User,
              name: "user",
              description: "Member to update",
              required: true,
            },
            {
              type: ApplicationCommandOptionType.Integer,
              name: "amount",
              description: "Total XP value",
              required: true,
              min_value: 0,
              max_value: 100_000_000,
            },
          ],
        },
        {
          type: ApplicationCommandOptionType.Subcommand,
          name: "reset",
          description: "Reset XP for a member or the entire server",
          options: [
            {
              type: ApplicationCommandOptionType.User,
              name: "user",
              description: "Member to reset (omit to reset the entire server)",
              required: false,
            },
            {
              type: ApplicationCommandOptionType.Boolean,
              name: "confirm_server",
              description: "Set true to confirm wiping XP for the whole server",
              required: false,
            },
          ],
        },
      ],
    },
    {
      name: "levelrole",
      description: "Manage role rewards granted automatically on level up",
      default_member_permissions: PermissionFlagsBits.ManageRoles.toString(),
      dm_permission: false,
      options: [
        {
          type: ApplicationCommandOptionType.Subcommand,
          name: "set",
          description: "Set the role to grant when a member reaches a level",
          options: [
            {
              type: ApplicationCommandOptionType.Integer,
              name: "level",
              description: "Level threshold (1-1000)",
              required: true,
              min_value: 1,
              max_value: 1000,
            },
            {
              type: ApplicationCommandOptionType.Role,
              name: "role",
              description: "Role to grant",
              required: true,
            },
          ],
        },
        {
          type: ApplicationCommandOptionType.Subcommand,
          name: "remove",
          description: "Remove the level reward for a given level",
          options: [
            {
              type: ApplicationCommandOptionType.Integer,
              name: "level",
              description: "Level threshold to remove",
              required: true,
              min_value: 1,
              max_value: 1000,
            },
          ],
        },
        {
          type: ApplicationCommandOptionType.Subcommand,
          name: "list",
          description: "List all configured level rewards",
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
    {
      name: "aiwelcome",
      description: "Configurer le message de bienvenue généré par IA",
      default_member_permissions: PermissionFlagsBits.ManageGuild.toString(),
      dm_permission: false,
      options: [
        {
          type: ApplicationCommandOptionType.Subcommand,
          name: "setup",
          description: "Définir le salon et le ton du message de bienvenue IA",
          options: [
            {
              type: ApplicationCommandOptionType.Channel,
              name: "salon",
              description: "Salon où envoyer les messages de bienvenue",
              required: true,
              channel_types: [ChannelType.GuildText],
            },
            {
              type: ApplicationCommandOptionType.String,
              name: "ton",
              description: "Style du message généré par IA",
              required: false,
              choices: [
                { name: "Chaleureux & accueillant", value: "friendly" },
                { name: "Formel & professionnel", value: "formal" },
                { name: "Drôle & décalé", value: "funny" },
                { name: "Hype & enthousiaste", value: "hype" },
              ],
            },
          ],
        },
        {
          type: ApplicationCommandOptionType.Subcommand,
          name: "test",
          description: "Tester le message de bienvenue IA dans ce salon",
          options: [
            {
              type: ApplicationCommandOptionType.User,
              name: "membre",
              description: "Membre à simuler (par défaut : toi-même)",
              required: false,
            },
          ],
        },
        {
          type: ApplicationCommandOptionType.Subcommand,
          name: "status",
          description: "Voir la configuration actuelle du welcome IA",
        },
        {
          type: ApplicationCommandOptionType.Subcommand,
          name: "clear",
          description: "Désactiver les messages de bienvenue IA",
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

const BOTROLE_BYPASS_COMMANDS = new Set(["botrole", "help", "commands"]);

async function checkBotRoleAccess(
  interaction: ChatInputCommandInteraction,
): Promise<boolean> {
  if (!interaction.guild || !interaction.member) return true;
  if (BOTROLE_BYPASS_COMMANDS.has(interaction.commandName)) return true;

  const member = interaction.member;
  if (
    typeof member.permissions !== "string" &&
    member.permissions.has("Administrator")
  )
    return true;
  if (interaction.guild.ownerId === interaction.user.id) return true;

  const requiredRoleIds = await getBotRoles(interaction.guild.id);
  if (requiredRoleIds.length === 0) return true;

  const memberRoles = member.roles;
  const hasRole = Array.isArray(memberRoles)
    ? requiredRoleIds.some((id) => memberRoles.includes(id))
    : requiredRoleIds.some((id) => memberRoles.cache.has(id));

  if (!hasRole) {
    const rolesMention = requiredRoleIds
      .map((id) => `<@&${id}>`)
      .join(", ");
    await reply(
      interaction,
      new EmbedBuilder()
        .setColor(COLOR_DANGER)
        .setTitle("🚫 Accès refusé")
        .setDescription(
          `Tu dois avoir l'un de ces rôles pour utiliser les commandes du bot :\n${rolesMention}`,
        ),
      true,
    );
    return false;
  }
  return true;
}

export async function handleInteraction(
  interaction: ChatInputCommandInteraction,
): Promise<void> {
  if (!(await checkBotRoleAccess(interaction))) return;

  const member = interaction.member as GuildMember | null;
  if (member && interaction.guild) {
    const { allowed, categoryLabel } = await checkCategoryPermission(member, interaction.commandName);
    if (!allowed) {
      const cat = getCategoryForCommand(interaction.commandName);
      await interaction.reply({
        embeds: [
          new EmbedBuilder()
            .setColor(0xed4245)
            .setTitle("🔐 Accès refusé")
            .setDescription(
              `Tu n'as pas la permission d'utiliser les commandes **${categoryLabel ?? interaction.commandName}**.`,
            )
            .addFields({
              name: "Catégorie",
              value: cat ? `\`${cat}\`` : "—",
              inline: true,
            })
            .setFooter({ text: "Contacte un administrateur pour obtenir l'accès." }),
        ],
        ephemeral: true,
      });
      return;
    }
  }

  switch (interaction.commandName) {
    case "avatar":
      return handleAvatar(interaction);
    case "serverinfo":
      return handleServerInfo(interaction);
    case "userinfo":
      return handleUserInfo(interaction);
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
    case "lock":
      return handleLock(interaction, true);
    case "unlock":
      return handleLock(interaction, false);
    case "embed":
      return handleEmbed(interaction);
    case "help":
      return handleHelp(interaction);
    case "commands":
      return handleCommands(interaction);
    case "aiwelcome":
      return handleAiWelcome(interaction);
    case "dm":
      return handleDm(interaction);
    case "channelstats":
      return handleChannelStats(interaction);
    case "level":
      return handleLevel(interaction);
    case "leaderboard":
      return handleLeaderboard(interaction);
    case "levelrole":
      return handleLevelRole(interaction);
    case "xp":
      return handleXp(interaction);
    case "automod":
      return handleAutomod(interaction);
    case "levels":
      return handleLevelsToggle(interaction);
    case "setavatar":
      return handleSetAvatar(interaction);
    case "resetroles":
      return handleResetRoles(interaction);
    case "botrole":
      return handleBotRole(interaction);
    case "ticket":
      return handleTicket(interaction);
    case "permissions":
      return handlePermissions(interaction);
    case "casino":
      return handleCasinoConfig(interaction);
    case "economy":
      return handleEconomy(interaction);
    case "balance":
      return handleBalance(interaction);
    case "daily":
      return handleDaily(interaction);
    case "slots":
      return handleSlots(interaction);
    case "blackjack":
      return handleBlackjack(interaction);
    case "roulette":
      return handleRoulette(interaction);
    case "roleinfo":
      return handleRoleInfo(interaction);
    case "poll":
      return handlePoll(interaction);
    case "quote":
      return handleQuote(interaction);
    case "stats":
      return handleStats(interaction);
    case "membercount":
      return handleMemberCount(interaction);
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

const BADGE_MAP: Partial<Record<string, string>> = {
  [String(UserFlags.Staff)]: "🏠 Discord Staff",
  [String(UserFlags.Partner)]: "🤝 Partenaire",
  [String(UserFlags.Hypesquad)]: "🎉 HypeSquad Events",
  [String(UserFlags.BugHunterLevel1)]: "🐛 Bug Hunter",
  [String(UserFlags.HypeSquadOnlineHouse1)]: "🧡 HypeSquad Bravery",
  [String(UserFlags.HypeSquadOnlineHouse2)]: "💜 HypeSquad Brilliance",
  [String(UserFlags.HypeSquadOnlineHouse3)]: "💚 HypeSquad Balance",
  [String(UserFlags.PremiumEarlySupporter)]: "🌟 Early Supporter",
  [String(UserFlags.BugHunterLevel2)]: "🏅 Bug Hunter Gold",
  [String(UserFlags.VerifiedDeveloper)]: "🤖 Verified Bot Dev",
  [String(UserFlags.CertifiedModerator)]: "🛡️ Certifié Modérateur",
  [String(UserFlags.ActiveDeveloper)]: "👨‍💻 Développeur Actif",
};

const ACTIVITY_EMOJI: Partial<Record<number, string>> = {
  [ActivityType.Playing]: "🎮",
  [ActivityType.Streaming]: "📺",
  [ActivityType.Listening]: "🎧",
  [ActivityType.Watching]: "👀",
  [ActivityType.Custom]: "✨",
  [ActivityType.Competing]: "🏆",
};

const STATUS_LABEL: Record<string, string> = {
  online: "🟢 En ligne",
  idle: "🌙 Absent",
  dnd: "🔴 Ne pas déranger",
  offline: "⚫ Hors ligne",
  invisible: "⚫ Invisible",
};

const KEY_PERMS: [bigint, string][] = [
  [PermissionFlagsBits.Administrator, "Administrateur"],
  [PermissionFlagsBits.ManageGuild, "Gérer le serveur"],
  [PermissionFlagsBits.ManageRoles, "Gérer les rôles"],
  [PermissionFlagsBits.ManageChannels, "Gérer les salons"],
  [PermissionFlagsBits.ManageMessages, "Gérer les messages"],
  [PermissionFlagsBits.KickMembers, "Expulser des membres"],
  [PermissionFlagsBits.BanMembers, "Bannir des membres"],
  [PermissionFlagsBits.MentionEveryone, "Mentionner @everyone"],
  [PermissionFlagsBits.ManageNicknames, "Gérer les pseudos"],
  [PermissionFlagsBits.MuteMembers, "Mettre en sourdine"],
  [PermissionFlagsBits.DeafenMembers, "Rendre sourd"],
];

function ts(date: Date): string {
  return `<t:${Math.floor(date.getTime() / 1000)}:R> (<t:${Math.floor(date.getTime() / 1000)}:d>)`;
}

async function handleAvatar(
  interaction: ChatInputCommandInteraction,
): Promise<void> {
  await interaction.deferReply();
  const guild = interaction.guild!;
  const targetUser = interaction.options.getUser("user") ?? interaction.user;
  const member = guild.members.cache.get(targetUser.id);

  const fetchedUser = await interaction.client.users
    .fetch(targetUser.id, { force: true })
    .catch(() => targetUser);

  const globalAvatarUrl = fetchedUser.displayAvatarURL({ size: 4096, extension: "png" });
  const serverAvatarUrl = member?.displayAvatarURL({ size: 4096, extension: "png" });
  const hasServerAvatar = serverAvatarUrl && serverAvatarUrl !== globalAvatarUrl;

  const bannerUrl = fetchedUser.bannerURL({ size: 4096 });
  const bannerColor = fetchedUser.accentColor;

  const makeButtons = (url: string, label: string) => {
    const row = new ActionRowBuilder<ButtonBuilder>();
    const isPng = !url.includes(".gif");
    row.addComponents(
      new ButtonBuilder()
        .setLabel(`⬇️ ${label} PNG`)
        .setStyle(ButtonStyle.Link)
        .setURL(url.replace(/\.(webp|gif)(\?|$)/, ".png$2")),
    );
    if (!isPng) {
      row.addComponents(
        new ButtonBuilder()
          .setLabel(`⬇️ ${label} GIF`)
          .setStyle(ButtonStyle.Link)
          .setURL(url),
      );
    }
    row.addComponents(
      new ButtonBuilder()
        .setLabel(`⬇️ ${label} WEBP`)
        .setStyle(ButtonStyle.Link)
        .setURL(url.replace(/\.(png|gif)(\?|$)/, ".webp$2")),
    );
    return row;
  };

  const avatarEmbed = new EmbedBuilder()
    .setColor(member?.displayColor || COLOR_PRIMARY)
    .setTitle(
      hasServerAvatar
        ? `🖼️ Avatar serveur — ${fetchedUser.tag}`
        : `🖼️ Avatar — ${fetchedUser.tag}`,
    )
    .setImage(hasServerAvatar ? serverAvatarUrl : globalAvatarUrl);

  const components = [makeButtons(hasServerAvatar ? serverAvatarUrl : globalAvatarUrl, "Avatar")];

  const embeds = [avatarEmbed];

  if (hasServerAvatar) {
    embeds.push(
      new EmbedBuilder()
        .setColor(COLOR_PRIMARY)
        .setTitle("🌐 Avatar global")
        .setImage(globalAvatarUrl),
    );
    components.push(makeButtons(globalAvatarUrl, "Avatar global"));
  }

  if (bannerUrl) {
    embeds.push(
      new EmbedBuilder()
        .setColor(bannerColor ?? COLOR_PRIMARY)
        .setTitle("🎨 Bannière")
        .setImage(bannerUrl),
    );
    components.push(makeButtons(bannerUrl, "Bannière"));
  } else if (bannerColor) {
    avatarEmbed.addFields({
      name: "🎨 Couleur de bannière",
      value: `#${bannerColor.toString(16).padStart(6, "0").toUpperCase()}`,
      inline: true,
    });
  }

  await interaction.editReply({ embeds, components });
}

async function handleServerInfo(
  interaction: ChatInputCommandInteraction,
): Promise<void> {
  await interaction.deferReply();
  const guild = interaction.guild!;

  const owner = await guild.fetchOwner().catch(() => null);
  const channels = guild.channels.cache;
  const textCount = channels.filter(
    (c) => c.type === ChannelType.GuildText || c.type === ChannelType.GuildAnnouncement,
  ).size;
  const voiceChannels = channels.filter(
    (c) => c.type === ChannelType.GuildVoice || c.type === ChannelType.GuildStageVoice,
  );
  const categoryCount = channels.filter((c) => c.type === ChannelType.GuildCategory).size;

  const membersInVoice = voiceChannels.reduce(
    (acc, ch) =>
      "members" in ch ? acc + ch.members.filter((m) => !m.user.bot).size : acc,
    0,
  );

  const boostTierLabel = ["Aucun", "Niveau 1", "Niveau 2", "Niveau 3"];
  const totalMembers = guild.memberCount;
  const cachedMembers = guild.members.cache;
  const botCount = cachedMembers.filter((m) => m.user.bot).size;
  const humanCount = totalMembers - botCount;

  const roleCount = guild.roles.cache.size - 1;
  const emojiCount = guild.emojis.cache.size;
  const stickerCount = guild.stickers.cache.size;

  const verif: Record<number, string> = {
    0: "Aucune",
    1: "Faible",
    2: "Moyenne",
    3: "Haute",
    4: "Très haute",
  };

  const embed = new EmbedBuilder()
    .setColor(COLOR_PRIMARY)
    .setAuthor({ name: guild.name, iconURL: guild.iconURL() ?? undefined })
    .setThumbnail(guild.iconURL({ size: 512 }) ?? null)
    .setTitle("📊 Informations du serveur")
    .addFields(
      { name: "👑 Propriétaire", value: owner ? `<@${owner.id}>` : "Inconnu", inline: true },
      { name: "🆔 ID", value: `\`${guild.id}\``, inline: true },
      { name: "📅 Créé", value: ts(guild.createdAt), inline: false },
      { name: "👥 Membres", value: `**${totalMembers}** (${humanCount} humains, ${botCount} bots)`, inline: true },
      { name: "🎭 Rôles", value: `**${roleCount}**`, inline: true },
      { name: "📝 Salons texte", value: `**${textCount}**`, inline: true },
      { name: "🔊 Salons vocaux", value: `**${voiceChannels.size}** (${membersInVoice} connecté${membersInVoice > 1 ? "s" : ""})`, inline: true },
      { name: "📁 Catégories", value: `**${categoryCount}**`, inline: true },
      { name: "😀 Emojis", value: `**${emojiCount}**${stickerCount ? ` · ${stickerCount} stickers` : ""}`, inline: true },
      {
        name: "💎 Boosts",
        value: `**${guild.premiumSubscriptionCount ?? 0}** boost${(guild.premiumSubscriptionCount ?? 0) > 1 ? "s" : ""} · ${boostTierLabel[guild.premiumTier] ?? "Inconnu"}`,
        inline: true,
      },
      { name: "🔒 Vérification", value: verif[guild.verificationLevel] ?? "?", inline: true },
    )
    .setFooter({ text: `Serveur créé le ${guild.createdAt.toLocaleDateString("fr-FR")}` });

  if (guild.bannerURL()) {
    embed.setImage(guild.bannerURL({ size: 1024 }) ?? null);
  }

  await interaction.editReply({ embeds: [embed] });
}

async function handleUserInfo(
  interaction: ChatInputCommandInteraction,
): Promise<void> {
  await interaction.deferReply();
  const guild = interaction.guild!;
  const targetUser = interaction.options.getUser("user") ?? interaction.user;
  const member = await guild.members.fetch(targetUser.id).catch(() => null);
  const fetchedUser = await interaction.client.users
    .fetch(targetUser.id, { force: true })
    .catch(() => targetUser);

  const flags = fetchedUser.flags?.toArray() ?? [];
  const badges = flags
    .map((f) => BADGE_MAP[String(f)])
    .filter(Boolean)
    .join("\n") || "Aucun";

  const presence = member?.presence;
  const statusLabel = STATUS_LABEL[presence?.status ?? "offline"] ?? "⚫ Hors ligne";

  const activities = presence?.activities ?? [];
  const activityLines = activities
    .filter((a) => a.type !== ActivityType.Custom)
    .map((a) => {
      const emoji = ACTIVITY_EMOJI[a.type] ?? "▶️";
      return `${emoji} **${a.name}**${a.details ? `\n└ ${a.details}` : ""}`;
    });
  const customStatus = activities.find((a) => a.type === ActivityType.Custom);
  if (customStatus?.state) activityLines.unshift(`✨ *${customStatus.state}*`);

  const roles = member?.roles.cache
    .filter((r) => r.id !== guild.id)
    .sort((a, b) => b.position - a.position)
    ?? null;
  const roleList = roles && roles.size > 0
    ? [...roles.values()]
        .slice(0, 25)
        .map((r) => `<@&${r.id}>`)
        .join(" ")
        + (roles.size > 25 ? ` +${roles.size - 25}` : "")
    : "Aucun";

  const perms = member
    ? KEY_PERMS.filter(([flag]) => member.permissions.has(flag)).map(([, label]) => label)
    : [];

  const isBot = fetchedUser.bot;
  const accentColor = fetchedUser.accentColor;
  const avatarUrl = member
    ? member.displayAvatarURL({ size: 256 })
    : fetchedUser.displayAvatarURL({ size: 256 });

  const embed = new EmbedBuilder()
    .setColor(member?.displayColor || accentColor || COLOR_PRIMARY)
    .setAuthor({ name: fetchedUser.tag, iconURL: avatarUrl })
    .setThumbnail(avatarUrl)
    .addFields(
      { name: "🆔 ID", value: `\`${fetchedUser.id}\``, inline: true },
      { name: "🤖 Bot", value: isBot ? "Oui" : "Non", inline: true },
      { name: "📅 Compte créé", value: ts(fetchedUser.createdAt), inline: false },
    );

  if (member) {
    embed.addFields(
      {
        name: "📥 A rejoint le serveur",
        value: member.joinedAt ? ts(member.joinedAt) : "Inconnu",
        inline: false,
      },
      {
        name: `🔔 Statut`,
        value: statusLabel,
        inline: true,
      },
    );

    if (activityLines.length > 0) {
      embed.addFields({
        name: "🎯 Activité",
        value: activityLines.join("\n").slice(0, 1024),
        inline: false,
      });
    }

    embed.addFields(
      { name: `🎭 Rôles (${roles?.size ?? 0})`, value: roleList.slice(0, 1024), inline: false },
    );

    if (perms.length > 0) {
      embed.addFields({
        name: "🔑 Permissions clés",
        value: perms.join(" · ") || "Aucune",
        inline: false,
      });
    }

    if (member.isCommunicationDisabled()) {
      embed.addFields({
        name: "🔇 Timeout jusqu'au",
        value: `<t:${Math.floor(member.communicationDisabledUntilTimestamp! / 1000)}:R>`,
        inline: true,
      });
    }

    if (member.premiumSince) {
      embed.addFields({
        name: "💎 Booste depuis",
        value: ts(member.premiumSince),
        inline: true,
      });
    }
  }

  embed.addFields({ name: "🏅 Badges", value: badges, inline: false });

  if (member?.nickname) {
    embed.setDescription(`Pseudo : **${member.nickname}**`);
  }

  await interaction.editReply({ embeds: [embed] });
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

async function handleSetAvatar(
  interaction: ChatInputCommandInteraction,
): Promise<void> {
  const attachment = interaction.options.getAttachment("image");
  const urlOption = interaction.options.getString("url");

  if (!attachment && !urlOption) {
    await reply(
      interaction,
      new EmbedBuilder()
        .setColor(COLOR_DANGER)
        .setTitle("⚠️ Paramètre manquant")
        .setDescription(
          "Fournis une pièce jointe (`image`) ou une URL (`url`).",
        ),
      true,
    );
    return;
  }

  const imageUrl = attachment?.url ?? urlOption!;
  const ALLOWED = ["image/png", "image/jpeg", "image/gif", "image/webp"];
  if (attachment && !ALLOWED.includes(attachment.contentType ?? "")) {
    await reply(
      interaction,
      new EmbedBuilder()
        .setColor(COLOR_DANGER)
        .setTitle("⚠️ Format non supporté")
        .setDescription("Utilise un fichier PNG, JPG, GIF ou WEBP."),
      true,
    );
    return;
  }

  await interaction.deferReply({ ephemeral: true });

  try {
    const res = await fetch(imageUrl);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const contentType = res.headers.get("content-type") ?? "image/png";
    if (!ALLOWED.some((t) => contentType.startsWith(t.split("/")[0]!))) {
      throw new Error("Type de contenu non supporté");
    }
    const buffer = Buffer.from(await res.arrayBuffer());
    const mime = contentType.split(";")[0]!.trim();
    const dataUrl = `data:${mime};base64,${buffer.toString("base64")}`;

    const guild = interaction.guild!;
    await interaction.client.rest.patch(`/guilds/${guild.id}/members/@me`, {
      body: { avatar: dataUrl },
    });

    const me = guild.members.me;
    await interaction.editReply({
      embeds: [
        new EmbedBuilder()
          .setColor(COLOR_SUCCESS)
          .setTitle("✅ Photo de profil mise à jour")
          .setDescription(
            `La photo de profil du bot a été changée **sur ce serveur uniquement**.\nElle reste inchangée sur les autres serveurs.\n⚠️ Discord peut limiter la fréquence des changements.`,
          )
          .setThumbnail(
            me?.displayAvatarURL() ??
              interaction.client.user.displayAvatarURL(),
          ),
      ],
    });
  } catch (err) {
    const msg =
      err instanceof Error ? err.message : "Erreur inconnue";
    await interaction.editReply({
      embeds: [
        new EmbedBuilder()
          .setColor(COLOR_DANGER)
          .setTitle("❌ Échec du changement")
          .setDescription(
            `Impossible de mettre à jour la photo de profil.\n\`${msg}\``,
          ),
      ],
    });
  }
}

async function handleLevelsToggle(
  interaction: ChatInputCommandInteraction,
): Promise<void> {
  const guild = interaction.guild!;
  const sub = interaction.options.getSubcommand();

  if (sub === "enable" || sub === "disable") {
    const enabling = sub === "enable";
    await setXpEnabled(guild.id, enabling);
    await reply(
      interaction,
      new EmbedBuilder()
        .setColor(enabling ? COLOR_SUCCESS : COLOR_WARN)
        .setTitle(enabling ? "✅ Système d'XP activé" : "⚠️ Système d'XP désactivé")
        .setDescription(
          enabling
            ? "Les membres gagnent à nouveau de l'XP par messages et en vocal."
            : "Les membres ne gagnent plus d'XP. Les données existantes sont conservées.",
        ),
      true,
    );
    return;
  }

  if (sub === "status") {
    const settings = await getGuildSettings(guild.id);
    const on = settings.xpEnabled;
    await reply(
      interaction,
      new EmbedBuilder()
        .setColor(on ? COLOR_SUCCESS : COLOR_WARN)
        .setTitle("📈 Statut du système d'XP")
        .addFields(
          {
            name: "XP par message",
            value: on ? "✅ Actif" : "❌ Désactivé",
            inline: true,
          },
          {
            name: "XP en vocal",
            value: on ? "✅ Actif" : "❌ Désactivé",
            inline: true,
          },
        )
        .setFooter({
          text: on
            ? 'Utilise "/levels disable" pour désactiver.'
            : 'Utilise "/levels enable" pour réactiver.',
        }),
      true,
    );
    return;
  }
}

async function handleTicket(
  interaction: ChatInputCommandInteraction,
): Promise<void> {
  const guild = interaction.guild!;
  const sub = interaction.options.getSubcommand();

  if (sub === "setup") {
    const category = interaction.options.getChannel("category");
    const log = interaction.options.getChannel("log");

    await saveTicketConfig(guild.id, {
      categoryId: category?.id ?? undefined,
      logChannelId: log?.id ?? undefined,
    });

    const config = await getTicketConfig(guild.id);
    const supportMention = config.supportRoleIds.length > 0
      ? config.supportRoleIds.map((id) => `<@&${id}>`).join(", ")
      : "Aucun";
    await reply(
      interaction,
      new EmbedBuilder()
        .setColor(COLOR_SUCCESS)
        .setTitle("✅ Tickets configurés")
        .addFields(
          {
            name: "Rôles support",
            value: supportMention,
            inline: true,
          },
          {
            name: "Catégorie",
            value: config.categoryId ? `<#${config.categoryId}>` : "Aucune",
            inline: true,
          },
          {
            name: "Salon de log",
            value: config.logChannelId ? `<#${config.logChannelId}>` : "Aucun",
            inline: true,
          },
        )
        .setFooter({
          text: 'Utilise "/ticket addsupportrole" pour ajouter des rôles support.',
        }),
      true,
    );
    return;
  }

  if (sub === "panel") {
    const description =
      interaction.options.getString("description") ?? undefined;
    const channel = interaction.channel as TextChannel;
    await channel.send(buildPanel(description));
    await reply(
      interaction,
      new EmbedBuilder()
        .setColor(COLOR_SUCCESS)
        .setTitle("✅ Panel posté")
        .setDescription("Le bouton d'ouverture de ticket a été publié."),
      true,
    );
    return;
  }

  if (sub === "close") {
    const reason = interaction.options.getString("reason") ?? undefined;
    const channel = interaction.channel as TextChannel;
    const member = interaction.member as GuildMember;

    const config = await getTicketConfig(guild.id);
    const isTicket = Object.values(config.openTickets).includes(channel.id);
    if (!isTicket) {
      await reply(
        interaction,
        new EmbedBuilder()
          .setColor(COLOR_DANGER)
          .setTitle("❌ Pas un ticket")
          .setDescription("Ce salon n'est pas un ticket ouvert."),
        true,
      );
      return;
    }

    await reply(
      interaction,
      new EmbedBuilder()
        .setColor(COLOR_SUCCESS)
        .setTitle("🔒 Fermeture en cours…")
        .setDescription("Le ticket va être fermé et ce canal supprimé."),
      true,
    );
    await handleTicketClose(null, channel, member, reason);
    return;
  }

  if (sub === "add" || sub === "remove") {
    const target = interaction.options.getMember("user") as GuildMember | null;
    if (!target) {
      await reply(
        interaction,
        new EmbedBuilder()
          .setColor(COLOR_DANGER)
          .setDescription("Membre introuvable sur ce serveur."),
        true,
      );
      return;
    }

    const channel = interaction.channel as TextChannel;
    const config = await getTicketConfig(guild.id);
    if (!Object.values(config.openTickets).includes(channel.id)) {
      await reply(
        interaction,
        new EmbedBuilder()
          .setColor(COLOR_DANGER)
          .setTitle("❌ Pas un ticket")
          .setDescription("Ce salon n'est pas un ticket ouvert."),
        true,
      );
      return;
    }

    if (sub === "add") {
      await channel.permissionOverwrites.edit(target.id, {
        ViewChannel: true,
        SendMessages: true,
        ReadMessageHistory: true,
        AttachFiles: true,
      });
      await reply(
        interaction,
        new EmbedBuilder()
          .setColor(COLOR_SUCCESS)
          .setTitle("✅ Membre ajouté")
          .setDescription(`<@${target.id}> peut maintenant voir ce ticket.`),
        true,
      );
    } else {
      await channel.permissionOverwrites.delete(target.id);
      await reply(
        interaction,
        new EmbedBuilder()
          .setColor(COLOR_SUCCESS)
          .setTitle("✅ Membre retiré")
          .setDescription(`<@${target.id}> ne peut plus voir ce ticket.`),
        true,
      );
    }
    return;
  }

  if (sub === "addsupportrole") {
    const role = interaction.options.getRole("role", true);
    const added = await addTicketSupportRole(guild.id, role.id);
    const config = await getTicketConfig(guild.id);
    await reply(
      interaction,
      new EmbedBuilder()
        .setColor(added ? COLOR_SUCCESS : COLOR_WARN)
        .setTitle(added ? "✅ Rôle support ajouté" : "⚠️ Déjà dans la liste")
        .setDescription(
          added
            ? `<@&${role.id}> peut maintenant voir et gérer les tickets.`
            : `<@&${role.id}> est déjà un rôle support.`,
        )
        .addFields({
          name: "Rôles support actifs",
          value: config.supportRoleIds.map((id) => `<@&${id}>`).join(", ") || "Aucun",
        }),
      true,
    );
    return;
  }

  if (sub === "removesupportrole") {
    const role = interaction.options.getRole("role", true);
    const removed = await removeTicketSupportRole(guild.id, role.id);
    const config = await getTicketConfig(guild.id);
    await reply(
      interaction,
      new EmbedBuilder()
        .setColor(removed ? COLOR_SUCCESS : COLOR_WARN)
        .setTitle(removed ? "✅ Rôle support retiré" : "⚠️ Rôle introuvable")
        .setDescription(
          removed
            ? `<@&${role.id}> n'a plus accès aux tickets.`
            : `<@&${role.id}> n'était pas dans la liste.`,
        )
        .addFields({
          name: "Rôles support restants",
          value: config.supportRoleIds.length > 0
            ? config.supportRoleIds.map((id) => `<@&${id}>`).join(", ")
            : "Aucun",
        }),
      true,
    );
    return;
  }

  if (sub === "config") {
    const config = await getTicketConfig(guild.id);
    const open = Object.keys(config.openTickets).length;
    await reply(
      interaction,
      new EmbedBuilder()
        .setColor(COLOR_PRIMARY)
        .setTitle("🎫 Configuration des tickets")
        .addFields(
          {
            name: `Rôles support (${config.supportRoleIds.length})`,
            value: config.supportRoleIds.length > 0
              ? config.supportRoleIds.map((id) => `<@&${id}>`).join(", ")
              : "Non configuré",
            inline: true,
          },
          {
            name: "Catégorie",
            value: config.categoryId
              ? `<#${config.categoryId}>`
              : "Non configurée",
            inline: true,
          },
          {
            name: "Salon de log",
            value: config.logChannelId
              ? `<#${config.logChannelId}>`
              : "Non configuré",
            inline: true,
          },
          {
            name: "Tickets ouverts",
            value: `**${open}**`,
            inline: true,
          },
          {
            name: "Total créés",
            value: `**${config.ticketCount}**`,
            inline: true,
          },
          {
            name: "Message de bienvenue",
            value: config.welcomeMessage
              ? `\`\`\`${config.welcomeMessage}\`\`\``
              : "Par défaut",
          },
        ),
      true,
    );
    return;
  }

  if (sub === "setwelcome") {
    const message = interaction.options.getString("message");

    await saveTicketConfig(guild.id, {
      welcomeMessage: message ?? undefined,
    });

    if (message) {
      const preview = message
        .replace(/\{user\}/g, `<@${interaction.user.id}>`)
        .replace(/\{username\}/g, interaction.user.username)
        .replace(/\{ticket_count\}/g, "42")
        .replace(/\{server\}/g, guild.name);

      await reply(
        interaction,
        new EmbedBuilder()
          .setColor(COLOR_SUCCESS)
          .setTitle("✅ Message de bienvenue mis à jour")
          .addFields(
            {
              name: "Template enregistré",
              value: `\`\`\`${message}\`\`\``,
            },
            {
              name: "Aperçu (ticket #42)",
              value: preview,
            },
          )
          .setFooter({
            text: "Variables disponibles : {user} {username} {ticket_count} {server}",
          }),
        true,
      );
    } else {
      await reply(
        interaction,
        new EmbedBuilder()
          .setColor(COLOR_SUCCESS)
          .setTitle("✅ Message de bienvenue réinitialisé")
          .setDescription(
            "Le message par défaut sera utilisé pour les prochains tickets.",
          ),
        true,
      );
    }
    return;
  }

  if (sub === "rename") {
    const rawName = interaction.options.getString("name", true);
    const safeName = rawName
      .toLowerCase()
      .replace(/[^a-z0-9-]/g, "-")
      .replace(/-+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 80);

    if (!safeName) {
      await reply(
        interaction,
        new EmbedBuilder()
          .setColor(COLOR_DANGER)
          .setDescription(
            "❌ Nom invalide. Utilise uniquement des lettres, chiffres et tirets.",
          ),
        true,
      );
      return;
    }

    const channel = interaction.channel as TextChannel;
    const config = await getTicketConfig(guild.id);
    if (!Object.values(config.openTickets).includes(channel.id)) {
      await reply(
        interaction,
        new EmbedBuilder()
          .setColor(COLOR_DANGER)
          .setTitle("❌ Pas un ticket")
          .setDescription("Ce salon n'est pas un ticket ouvert."),
        true,
      );
      return;
    }

    const oldName = channel.name;
    await channel.setName(safeName, `Renommé par ${interaction.user.tag}`);
    await reply(
      interaction,
      new EmbedBuilder()
        .setColor(COLOR_SUCCESS)
        .setTitle("✅ Ticket renommé")
        .setDescription(`\`${oldName}\` → \`${safeName}\``),
      true,
    );
    return;
  }
}

async function handleResetRoles(
  interaction: ChatInputCommandInteraction,
): Promise<void> {
  const guild = interaction.guild!;
  const sub = interaction.options.getSubcommand();

  if (sub === "addrole") {
    const role = interaction.options.getRole("role", true);
    const added = await addKeepRole(guild.id, role.id);
    await reply(
      interaction,
      new EmbedBuilder()
        .setColor(added ? COLOR_SUCCESS : COLOR_WARN)
        .setTitle(added ? "✅ Rôle ajouté à la liste" : "⚠️ Déjà dans la liste")
        .setDescription(
          added
            ? `<@&${role.id}> sera conservé lors des deranks.`
            : `<@&${role.id}> est déjà dans la liste.`,
        ),
      true,
    );
    return;
  }

  if (sub === "removerole") {
    const role = interaction.options.getRole("role", true);
    const removed = await removeKeepRole(guild.id, role.id);
    await reply(
      interaction,
      new EmbedBuilder()
        .setColor(removed ? COLOR_SUCCESS : COLOR_WARN)
        .setTitle(removed ? "✅ Rôle retiré de la liste" : "⚠️ Rôle introuvable")
        .setDescription(
          removed
            ? `<@&${role.id}> ne sera plus conservé lors des deranks.`
            : `<@&${role.id}> n'était pas dans la liste.`,
        ),
      true,
    );
    return;
  }

  if (sub === "listroles") {
    const ids = await getKeepRoles(guild.id);
    await reply(
      interaction,
      new EmbedBuilder()
        .setColor(COLOR_PRIMARY)
        .setTitle("🛡️ Rôles conservés lors du derank")
        .setDescription(
          ids.length > 0
            ? ids.map((id) => `• <@&${id}>`).join("\n")
            : "Aucun rôle configuré. Utilise `/resetroles addrole` pour en ajouter.",
        )
        .setFooter({ text: `${ids.length} rôle(s) configuré(s)` }),
      true,
    );
    return;
  }

  if (sub === "clearroles") {
    await clearKeepRoles(guild.id);
    await reply(
      interaction,
      new EmbedBuilder()
        .setColor(COLOR_SUCCESS)
        .setTitle("✅ Liste vidée")
        .setDescription(
          "Plus aucun rôle dans la liste. Les prochains deranks retireront tous les rôles accessibles.",
        ),
      true,
    );
    return;
  }

  if (sub === "run") {
    const confirm = interaction.options.getBoolean("confirm", true);
    if (!confirm) {
      await reply(
        interaction,
        new EmbedBuilder()
          .setColor(COLOR_WARN)
          .setTitle("⚠️ Action annulée")
          .setDescription("Tu dois mettre `confirm: True` pour exécuter le derank."),
        true,
      );
      return;
    }

    const target = interaction.options.getMember("user") as GuildMember | null;
    if (!target) {
      await reply(
        interaction,
        new EmbedBuilder().setColor(COLOR_DANGER).setDescription("❌ Membre introuvable."),
        true,
      );
      return;
    }

    if (target.id === guild.ownerId) {
      await reply(
        interaction,
        new EmbedBuilder()
          .setColor(COLOR_DANGER)
          .setDescription("❌ Impossible de modifier les rôles du propriétaire."),
        true,
      );
      return;
    }

    const botMember = guild.members.me!;
    const botHighestPos = botMember.roles.highest.position;

    const configuredKeepIds = await getKeepRoles(guild.id);
    const keptIds = new Set<string>(configuredKeepIds);

    const toRemove = target.roles.cache.filter(
      (role) =>
        role.id !== guild.id &&
        !keptIds.has(role.id) &&
        role.position < botHighestPos &&
        !role.managed,
    );

    if (toRemove.size === 0) {
      await reply(
        interaction,
        new EmbedBuilder()
          .setColor(COLOR_WARN)
          .setTitle("ℹ️ Aucun rôle à retirer")
          .setDescription(
            `<@${target.id}> n'a aucun rôle hors de la liste de conservation.`,
          ),
        true,
      );
      return;
    }

    await target.roles.remove(
      [...toRemove.keys()],
      `Derank par ${interaction.user.tag}`,
    );

    const keptNow = [...keptIds]
      .filter((id) => target.roles.cache.has(id))
      .map((id) => `<@&${id}>`)
      .join(", ") || "Aucun";

    const removedList = toRemove.map((r) => `<@&${r.id}>`).join(", ");

    await reply(
      interaction,
      new EmbedBuilder()
        .setColor(COLOR_SUCCESS)
        .setTitle("✅ Derank effectué")
        .setDescription(`Rôles de <@${target.id}> réinitialisés.`)
        .addFields(
          {
            name: `🗑️ Retirés (${toRemove.size})`,
            value: removedList.length > 1000 ? removedList.slice(0, 997) + "…" : removedList,
          },
          {
            name: "✅ Conservés",
            value: keptNow,
          },
        ),
      true,
    );
  }
}

async function handleBotRole(
  interaction: ChatInputCommandInteraction,
): Promise<void> {
  const guild = interaction.guild!;
  const sub = interaction.options.getSubcommand();

  if (sub === "add") {
    const role = interaction.options.getRole("role", true);
    if (role.managed) {
      await reply(
        interaction,
        new EmbedBuilder()
          .setColor(COLOR_DANGER)
          .setTitle("⚠️ Rôle non valide")
          .setDescription(
            `${role} est un rôle géré par une intégration et ne peut pas servir de restriction d'accès.`,
          ),
        true,
      );
      return;
    }
    const added = await addBotRole(guild.id, role.id);
    const current = await getBotRoles(guild.id);
    await reply(
      interaction,
      new EmbedBuilder()
        .setColor(added ? COLOR_SUCCESS : COLOR_WARN)
        .setTitle(added ? "✅ Rôle ajouté" : "⚠️ Déjà dans la liste")
        .setDescription(
          added
            ? `<@&${role.id}> peut maintenant utiliser les commandes du bot.`
            : `<@&${role.id}> est déjà autorisé.`,
        )
        .addFields({
          name: "Rôles autorisés",
          value: current.map((id) => `<@&${id}>`).join(", ") || "Aucun",
        })
        .setFooter({ text: "Les admins et le propriétaire sont toujours exemptés." }),
      true,
    );
    return;
  }

  if (sub === "remove") {
    const role = interaction.options.getRole("role", true);
    const removed = await removeBotRole(guild.id, role.id);
    const current = await getBotRoles(guild.id);
    await reply(
      interaction,
      new EmbedBuilder()
        .setColor(removed ? COLOR_SUCCESS : COLOR_WARN)
        .setTitle(removed ? "✅ Rôle retiré" : "⚠️ Rôle introuvable")
        .setDescription(
          removed
            ? `<@&${role.id}> n'a plus accès aux commandes du bot.`
            : `<@&${role.id}> n'était pas dans la liste.`,
        )
        .addFields({
          name: "Rôles restants",
          value: current.length > 0
            ? current.map((id) => `<@&${id}>`).join(", ")
            : "Aucun — tout le monde peut utiliser le bot.",
        }),
      true,
    );
    return;
  }

  if (sub === "clear") {
    const cleared = await clearBotRoles(guild.id);
    await reply(
      interaction,
      new EmbedBuilder()
        .setColor(cleared ? COLOR_SUCCESS : COLOR_WARN)
        .setTitle(cleared ? "✅ Restrictions supprimées" : "ℹ️ Aucune restriction")
        .setDescription(
          cleared
            ? "Tout le monde peut à nouveau utiliser les commandes du bot."
            : "Aucun rôle requis n'était configuré.",
        ),
      true,
    );
    return;
  }

  if (sub === "list") {
    const roleIds = await getBotRoles(guild.id);
    await reply(
      interaction,
      new EmbedBuilder()
        .setColor(COLOR_PRIMARY)
        .setTitle("🔑 Rôles autorisés pour le bot")
        .setDescription(
          roleIds.length > 0
            ? roleIds.map((id) => `• <@&${id}>`).join("\n")
            : "Aucun rôle configuré — tout le monde peut utiliser le bot.",
        )
        .setFooter({
          text: `${roleIds.length} rôle(s) · Les admins et le propriétaire sont toujours exemptés.`,
        }),
      true,
    );
    return;
  }
}

async function handleAutomod(
  interaction: ChatInputCommandInteraction,
): Promise<void> {
  const guild = interaction.guild!;
  const sub = interaction.options.getSubcommand();

  if (sub === "enable" || sub === "disable") {
    const enabling = sub === "enable";
    await setAutomodEnabled(guild.id, enabling);
    await reply(
      interaction,
      new EmbedBuilder()
        .setColor(enabling ? COLOR_SUCCESS : COLOR_WARN)
        .setTitle(enabling ? "✅ Automod activé" : "⚠️ Automod désactivé")
        .setDescription(
          enabling
            ? "L'anti-spam et la détection de toxicité sont maintenant **actifs** sur ce serveur."
            : "L'anti-spam et la détection de toxicité sont maintenant **désactivés**. Les messages ne seront plus filtrés automatiquement.",
        ),
      true,
    );
    return;
  }

  if (sub === "status") {
    const settings = await getGuildSettings(guild.id);
    const on = settings.automodEnabled;
    await reply(
      interaction,
      new EmbedBuilder()
        .setColor(on ? COLOR_SUCCESS : COLOR_WARN)
        .setTitle("🛡️ Statut de l'Automod")
        .addFields(
          {
            name: "Anti-spam",
            value: on ? "✅ Actif" : "❌ Désactivé",
            inline: true,
          },
          {
            name: "Détection de toxicité",
            value: on ? "✅ Actif" : "❌ Désactivé",
            inline: true,
          },
        )
        .setFooter({
          text: on
            ? 'Utilise "/automod disable" pour désactiver.'
            : 'Utilise "/automod enable" pour réactiver.',
        }),
      true,
    );
    return;
  }
}

async function handleXp(
  interaction: ChatInputCommandInteraction,
): Promise<void> {
  const guild = interaction.guild!;
  const sub = interaction.options.getSubcommand();

  if (sub === "give" || sub === "take") {
    const target = interaction.options.getUser("user", true);
    const amount = interaction.options.getInteger("amount", true);
    if (target.bot) {
      await reply(
        interaction,
        new EmbedBuilder()
          .setColor(COLOR_DANGER)
          .setTitle("⚠️ Cible invalide")
          .setDescription("Les bots ne peuvent pas avoir d'XP."),
        true,
      );
      return;
    }
    const delta = sub === "give" ? amount : -amount;
    const result = await adjustXp(guild.id, target.id, delta);
    const sign = sub === "give" ? "+" : "−";
    await reply(
      interaction,
      new EmbedBuilder()
        .setColor(COLOR_SUCCESS)
        .setTitle(sub === "give" ? "✅ XP ajoutée" : "✅ XP retirée")
        .setDescription(
          `${sign}**${amount.toLocaleString("fr-FR")} XP** appliqué à <@${target.id}>.\n` +
            `Total : **${result.totalXp.toLocaleString("fr-FR")} XP** · Niveau **${result.level}**` +
            (result.leveledUp
              ? `\n🎉 Passage du niveau ${result.previousLevel} au niveau ${result.level} !`
              : result.level < result.previousLevel
                ? `\n📉 Redescendu du niveau ${result.previousLevel} au niveau ${result.level}.`
                : ""),
        ),
      true,
    );
    return;
  }

  if (sub === "set") {
    const target = interaction.options.getUser("user", true);
    const amount = interaction.options.getInteger("amount", true);
    if (target.bot) {
      await reply(
        interaction,
        new EmbedBuilder()
          .setColor(COLOR_DANGER)
          .setTitle("⚠️ Cible invalide")
          .setDescription("Les bots ne peuvent pas avoir d'XP."),
        true,
      );
      return;
    }
    const result = await setXp(guild.id, target.id, amount);
    await reply(
      interaction,
      new EmbedBuilder()
        .setColor(COLOR_SUCCESS)
        .setTitle("✅ XP définie")
        .setDescription(
          `<@${target.id}> est maintenant à **${result.totalXp.toLocaleString("fr-FR")} XP** · Niveau **${result.level}**.`,
        ),
      true,
    );
    return;
  }

  if (sub === "reset") {
    const target = interaction.options.getUser("user");
    const confirmServer =
      interaction.options.getBoolean("confirm_server") ?? false;

    if (target) {
      const removed = await resetUserXp(guild.id, target.id);
      await reply(
        interaction,
        new EmbedBuilder()
          .setColor(removed ? COLOR_SUCCESS : COLOR_WARN)
          .setTitle(removed ? "🗑️ XP réinitialisée" : "ℹ️ Rien à réinitialiser")
          .setDescription(
            removed
              ? `L'XP de <@${target.id}> a été remise à zéro.`
              : `<@${target.id}> n'avait pas encore d'XP.`,
          ),
        true,
      );
      return;
    }

    if (!confirmServer) {
      await reply(
        interaction,
        new EmbedBuilder()
          .setColor(COLOR_WARN)
          .setTitle("⚠️ Confirmation requise")
          .setDescription(
            "Pour réinitialiser l'XP de **tout le serveur**, relance la commande avec `confirm_server: true`. Cette action est irréversible.",
          ),
        true,
      );
      return;
    }

    const count = await resetGuildXp(guild.id);
    await reply(
      interaction,
      new EmbedBuilder()
        .setColor(COLOR_SUCCESS)
        .setTitle("🗑️ XP du serveur réinitialisée")
        .setDescription(
          `L'XP de **${count}** membre(s) a été remise à zéro sur **${guild.name}**.`,
        ),
      true,
    );
    return;
  }
}

async function handleLevelRole(
  interaction: ChatInputCommandInteraction,
): Promise<void> {
  const guild = interaction.guild!;
  const sub = interaction.options.getSubcommand();

  if (sub === "set") {
    const level = interaction.options.getInteger("level", true);
    const role = interaction.options.getRole("role", true);

    const me = guild.members.me;
    if (!me) return;
    const roleInGuild = guild.roles.cache.get(role.id);
    if (roleInGuild && me.roles.highest.comparePositionTo(roleInGuild) <= 0) {
      await reply(
        interaction,
        new EmbedBuilder()
          .setColor(COLOR_DANGER)
          .setTitle("⚠️ Rôle trop élevé")
          .setDescription(
            `Mon rôle le plus haut doit être au-dessus de ${role} pour pouvoir l'attribuer.`,
          ),
        true,
      );
      return;
    }
    if (roleInGuild?.managed) {
      await reply(
        interaction,
        new EmbedBuilder()
          .setColor(COLOR_DANGER)
          .setTitle("⚠️ Rôle géré")
          .setDescription(
            `${role} est un rôle géré par une intégration et ne peut pas être attribué manuellement.`,
          ),
        true,
      );
      return;
    }

    await setLevelRole(guild.id, level, role.id);
    await reply(
      interaction,
      new EmbedBuilder()
        .setColor(COLOR_SUCCESS)
        .setTitle("✅ Récompense configurée")
        .setDescription(
          `Les membres recevront ${role} en atteignant le **niveau ${level}**.`,
        ),
      true,
    );
    return;
  }

  if (sub === "remove") {
    const level = interaction.options.getInteger("level", true);
    const removed = await removeLevelRole(guild.id, level);
    await reply(
      interaction,
      new EmbedBuilder()
        .setColor(removed ? COLOR_SUCCESS : COLOR_WARN)
        .setTitle(removed ? "🗑️ Récompense supprimée" : "ℹ️ Aucune récompense")
        .setDescription(
          removed
            ? `La récompense pour le niveau **${level}** a été retirée.`
            : `Aucune récompense n'était configurée pour le niveau **${level}**.`,
        ),
      true,
    );
    return;
  }

  if (sub === "list") {
    const rewards = await listLevelRoles(guild.id);
    if (rewards.length === 0) {
      await reply(
        interaction,
        new EmbedBuilder()
          .setColor(COLOR_PRIMARY)
          .setTitle("🎭 Récompenses de niveau")
          .setDescription(
            "Aucune récompense configurée. Utilise `/levelrole set` pour en ajouter.",
          ),
        true,
      );
      return;
    }
    const lines = rewards
      .map((r) => `• Niveau **${r.level}** → <@&${r.roleId}>`)
      .join("\n");
    await reply(
      interaction,
      new EmbedBuilder()
        .setColor(COLOR_PRIMARY)
        .setTitle("🎭 Récompenses de niveau")
        .setDescription(lines)
        .setFooter({ text: `${rewards.length} récompense(s) configurée(s)` }),
      true,
    );
    return;
  }
}

async function handleLevel(
  interaction: ChatInputCommandInteraction,
): Promise<void> {
  const target = interaction.options.getUser("user") ?? interaction.user;
  const guildId = interaction.guild!.id;
  const entry = await getUserLevel(guildId, target.id);

  if (!entry || entry.xp === 0) {
    await reply(
      interaction,
      new EmbedBuilder()
        .setColor(COLOR_PRIMARY)
        .setTitle("📈 Niveau")
        .setDescription(
          `**${target.tag}** n'a encore gagné aucune XP. Envoie des messages ou parle en vocal pour commencer !`,
        ),
      true,
    );
    return;
  }

  const progress = progressToNextLevel(entry.xp);
  const rank = await getRank(guildId, target.id);
  const filled = Math.round(progress.percent / 5);
  const bar = "▰".repeat(filled) + "▱".repeat(20 - filled);

  await reply(
    interaction,
    new EmbedBuilder()
      .setColor(COLOR_SUCCESS)
      .setTitle(`📈 Niveau de ${target.username}`)
      .setThumbnail(target.displayAvatarURL())
      .addFields(
        { name: "Niveau", value: `**${progress.level}**`, inline: true },
        {
          name: "XP totale",
          value: `**${entry.xp.toLocaleString("fr-FR")}**`,
          inline: true,
        },
        {
          name: "Rang",
          value: rank ? `**#${rank}**` : "—",
          inline: true,
        },
        {
          name: `Progression — ${progress.currentLevelXp} / ${progress.totalForNext} XP`,
          value: `${bar} **${progress.percent}%**\nIl reste **${progress.neededForNext}** XP avant le niveau ${progress.level + 1}.`,
        },
      ),
    true,
  );
}

const LB_PAGE_SIZE = 10;

async function buildLeaderboardMessage(
  guild: Guild,
  type: LbSortBy,
  page: number,
): Promise<{
  embed: EmbedBuilder;
  components: (ActionRowBuilder<StringSelectMenuBuilder> | ActionRowBuilder<ButtonBuilder>)[];
}> {
  const total = await getLeaderboardTotal(guild.id);
  const totalPages = Math.max(1, Math.ceil(total / LB_PAGE_SIZE));
  const safePage = Math.max(1, Math.min(page, totalPages));
  const offset = (safePage - 1) * LB_PAGE_SIZE;
  const entries = await getFullLeaderboard(guild.id, type, LB_PAGE_SIZE, offset);

  const typeConfig: Record<LbSortBy, { icon: string; label: string }> = {
    xp: { icon: "🏆", label: "XP & Niveaux" },
    messages: { icon: "💬", label: "Messages" },
    voice: { icon: "🎙️", label: "Temps Vocal" },
  };
  const { icon, label } = typeConfig[type];
  const medals = ["🥇", "🥈", "🥉"];

  const lines =
    entries.length === 0
      ? "*Aucune donnée disponible — écrivez des messages pour apparaître !*"
      : entries
          .map((e, i) => {
            const rank = offset + i + 1;
            const prefix = medals[rank - 1] ?? `**${rank}.**`;
            let val: string;
            if (type === "xp")
              val = `Niv. **${e.level}** · ${e.xp.toLocaleString("fr-FR")} XP`;
            else if (type === "messages")
              val = `**${e.messageCount.toLocaleString("fr-FR")}** messages`;
            else {
              const h = Math.floor(e.voiceMinutes / 60);
              const m = e.voiceMinutes % 60;
              val = h > 0 ? `**${h}h ${m}min** vocal` : `**${m}min** vocal`;
            }
            return `${prefix} <@${e.userId}> — ${val}`;
          })
          .join("\n");

  const embed = new EmbedBuilder()
    .setColor(COLOR_PRIMARY)
    .setTitle(`${icon} Classement — ${label}`)
    .setDescription(lines)
    .setThumbnail(guild.iconURL() ?? null)
    .setFooter({
      text: `Page ${safePage}/${totalPages} · ${total} membres · ${guild.name}`,
    })
    .setTimestamp();

  const selectMenu = new StringSelectMenuBuilder()
    .setCustomId("lb_select")
    .setPlaceholder("Changer de classement…")
    .addOptions(
      new StringSelectMenuOptionBuilder()
        .setLabel("🏆 XP & Niveaux")
        .setValue("xp")
        .setDefault(type === "xp"),
      new StringSelectMenuOptionBuilder()
        .setLabel("💬 Messages")
        .setValue("messages")
        .setDefault(type === "messages"),
      new StringSelectMenuOptionBuilder()
        .setLabel("🎙️ Temps Vocal")
        .setValue("voice")
        .setDefault(type === "voice"),
    );

  const selectRow = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(selectMenu);

  const prevBtn = new ButtonBuilder()
    .setCustomId(`lb_prev_${type}_${safePage}`)
    .setLabel("◀ Précédent")
    .setStyle(ButtonStyle.Secondary)
    .setDisabled(safePage <= 1);
  const pageBtn = new ButtonBuilder()
    .setCustomId("lb_noop")
    .setLabel(`Page ${safePage} / ${totalPages}`)
    .setStyle(ButtonStyle.Primary)
    .setDisabled(true);
  const nextBtn = new ButtonBuilder()
    .setCustomId(`lb_next_${type}_${safePage}`)
    .setLabel("Suivant ▶")
    .setStyle(ButtonStyle.Secondary)
    .setDisabled(safePage >= totalPages);

  const navRow = new ActionRowBuilder<ButtonBuilder>().addComponents(prevBtn, pageBtn, nextBtn);

  return { embed, components: [selectRow, navRow] };
}

async function handleLeaderboard(
  interaction: ChatInputCommandInteraction,
): Promise<void> {
  const guild = interaction.guild!;
  const { embed, components } = await buildLeaderboardMessage(guild, "xp", 1);
  await interaction.reply({ embeds: [embed], components });
}

export async function handleLeaderboardButton(
  interaction: ButtonInteraction,
): Promise<void> {
  const parts = interaction.customId.split("_");
  const action = parts[1];
  const type = parts[2] as LbSortBy;
  const currentPage = parseInt(parts[3], 10);
  const newPage = action === "prev" ? currentPage - 1 : currentPage + 1;
  const guild = interaction.guild!;
  const { embed, components } = await buildLeaderboardMessage(guild, type, newPage);
  await interaction.update({ embeds: [embed], components });
}

export async function handleLeaderboardSelect(
  interaction: StringSelectMenuInteraction,
): Promise<void> {
  const type = interaction.values[0] as LbSortBy;
  const guild = interaction.guild!;
  const { embed, components } = await buildLeaderboardMessage(guild, type, 1);
  await interaction.update({ embeds: [embed], components });
}

export async function handlePollVote(
  interaction: ButtonInteraction,
): Promise<void> {
  const parts = interaction.customId.split("_");
  const pollId = parts[1];
  const optIdx = parseInt(parts[2], 10);
  const { poll } = await castVote(pollId, interaction.user.id, optIdx);
  if (!poll) {
    await interaction.reply({ content: "❌ Ce sondage est introuvable ou terminé.", ephemeral: true });
    return;
  }
  const embed = buildPollEmbed(poll);
  const rows = buildPollComponents(poll);
  await interaction.update({ embeds: [embed], components: rows });
}

async function handleChannelStats(
  interaction: ChatInputCommandInteraction,
): Promise<void> {
  const guild = interaction.guild!;
  const list = getChannelStats(guild.id);
  const summary = getChannelStatsSummary(guild.id);

  if (list.length === 0) {
    await reply(
      interaction,
      new EmbedBuilder()
        .setColor(COLOR_PRIMARY)
        .setTitle("📊 Channel activity")
        .setDescription("No messages tracked yet since the bot started."),
      true,
    );
    return;
  }

  const top = list.slice(0, 10);
  const lines = top
    .map((c, i) => {
      const channel = guild.channels.cache.get(c.channelId);
      const name = channel ? `<#${c.channelId}>` : `\`${c.channelId}\``;
      const last = `<t:${Math.floor(c.lastSeen / 1000)}:R>`;
      return `**${i + 1}.** ${name} — **${c.count}** msgs · last ${last}`;
    })
    .join("\n");

  await reply(
    interaction,
    new EmbedBuilder()
      .setColor(COLOR_PRIMARY)
      .setTitle("📊 Channel activity")
      .setDescription(lines)
      .setFooter({
        text: `${summary.totalMessages} total messages across ${summary.activeChannels} channel(s) since the bot last started.`,
      })
      .setTimestamp(),
    true,
  );
}

async function handleDm(
  interaction: ChatInputCommandInteraction,
): Promise<void> {
  const targetUser = interaction.options.getUser("user", true);
  const text = interaction.options.getString("message", true);

  if (targetUser.bot) {
    await reply(
      interaction,
      new EmbedBuilder()
        .setColor(COLOR_DANGER)
        .setDescription("You cannot DM a bot."),
      true,
    );
    return;
  }
  if (targetUser.id === interaction.user.id) {
    await reply(
      interaction,
      new EmbedBuilder()
        .setColor(COLOR_DANGER)
        .setDescription("You cannot DM yourself through the bot."),
      true,
    );
    return;
  }

  const guild = interaction.guild!;
  const dmEmbed = new EmbedBuilder()
    .setColor(COLOR_PRIMARY)
    .setAuthor({
      name: `Message du serveur ${guild.name}`,
      iconURL: guild.iconURL({ size: 128 }) ?? undefined,
    })
    .setDescription(text.replaceAll("\\n", "\n"))
    .setFooter({ text: `Envoyé par ${interaction.user.tag}` })
    .setTimestamp();

  try {
    await targetUser.send({ embeds: [dmEmbed] });
  } catch {
    await reply(
      interaction,
      new EmbedBuilder()
        .setColor(COLOR_DANGER)
        .setDescription(
          `Impossible d'envoyer le message à ${targetUser.tag} (DM fermés ?)`,
        ),
      true,
    );
    return;
  }

  await reply(
    interaction,
    new EmbedBuilder()
      .setColor(COLOR_SUCCESS)
      .setTitle("DM envoyé")
      .setDescription(`Message envoyé à <@${targetUser.id}>.`)
      .addFields({ name: "Contenu", value: text.slice(0, 1024) })
      .setTimestamp(),
    true,
  );
}

function buildHelpEmbed(): EmbedBuilder {
  return new EmbedBuilder()
    .setColor(COLOR_PRIMARY)
    .setTitle("📜 Commandes disponibles")
    .setDescription(
      "Les commandes marquées *(admin)* nécessitent **Gérer le serveur** ou **Administrateur**.\n" +
      "Les accès par catégorie se gèrent avec `/permissions`.",
    )
    .addFields(
      {
        name: "🛡️ Modération",
        value:
          "`/warn` · `/warnings` · `/clearwarnings` · `/delwarning` → Avertissements\n" +
          "`/kick` · `/ban` · `/unban` → Expulsion & bannissement\n" +
          "`/timeout` · `/untimeout` → Mute temporaire\n" +
          "`/purge <n>` → Supprimer des messages en masse",
        inline: false,
      },
      {
        name: "🔒 Salons",
        value:
          "`/lock` · `/unlock` → Verrouiller / déverrouiller le salon\n" +
          "`/slowmode <secondes>` → Définir le délai entre messages",
        inline: false,
      },
      {
        name: "🔍 Utilitaires",
        value:
          "`/avatar [@user]` → Avatar HD + bannière\n" +
          "`/serverinfo` → Carte détaillée du serveur\n" +
          "`/userinfo [@user]` → Profil complet (badges, rôles, perms)\n" +
          "`/roleinfo <rôle>` → Infos d'un rôle (membres, perms, couleur)\n" +
          "`/stats` → Dashboard global du serveur\n" +
          "`/membercount` → Compteur de membres en temps réel\n" +
          "`/channelstats` → Top salons les plus actifs\n" +
          "`/userstats [@user]` → Stats anti-spam d'un membre\n" +
          "`/snipe` → Dernier message supprimé\n" +
          "`/ping` → Latence du bot",
        inline: false,
      },
      {
        name: "📊 Sondages & Citations",
        value:
          "`/poll create <question> <opt1> <opt2> [opt3-5]` → Sondage avec votes live\n" +
          "`/poll end <id>` → Fermer un sondage et afficher les résultats\n" +
          "`/quote random` · `/quote add` · `/quote list` · `/quote delete` → Citations",
        inline: false,
      },
      {
        name: "📈 Niveaux & XP",
        value:
          "`/level [@user]` → Voir son niveau et sa progression\n" +
          "`/leaderboard` → Classement XP / Messages / Vocal avec pagination et menu\n" +
          "`/levelrole set <niveau> <rôle>` · `remove` · `list` → Récompenses de rôle\n" +
          "`/xp give|take|set|reset <user>` *(admin)* → Ajuster l'XP\n" +
          "`/levels enable|disable|status` *(admin)* → Activer / désactiver le système",
        inline: false,
      },
      {
        name: "🎰 Casino",
        value:
          "`/balance [@user]` → Voir son portefeuille\n" +
          "`/daily` → Récompense quotidienne (+ bonus streak si activé)\n" +
          "`/slots <mise>` → Machine à sous\n" +
          "`/blackjack <mise>` → Blackjack interactif (tirer / rester / doubler)\n" +
          "`/roulette <mise> <choix>` → Roulette européenne\n" +
          "`/economy top` → Classement des membres les plus riches\n" +
          "`/economy give|take|set|reset <user>` *(admin)* → Gérer les pièces",
        inline: false,
      },
      {
        name: "🎟️ Tickets",
        value:
          "`/ticket setup` · `/ticket panel` → Créer le système de tickets *(admin)*\n" +
          "`/ticket addsupportrole` · `/ticket removesupportrole` → Gérer les rôles support *(admin)*\n" +
          "`/ticket config` → Voir / modifier la configuration *(admin)*\n" +
          "`/ticket close` · `/ticket add` · `/ticket remove` → Gérer un ticket ouvert",
        inline: false,
      },
      {
        name: "⚙️ Configuration *(admin)*",
        value:
          "`/permissions view` → Voir qui peut utiliser chaque catégorie\n" +
          "`/permissions add-role|remove-role <cat> <rôle>` → Restreindre par rôle\n" +
          "`/permissions add-user|remove-user <cat> <membre>` → Accès individuel\n" +
          "`/permissions reset <cat>` → Remettre en accès libre\n" +
          "`/casino config view|set|reset` → Config casino (monnaie, mises, daily, BJ…)\n" +
          "`/autorole set|show|clear` → Rôle attribué à l'arrivée\n" +
          "`/botrole add|remove|clear|list` → Rôles requis pour utiliser le bot\n" +
          "`/automod enable|disable|status` → Anti-spam & toxicité IA\n" +
          "`/setavatar` → Changer l'avatar du bot",
        inline: false,
      },
      {
        name: "🎨 Annonces & MP",
        value:
          "`/embed <message>` → Envoyer une annonce stylée dans le salon\n" +
          "`/dm <user> <message>` → Envoyer un message privé via le bot",
        inline: false,
      },
      {
        name: "🤖 Auto-modération (automatique)",
        value:
          "• Anti-spam pondéré (débit, doublons, mentions, liens)\n" +
          "• Détection IA de toxicité via `gpt-5-nano` — score ≥ 0.8 → suppression + warn\n" +
          "• Score ≥ 0.95 → timeout 10 min en plus\n" +
          "• 3 avertissements auto → kick automatique",
        inline: false,
      },
    )
    .setFooter({
      text: `${commandDefinitions.length} commandes • Tape / pour les invoquer`,
    })
    .setTimestamp();
}

async function handleHelp(
  interaction: ChatInputCommandInteraction,
): Promise<void> {
  await reply(interaction, buildHelpEmbed(), true);
}

async function handleCommands(
  interaction: ChatInputCommandInteraction,
): Promise<void> {
  await reply(interaction, buildHelpEmbed(), false);
}

async function handleAiWelcome(
  interaction: ChatInputCommandInteraction,
): Promise<void> {
  const sub = interaction.options.getSubcommand();
  const guildId = interaction.guildId!;
  const guild = interaction.guild!;

  if (sub === "setup") {
    const channel = interaction.options.getChannel("salon", true);
    const tone = interaction.options.getString("ton") ?? "friendly";

    if (channel.type !== ChannelType.GuildText) {
      await interaction.reply({
        embeds: [
          new EmbedBuilder()
            .setColor(0xed4245)
            .setTitle("❌ Salon invalide")
            .setDescription("Tu dois choisir un salon textuel."),
        ],
        ephemeral: true,
      });
      return;
    }

    await setWelcomeConfig(guildId, { channelId: channel.id, tone });
    await interaction.reply({
      embeds: [
        new EmbedBuilder()
          .setColor(0x57f287)
          .setTitle("✅ Welcome IA configuré")
          .setDescription(
            "À chaque nouvelle arrivée, un message de bienvenue généré par IA sera envoyé dans ce salon.\n" +
            "Utilise `/aiwelcome test` pour l'essayer.",
          )
          .addFields(
            { name: "Salon", value: `<#${channel.id}>`, inline: true },
            { name: "Ton", value: getToneLabel(tone), inline: true },
          ),
      ],
      ephemeral: true,
    });
    return;
  }

  if (sub === "test") {
    const targetUser =
      interaction.options.getUser("membre") ?? interaction.user;
    const config = await getWelcomeConfig(guildId);

    if (!config) {
      await interaction.reply({
        embeds: [
          new EmbedBuilder()
            .setColor(0xed4245)
            .setTitle("❌ Pas de configuration")
            .setDescription(
              "Configure d'abord le welcome avec `/aiwelcome setup`.",
            ),
        ],
        ephemeral: true,
      });
      return;
    }

    await interaction.deferReply({ ephemeral: true });
    const memberCount = guild.memberCount;
    const message = await generateWelcomeMessage(
      targetUser.username,
      guild.name,
      memberCount,
      config.tone,
    );

    const embed = new EmbedBuilder()
      .setColor(0x5865f2)
      .setTitle(`👋 Bienvenue sur ${guild.name} !`)
      .setDescription(message)
      .setThumbnail(targetUser.displayAvatarURL({ size: 256 }))
      .addFields(
        { name: "Membre", value: `<@${targetUser.id}>`, inline: true },
        { name: "N° de membre", value: `#${memberCount}`, inline: true },
      )
      .setFooter({
        text: "⚠️ Aperçu — le vrai message sera envoyé dans le salon configuré.",
      })
      .setTimestamp();

    await interaction.editReply({ embeds: [embed] });
    return;
  }

  if (sub === "status") {
    const config = await getWelcomeConfig(guildId);

    if (!config) {
      await interaction.reply({
        embeds: [
          new EmbedBuilder()
            .setColor(0xfee75c)
            .setTitle("⚙️ Welcome IA — Non configuré")
            .setDescription(
              "Utilise `/aiwelcome setup` pour activer les messages de bienvenue.",
            ),
        ],
        ephemeral: true,
      });
      return;
    }

    await interaction.reply({
      embeds: [
        new EmbedBuilder()
          .setColor(0x5865f2)
          .setTitle("⚙️ Welcome IA — Configuration actuelle")
          .addFields(
            { name: "Salon", value: `<#${config.channelId}>`, inline: true },
            { name: "Ton", value: getToneLabel(config.tone), inline: true },
            { name: "Statut", value: "✅ Actif", inline: true },
          ),
      ],
      ephemeral: true,
    });
    return;
  }

  if (sub === "clear") {
    const removed = await clearWelcomeConfig(guildId);
    await interaction.reply({
      embeds: [
        new EmbedBuilder()
          .setColor(removed ? 0x57f287 : 0xfee75c)
          .setTitle(
            removed ? "✅ Welcome IA désactivé" : "⚠️ Déjà désactivé",
          )
          .setDescription(
            removed
              ? "Les messages de bienvenue générés par IA ont été désactivés."
              : "Le welcome IA n'était pas activé sur ce serveur.",
          ),
      ],
      ephemeral: true,
    });
  }
}

const EMBED_COLORS: Record<string, number> = {
  blue: 0x5865f2,
  green: 0x57f287,
  yellow: 0xfee75c,
  red: 0xed4245,
  purple: 0x9b59b6,
};

async function handleEmbed(
  interaction: ChatInputCommandInteraction,
): Promise<void> {
  const text = interaction.options.getString("message", true);
  const title = interaction.options.getString("title") ?? "📢 Annonce";
  const colorChoice = interaction.options.getString("color") ?? "blue";
  const color = EMBED_COLORS[colorChoice] ?? COLOR_PRIMARY;

  const channel = interaction.channel;
  if (!channel || !("send" in channel)) {
    await reply(
      interaction,
      new EmbedBuilder()
        .setColor(COLOR_DANGER)
        .setDescription("This channel doesn't support sending messages."),
      true,
    );
    return;
  }

  const announcement = new EmbedBuilder()
    .setColor(color)
    .setTitle(title)
    .setDescription(text.replaceAll("\\n", "\n"))
    .setFooter({
      text: `Envoyé par ${interaction.user.tag}`,
      iconURL: interaction.user.displayAvatarURL({ size: 64 }),
    })
    .setTimestamp();

  await channel.send({ embeds: [announcement] });
  await reply(
    interaction,
    new EmbedBuilder()
      .setColor(COLOR_SUCCESS)
      .setDescription("Embed posted."),
    true,
  );
}

async function handleLock(
  interaction: ChatInputCommandInteraction,
  lock: boolean,
): Promise<void> {
  const channel = interaction.channel;
  const guild = interaction.guild;
  if (!guild || !channel || !("permissionOverwrites" in channel)) {
    await reply(
      interaction,
      new EmbedBuilder()
        .setColor(COLOR_DANGER)
        .setDescription(
          "This channel doesn't support permission overwrites.",
        ),
      true,
    );
    return;
  }
  const me = guild.members.me;
  if (
    !me ||
    !channel.permissionsFor(me)?.has(PermissionFlagsBits.ManageChannels)
  ) {
    await reply(
      interaction,
      new EmbedBuilder()
        .setColor(COLOR_DANGER)
        .setDescription(
          "I need the **Manage Channels** permission in this channel.",
        ),
      true,
    );
    return;
  }
  const reason =
    interaction.options.getString("reason") ??
    (lock ? "No reason provided" : "Channel reopened");
  try {
    await channel.permissionOverwrites.edit(
      guild.roles.everyone,
      { SendMessages: lock ? false : null },
      { reason: `${interaction.user.tag}: ${reason}` },
    );
  } catch (err) {
    console.error("Lock/unlock failed:", err);
    await reply(
      interaction,
      new EmbedBuilder()
        .setColor(COLOR_DANGER)
        .setDescription("Failed to update channel permissions."),
      true,
    );
    return;
  }
  await reply(
    interaction,
    new EmbedBuilder()
      .setColor(lock ? COLOR_WARN : COLOR_SUCCESS)
      .setTitle(lock ? "Channel locked" : "Channel unlocked")
      .setDescription(
        lock
          ? `<#${channel.id}> is now read-only for @everyone.`
          : `<#${channel.id}> is open again for @everyone.`,
      )
      .addFields(
        { name: "Reason", value: reason },
        { name: "Moderator", value: `<@${interaction.user.id}>` },
      )
      .setTimestamp(),
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

async function handleRoleInfo(
  interaction: ChatInputCommandInteraction,
): Promise<void> {
  const guild = interaction.guild!;
  const role = interaction.options.getRole("role", true);
  const guildRole = guild.roles.cache.get(role.id);
  if (!guildRole) {
    await reply(interaction, new EmbedBuilder().setColor(COLOR_DANGER).setDescription("❌ Rôle introuvable."), true);
    return;
  }

  const memberCount = guildRole.members.size;
  const colorHex = guildRole.color !== 0 ? `#${guildRole.color.toString(16).padStart(6, "0").toUpperCase()}` : "Par défaut";
  const createdAt = Math.floor(guildRole.createdTimestamp / 1000);

  const permList = [
    [PermissionFlagsBits.Administrator, "👑 Administrateur"],
    [PermissionFlagsBits.ManageGuild, "🏠 Gérer le serveur"],
    [PermissionFlagsBits.ManageRoles, "🎭 Gérer les rôles"],
    [PermissionFlagsBits.ManageChannels, "📁 Gérer les salons"],
    [PermissionFlagsBits.KickMembers, "👢 Expulser"],
    [PermissionFlagsBits.BanMembers, "🔨 Bannir"],
    [PermissionFlagsBits.ModerateMembers, "⏰ Timeout"],
    [PermissionFlagsBits.ManageMessages, "🗑️ Gérer messages"],
    [PermissionFlagsBits.MentionEveryone, "📢 @everyone"],
    [PermissionFlagsBits.SendMessages, "💬 Envoyer messages"],
    [PermissionFlagsBits.Connect, "🔊 Rejoindre vocal"],
    [PermissionFlagsBits.Speak, "🎙️ Parler"],
    [PermissionFlagsBits.ViewChannel, "👁️ Voir salons"],
  ] as const;

  const perms = permList
    .filter(([flag]) => guildRole.permissions.has(flag))
    .map(([, label]) => label);

  const embed = new EmbedBuilder()
    .setColor(guildRole.color || COLOR_PRIMARY)
    .setTitle(`🎭 Rôle : ${guildRole.name}`)
    .addFields(
      { name: "🆔 ID", value: `\`${guildRole.id}\``, inline: true },
      { name: "🎨 Couleur", value: colorHex, inline: true },
      { name: "👥 Membres", value: `**${memberCount}**`, inline: true },
      { name: "📅 Créé le", value: `<t:${createdAt}:F> (<t:${createdAt}:R>)`, inline: false },
      { name: "📌 Mentionnable", value: guildRole.mentionable ? "✅ Oui" : "❌ Non", inline: true },
      { name: "🔼 Affiché séparément", value: guildRole.hoist ? "✅ Oui" : "❌ Non", inline: true },
      { name: "🤖 Géré (intégration)", value: guildRole.managed ? "✅ Oui" : "❌ Non", inline: true },
      { name: "🔑 Position", value: `**#${guildRole.position}**`, inline: true },
      {
        name: `⚙️ Permissions (${perms.length})`,
        value: perms.length > 0 ? perms.join(" · ") : "Aucune permission notable",
        inline: false,
      },
    )
    .setFooter({ text: guild.name })
    .setTimestamp();

  await reply(interaction, embed, false);
}

async function handlePoll(
  interaction: ChatInputCommandInteraction,
): Promise<void> {
  const guild = interaction.guild!;
  const sub = interaction.options.getSubcommand();

  if (sub === "create") {
    const question = interaction.options.getString("question", true);
    const options: string[] = [
      interaction.options.getString("option1", true),
      interaction.options.getString("option2", true),
    ];
    for (const key of ["option3", "option4", "option5"] as const) {
      const v = interaction.options.getString(key);
      if (v) options.push(v);
    }

    const poll = await createPoll(guild.id, interaction.channelId, interaction.user.id, question, options);
    const embed = buildPollEmbed(poll);
    const rows = buildPollComponents(poll);
    const msg = await interaction.reply({ embeds: [embed], components: rows, fetchReply: true });
    await setPollMessage(poll.id, msg.id);
    return;
  }

  if (sub === "end") {
    const id = interaction.options.getString("id", true);
    const poll = await endPoll(id);
    if (!poll) {
      await reply(interaction, new EmbedBuilder().setColor(COLOR_DANGER).setDescription("❌ Sondage introuvable."), true);
      return;
    }
    if (poll.guildId !== guild.id) {
      await reply(interaction, new EmbedBuilder().setColor(COLOR_DANGER).setDescription("❌ Ce sondage n'appartient pas à ce serveur."), true);
      return;
    }
    const embed = buildPollEmbed(poll);
    await reply(interaction, embed.setTitle(`📊 [TERMINÉ] ${poll.question}`), false);
  }
}

async function handleQuote(
  interaction: ChatInputCommandInteraction,
): Promise<void> {
  const guild = interaction.guild!;
  const sub = interaction.options.getSubcommand();

  if (sub === "random") {
    const quote = await getRandomQuote(guild.id);
    if (!quote) {
      await reply(interaction, new EmbedBuilder().setColor(COLOR_WARN).setDescription("📭 Aucune citation enregistrée. Utilise `/quote add` pour en ajouter."), true);
      return;
    }
    const embed = new EmbedBuilder()
      .setColor(COLOR_PRIMARY)
      .setDescription(`> *${quote.text}*`)
      .addFields(
        { name: "✍️ Auteur", value: quote.author ?? "Anonyme", inline: true },
        { name: "🆔 ID", value: `#${quote.id}`, inline: true },
        { name: "📅 Ajoutée", value: `<t:${Math.floor(quote.addedAt / 1000)}:R>`, inline: true },
      )
      .setFooter({ text: `Ajoutée par · /quote random pour une autre` });
    await reply(interaction, embed, false);
    return;
  }

  if (sub === "add") {
    const text = interaction.options.getString("texte", true);
    const author = interaction.options.getString("auteur") ?? undefined;
    const quote = await addQuote(guild.id, text, author, interaction.user.id);
    await reply(
      interaction,
      new EmbedBuilder()
        .setColor(COLOR_SUCCESS)
        .setTitle("✅ Citation ajoutée")
        .setDescription(`> *${quote.text}*`)
        .addFields(
          { name: "Auteur", value: quote.author ?? "Anonyme", inline: true },
          { name: "ID", value: `#${quote.id}`, inline: true },
        ),
      true,
    );
    return;
  }

  if (sub === "delete") {
    const id = interaction.options.getInteger("id", true);
    const deleted = await deleteQuote(guild.id, id);
    await reply(
      interaction,
      new EmbedBuilder()
        .setColor(deleted ? COLOR_SUCCESS : COLOR_WARN)
        .setDescription(deleted ? `✅ Citation **#${id}** supprimée.` : `⚠️ Citation **#${id}** introuvable.`),
      true,
    );
    return;
  }

  if (sub === "list") {
    const page = interaction.options.getInteger("page") ?? 1;
    const result = await listQuotes(guild.id, page);

    if (result.total === 0) {
      await reply(interaction, new EmbedBuilder().setColor(COLOR_WARN).setDescription("📭 Aucune citation. Utilise `/quote add` pour commencer."), true);
      return;
    }

    const lines = result.quotes
      .map((q) => `**#${q.id}** ${q.author ? `*(${q.author})*` : ""} — ${q.text.slice(0, 80)}${q.text.length > 80 ? "…" : ""}`)
      .join("\n");

    const embed = new EmbedBuilder()
      .setColor(COLOR_PRIMARY)
      .setTitle(`💬 Citations de ${guild.name}`)
      .setDescription(lines)
      .setFooter({ text: `Page ${result.page}/${result.totalPages} · ${result.total} citation(s) au total` });

    await reply(interaction, embed, false);
  }
}

async function handleStats(
  interaction: ChatInputCommandInteraction,
): Promise<void> {
  const guild = interaction.guild!;
  await interaction.deferReply();

  const channelList = getChannelStats(guild.id);
  const summary = getChannelStatsSummary(guild.id);
  const active24h = await getActiveMembers24h(guild.id);
  const topXp = await getFullLeaderboard(guild.id, "xp", 3, 0);
  const topMsg = await getFullLeaderboard(guild.id, "messages", 3, 0);
  const topCh = channelList.slice(0, 3);

  const humanCount = guild.members.cache.filter((m) => !m.user.bot).size;
  const botCount = guild.members.cache.filter((m) => m.user.bot).size;
  const ownerId = guild.ownerId;

  const topXpStr = topXp.length > 0
    ? topXp.map((e, i) => `${["🥇","🥈","🥉"][i]} <@${e.userId}> — Niv. ${e.level}`).join("\n")
    : "Pas encore de données";

  const topMsgStr = topMsg.length > 0
    ? topMsg.map((e, i) => `${["🥇","🥈","🥉"][i]} <@${e.userId}> — ${e.messageCount.toLocaleString("fr-FR")} msgs`).join("\n")
    : "Pas encore de données";

  const topChStr = topCh.length > 0
    ? topCh.map((c, i) => {
        const ch = guild.channels.cache.get(c.channelId);
        return `${["🥇","🥈","🥉"][i]} ${ch ? `<#${c.channelId}>` : `\`${c.channelId}\``} — ${c.count} msgs`;
      }).join("\n")
    : "Pas encore de données (depuis le dernier redémarrage)";

  const createdAt = Math.floor(guild.createdTimestamp / 1000);

  const embed = new EmbedBuilder()
    .setColor(COLOR_PRIMARY)
    .setTitle(`📊 Dashboard — ${guild.name}`)
    .setThumbnail(guild.iconURL() ?? null)
    .addFields(
      {
        name: "👥 Membres",
        value: `Total : **${guild.memberCount}** · Humains : **${humanCount}** · Bots : **${botCount}**`,
        inline: false,
      },
      { name: "💬 Messages (session)", value: `**${summary.totalMessages.toLocaleString("fr-FR")}**`, inline: true },
      { name: "📺 Salons actifs", value: `**${summary.activeChannels}**`, inline: true },
      { name: "🟢 Actifs 24h", value: `**${active24h}** membres`, inline: true },
      { name: "👑 Propriétaire", value: `<@${ownerId}>`, inline: true },
      { name: "📅 Créé le", value: `<t:${createdAt}:D>`, inline: true },
      { name: "🚀 Boosts", value: `**${guild.premiumSubscriptionCount ?? 0}** (Niveau **${guild.premiumTier}**)`, inline: true },
      { name: "🏆 Top XP", value: topXpStr, inline: true },
      { name: "💬 Top Messages", value: topMsgStr, inline: true },
      { name: "📺 Top Salons", value: topChStr, inline: true },
    )
    .setFooter({ text: `ID : ${guild.id}` })
    .setTimestamp();

  await interaction.editReply({ embeds: [embed] });
}

async function handleMemberCount(
  interaction: ChatInputCommandInteraction,
): Promise<void> {
  const guild = interaction.guild!;
  await interaction.deferReply();

  await guild.members.fetch().catch(() => null);

  const total = guild.memberCount;
  const humans = guild.members.cache.filter((m) => !m.user.bot).size;
  const bots = guild.members.cache.filter((m) => m.user.bot).size;
  const online = guild.members.cache.filter(
    (m) => !m.user.bot && (m.presence?.status === "online" || m.presence?.status === "idle" || m.presence?.status === "dnd"),
  ).size;
  const offline = humans - online;

  const boostLevel = guild.premiumTier;
  const boostCount = guild.premiumSubscriptionCount ?? 0;
  const boostEmoji = ["", "🥉", "🥈", "🥇"][boostLevel] ?? "🏆";

  const bar = (v: number, t: number, width = 12) => {
    const filled = t > 0 ? Math.round((v / t) * width) : 0;
    return "█".repeat(filled) + "░".repeat(width - filled);
  };

  const createdAt = Math.floor(guild.createdTimestamp / 1000);

  const embed = new EmbedBuilder()
    .setColor(0x2ecc71)
    .setTitle(`👥 ${guild.name}`)
    .setThumbnail(guild.iconURL() ?? null)
    .addFields(
      {
        name: "📊 Membres totaux",
        value: `${"█".repeat(12)} **${total.toLocaleString("fr-FR")}** membres`,
        inline: false,
      },
      {
        name: "🟢 En ligne / inactif / dnd",
        value: `${bar(online, humans)} **${online}** / **${humans}** humains`,
        inline: false,
      },
      { name: "👤 Humains", value: `**${humans}**`, inline: true },
      { name: "🤖 Bots", value: `**${bots}**`, inline: true },
      { name: "⚫ Hors-ligne", value: `**${offline}**`, inline: true },
      {
        name: `${boostEmoji} Niveau de boost`,
        value: `Niveau **${boostLevel}** · **${boostCount}** boost${boostCount !== 1 ? "s" : ""}`,
        inline: false,
      },
      { name: "📅 Serveur créé", value: `<t:${createdAt}:F> (<t:${createdAt}:R>)`, inline: false },
    )
    .setFooter({ text: `ID : ${guild.id} · Mis à jour` })
    .setTimestamp();

  await interaction.editReply({ embeds: [embed] });
}

async function handlePermissions(
  interaction: ChatInputCommandInteraction,
): Promise<void> {
  const guild = interaction.guild!;
  const member = interaction.member as GuildMember;
  const isAdmin =
    guild.ownerId === member.id ||
    member.permissions.has(PermissionFlagsBits.Administrator) ||
    member.permissions.has(PermissionFlagsBits.ManageGuild);

  const sub = interaction.options.getSubcommand();

  // ── VIEW (non-admin allowed) ──────────────────
  if (sub === "view") {
    const allPerms = await getAllPerms(guild.id);
    const fields = CATEGORY_IDS.map((id) => {
      const cat = CATEGORIES[id];
      const perms = allPerms[id];
      const roleLines = perms.roleIds.length > 0
        ? perms.roleIds.map((r) => `<@&${r}>`).join(" ")
        : null;
      const userLines = perms.userIds.length > 0
        ? perms.userIds.map((u) => `<@${u}>`).join(" ")
        : null;

      let value: string;
      if (!roleLines && !userLines) {
        value = "🌐 *Tout le monde*";
      } else {
        const parts: string[] = [];
        if (roleLines) parts.push(`Rôles : ${roleLines}`);
        if (userLines) parts.push(`Membres : ${userLines}`);
        value = parts.join("\n");
      }

      return { name: cat.label, value, inline: false };
    });

    const embed = new EmbedBuilder()
      .setColor(COLOR_PRIMARY)
      .setTitle(`🔐 Permissions par catégorie — ${guild.name}`)
      .setDescription(
        "Si une catégorie a des restrictions, seuls les rôles/membres listés peuvent l'utiliser.\n" +
        "Les administrateurs ont toujours accès à tout.",
      )
      .addFields(...fields)
      .setFooter({ text: "Gérez les accès avec /permissions add-role / remove-role / reset" })
      .setTimestamp();

    await interaction.reply({ embeds: [embed], ephemeral: true });
    return;
  }

  // ── All other subcommands require admin ───────
  if (!isAdmin) {
    await reply(
      interaction,
      new EmbedBuilder()
        .setColor(COLOR_DANGER)
        .setDescription("❌ Tu dois être **Administrateur** ou avoir **Gérer le serveur** pour modifier les permissions."),
      true,
    );
    return;
  }

  if (sub === "add-role") {
    const categoryId = interaction.options.getString("catégorie", true) as CategoryId;
    const role = interaction.options.getRole("rôle", true);
    const perms = await permAddRole(guild.id, categoryId, role.id);
    const cat = CATEGORIES[categoryId];

    await reply(
      interaction,
      new EmbedBuilder()
        .setColor(COLOR_SUCCESS)
        .setTitle(`✅ Rôle ajouté — ${cat.label}`)
        .setDescription(`<@&${role.id}> peut maintenant utiliser les commandes **${cat.label}**.`)
        .addFields({
          name: "Rôles autorisés",
          value: perms.roleIds.length > 0 ? perms.roleIds.map((r) => `<@&${r}>`).join(" ") : "Aucun",
        })
        .setFooter({ text: `Par ${interaction.user.tag}` })
        .setTimestamp(),
      true,
    );
    return;
  }

  if (sub === "remove-role") {
    const categoryId = interaction.options.getString("catégorie", true) as CategoryId;
    const role = interaction.options.getRole("rôle", true);
    const perms = await permRemoveRole(guild.id, categoryId, role.id);
    const cat = CATEGORIES[categoryId];
    const nowOpen = perms.roleIds.length === 0 && perms.userIds.length === 0;

    await reply(
      interaction,
      new EmbedBuilder()
        .setColor(COLOR_WARN)
        .setTitle(`🗑️ Rôle retiré — ${cat.label}`)
        .setDescription(
          nowOpen
            ? `<@&${role.id}> retiré. La catégorie **${cat.label}** est maintenant **ouverte à tous**.`
            : `<@&${role.id}> n'a plus accès à **${cat.label}**.`,
        )
        .addFields({
          name: "Rôles autorisés restants",
          value: perms.roleIds.length > 0 ? perms.roleIds.map((r) => `<@&${r}>`).join(" ") : "Aucun (ouvert à tous)",
        })
        .setFooter({ text: `Par ${interaction.user.tag}` })
        .setTimestamp(),
      true,
    );
    return;
  }

  if (sub === "add-user") {
    const categoryId = interaction.options.getString("catégorie", true) as CategoryId;
    const user = interaction.options.getUser("membre", true);
    const perms = await permAddUser(guild.id, categoryId, user.id);
    const cat = CATEGORIES[categoryId];

    await reply(
      interaction,
      new EmbedBuilder()
        .setColor(COLOR_SUCCESS)
        .setTitle(`✅ Membre ajouté — ${cat.label}`)
        .setDescription(`<@${user.id}> peut maintenant utiliser les commandes **${cat.label}**, même sans le rôle requis.`)
        .addFields({
          name: "Membres autorisés",
          value: perms.userIds.length > 0 ? perms.userIds.map((u) => `<@${u}>`).join(" ") : "Aucun",
        })
        .setFooter({ text: `Par ${interaction.user.tag}` })
        .setTimestamp(),
      true,
    );
    return;
  }

  if (sub === "remove-user") {
    const categoryId = interaction.options.getString("catégorie", true) as CategoryId;
    const user = interaction.options.getUser("membre", true);
    const perms = await permRemoveUser(guild.id, categoryId, user.id);
    const cat = CATEGORIES[categoryId];
    const nowOpen = perms.roleIds.length === 0 && perms.userIds.length === 0;

    await reply(
      interaction,
      new EmbedBuilder()
        .setColor(COLOR_WARN)
        .setTitle(`🗑️ Membre retiré — ${cat.label}`)
        .setDescription(
          nowOpen
            ? `<@${user.id}> retiré. La catégorie **${cat.label}** est maintenant **ouverte à tous**.`
            : `<@${user.id}> n'a plus d'accès explicite à **${cat.label}**.`,
        )
        .setFooter({ text: `Par ${interaction.user.tag}` })
        .setTimestamp(),
      true,
    );
    return;
  }

  if (sub === "reset") {
    const rawCategory = interaction.options.getString("catégorie", true);

    if (rawCategory === "all") {
      for (const id of CATEGORY_IDS) {
        await resetCategory(guild.id, id);
      }
      await reply(
        interaction,
        new EmbedBuilder()
          .setColor(COLOR_SUCCESS)
          .setTitle("♻️ Toutes les permissions réinitialisées")
          .setDescription("Toutes les catégories sont maintenant **ouvertes à tous** (restrictions supprimées).")
          .setFooter({ text: `Par ${interaction.user.tag}` })
          .setTimestamp(),
        true,
      );
    } else {
      const categoryId = rawCategory as CategoryId;
      await resetCategory(guild.id, categoryId);
      const cat = CATEGORIES[categoryId];
      await reply(
        interaction,
        new EmbedBuilder()
          .setColor(COLOR_SUCCESS)
          .setTitle(`♻️ Réinitialisé — ${cat.label}`)
          .setDescription(`La catégorie **${cat.label}** est maintenant **ouverte à tous** (toutes les restrictions supprimées).`)
          .setFooter({ text: `Par ${interaction.user.tag}` })
          .setTimestamp(),
        true,
      );
    }
  }
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
