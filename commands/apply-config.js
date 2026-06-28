const { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits } = require('discord.js');
const { applyConfig } = require('../utils/applyData');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('apply-config')
    .setDescription('Configurer le système de candidature')
    .addStringOption(option =>
      option
        .setName('texte')
        .setDescription('La question / le texte affiché dans le formulaire')
        .setRequired(true)
    )
    .addChannelOption(option =>
      option
        .setName('salon')
        .setDescription('Salon où envoyer les candidatures reçues')
        .setRequired(true)
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),

  async execute(interaction) {
    const texte = interaction.options.getString('texte');
    const salon = interaction.options.getChannel('salon');

    applyConfig.set(interaction.guild.id, {
      texte,
      salonId: salon.id,
    });

    const embed = new EmbedBuilder()
      .setColor(0x5865f2)
      .setTitle('⚙️ Apply configuré')
      .addFields(
        { name: '📝 Texte du formulaire', value: texte, inline: false },
        { name: '📨 Salon de réception', value: `${salon}`, inline: true }
      )
      .setFooter({
        text: `Configuré par ${interaction.user.tag}`,
        iconURL: interaction.user.displayAvatarURL({ dynamic: true }),
      })
      .setTimestamp();

    await interaction.reply({ embeds: [embed], ephemeral: true });
  },
};
