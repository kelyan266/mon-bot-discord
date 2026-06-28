// Stockage partagé entre les commandes apply
const applyConfig = new Map(); // guildId -> { texte, salonId }
const applyCounts = new Map(); // `${guildId}-${userId}` -> nombre d'applies

module.exports = { applyConfig, applyCounts };
