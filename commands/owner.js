const { SlashCommandBuilder } = require('discord.js');
const config = require('../config.json');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('owner')
        .setDescription('Ping le propriétaire du bot'),

    async execute(interaction) {
        await interaction.reply(`<@${config.ownerId}>`);
    }
};
