const {
  SlashCommandBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  ActionRowBuilder,
  EmbedBuilder,
} = require('discord.js');
const { applyConfig, applyCounts } = require('../utils/applyData');

const MODAL_ID = 'apply_modal';
const INPUT_ID = 'apply_reponse';

module.exports = {
  data: new SlashCommandBuilder()
    .setName('apply')
    .setDescription('Soumettre une candidature'),

  async execute(interaction) {
    const config = applyConfig.get(interaction.guild.id);

    if (!config) {
      return interaction.reply({
        content: '❌ Le système de candidature n\'est pas encore configuré. Un administrateur doit utiliser `/apply-config` d\'abord.',
        ephemeral: true,
      });
    }

    // Créer le modal avec le texte configuré
    const modal = new ModalBuilder()
      .setCustomId(MODAL_ID)
      .setTitle('📋 Candidature');

    const input = new TextInputBuilder()
      .setCustomId(INPUT_ID)
      .setLabel(config.texte.length > 45 ? config.texte.slice(0, 42) + '...' : config.texte)
      .setStyle(TextInputStyle.Paragraph)
      .setPlaceholder('Écris ta réponse ici...')
      .setRequired(true)
      .setMaxLength(1000);

    modal.addComponents(new ActionRowBuilder().addComponents(input));

    await interaction.showModal(modal);
  },

  // Gérer la soumission du modal
  async handleModal(interaction) {
    const config = applyConfig.get(interaction.guild.id);
    if (!config) return;

    const reponse = interaction.fields.getTextInputValue(INPUT_ID);
    const key = `${interaction.guild.id}-${interaction.user.id}`;

    // Incrémenter le compteur
    const count = (applyCounts.get(key) || 0) + 1;
    applyCounts.set(key, count);

    // Envoyer l'embed dans le salon configuré
    const salon = interaction.guild.channels.cache.get(config.salonId);
    if (!salon) {
      return interaction.reply({
        content: '❌ Le salon de réception est introuvable. Reconfigure avec `/apply-config`.',
        ephemeral: true,
      });
    }

    const embed = new EmbedBuilder()
      .setColor(0x5865f2)
      .setTitle('📋 Nouvelle candidature')
      .setThumbnail(interaction.user.displayAvatarURL({ dynamic: true }))
      .addFields(
        { name: '👤 Candidat', value: `${interaction.user}`, inline: true },
        { name: '🔢 Apply n°', value: `\`${count}\` pour cet utilisateur`, inline: true },
        { name: `❓ ${config.texte}`, value: reponse, inline: false }
      )
      .setFooter({ text: `ID: ${interaction.user.id}` })
      .setTimestamp();

    await salon.send({ embeds: [embed] });

    // Confirmer à l'utilisateur (visible uniquement par lui)
    await interaction.reply({
      embeds: [
        new EmbedBuilder()
          .setColor(0x57f287)
          .setTitle('✅ Candidature envoyée !')
          .setDescription(`Ta candidature n°**${count}** a bien été transmise.`)
          .setTimestamp(),
      ],
      ephemeral: true,
    });
  },

  MODAL_ID,
};
