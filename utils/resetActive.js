const { membresActifs } = require('../commands/active');

function planifierResetMinuit(client) {
  const maintenant = new Date();
  const minuit = new Date();
  minuit.setHours(24, 0, 0, 0);
  const msJusquaMinuit = minuit - maintenant;

  console.log(`[Active] Reset planifié dans ${Math.round(msJusquaMinuit / 1000 / 60)} minutes.`);

  setTimeout(async () => {
    await resetActive(client);
    setInterval(() => resetActive(client), 24 * 60 * 60 * 1000);
  }, msJusquaMinuit);
}

async function resetActive(client) {
  console.log('[Active] Reset de minuit...');

  for (const [userId, { guildId, roleId }] of membresActifs.entries()) {
    try {
      const guild = await client.guilds.fetch(guildId);
      const member = await guild.members.fetch(userId);
      const role = guild.roles.cache.get(roleId);

      if (role && member.roles.cache.has(role.id)) {
        await member.roles.remove(role, 'Reset automatique minuit');
        console.log(`[Active] Rôle retiré de ${member.user.tag}`);
      }
    } catch (err) {
      console.error(`[Active] Erreur userId ${userId}:`, err.message);
    }
  }

  membresActifs.clear();
  console.log('[Active] Reset terminé.');
}

module.exports = { planifierResetMinuit };
