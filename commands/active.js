const { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits } = require('discord.js');

// Map pour le reset de minuit : userId -> { guildId, roleId }
const membresActifs = new Map();

module.exports = {
  data: new SlashCommandBuilder()
    .setName('active')
    .setDescription('Définir le statut d\'activité d\'un membre')
    .addUserOption(option =>
      option
        .setName('membre')
        .setDescription('Le membre à modifier')
        .setRequired(true)
    )
    .addStringOption(option =>
      option
        .setName('statut')
        .setDescription('Activer ou désactiver le membre')
        .setRequired(true)
        .addChoices(
          { name: '✅ True — Activer', value: 'true' },
          { name: '❌ False — Désactiver', value: 'false' }
        )
    )
    .addRoleOption(option =>
      option
        .setName('role')
        .setDescription('Le rôle à attribuer ou retirer')
        .setRequired(true)
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles),

  async execute(interaction) {
    await interaction.deferReply();

    const membre = interaction.options.getMember('membre');
    const statut = interaction.options.getString('statut');
    const role = interaction.options.getRole('role');
    const actif = statut === 'true';

    if (!membre) {
      return interaction.editReply({ content: '❌ Membre introuvable dans ce serveur.' });
    }

    const botMember = interaction.guild.members.me;
    if (!botMember.permissions.has(PermissionFlagsBits.ManageRoles)) {
      return interaction.editReply({ content: '❌ Je n\'ai pas la permission de gérer les rôles.' });
    }

    if (role.position >= botMember.roles.highest.position) {
      return interaction.editReply({
        content: '❌ Mon rôle doit être au-dessus de ce rôle dans la hiérarchie.',
      });
    }

    if (actif) {
      await membre.roles.add(role, `Activité définie à true par ${interaction.user.tag}`);
      membresActifs.set(membre.id, { guildId: interaction.guild.id, roleId: role.id });

      const embed = new EmbedBuilder()
        .setColor(0x57f287)
        .setTitle('✅ Membre activé')
        .setThumbnail(membre.user.displayAvatarURL({ dynamic: true }))
        .addFields(
          { name: '👤 Membre', value: `${membre}`, inline: true },
          { name: '📌 Statut', value: '`True`', inline: true },
          { name: '🎭 Rôle', value: `${role}`, inline: true },
          { name: '🕛 Reset', value: 'Automatiquement à **minuit**', inline: false }
        )
        .setFooter({
          text: `Par ${interaction.user.tag}`,
          iconURL: interaction.user.displayAvatarURL({ dynamic: true }),
        })
        .setTimestamp();

      return interaction.editReply({ embeds: [embed] });
    } else {
      if (membre.roles.cache.has(role.id)) {
        await membre.roles.remove(role, `Activité définie à false par ${interaction.user.tag}`);
      }
      membresActifs.delete(membre.id);

      const embed = new EmbedBuilder()
        .setColor(0xed4245)
        .setTitle('❌ Membre désactivé')
        .setThumbnail(membre.user.displayAvatarURL({ dynamic: true }))
        .addFields(
          { name: '👤 Membre', value: `${membre}`, inline: true },
          { name: '📌 Statut', value: '`False`', inline: true },
          { name: '🎭 Rôle', value: `${role} retiré`, inline: true }
        )
        .setFooter({
          text: `Par ${interaction.user.tag}`,
          iconURL: interaction.user.displayAvatarURL({ dynamic: true }),
        })
        .setTimestamp();

      return interaction.editReply({ embeds: [embed] });
    }
  },

  membresActifs,
};
