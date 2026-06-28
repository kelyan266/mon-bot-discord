# Intégration du système /apply

## Fichiers à copier dans ton bot

- `commands/apply.js`
- `commands/apply-config.js`
- `utils/applyData.js`

## Ajouter les commandes dans ton déploiement

```js
const apply = require('./commands/apply');
const applyConfig = require('./commands/apply-config');
// Ajoute apply.data.toJSON() et applyConfig.data.toJSON() dans ton tableau
```

## ⚠️ Ajouter le handler du modal dans ton interactionCreate

C'est l'étape la plus importante. Dans ton fichier principal où tu gères les interactions :

```js
const apply = require('./commands/apply');

client.on('interactionCreate', async (interaction) => {

  // --- Tes commandes slash existantes ---
  if (interaction.isChatInputCommand()) {
    const command = client.commands.get(interaction.commandName);
    if (command) await command.execute(interaction);
  }

  // --- Handler du modal /apply (à ajouter) ---
  if (interaction.isModalSubmit() && interaction.customId === apply.MODAL_ID) {
    await apply.handleModal(interaction);
  }

});
```

## Utilisation

| Commande | Qui | Effet |
|----------|-----|-------|
| `/apply-config texte:... salon:#canal` | Admin | Configure le formulaire |
| `/apply` | Tout le monde | Ouvre le formulaire |

## Compteur par utilisateur

- Chaque utilisateur a son propre compteur (ex: 2 applies → "Apply n°2")
- Les compteurs persistent tant que le bot tourne
- Ils sont remis à zéro au redémarrage du bot (stockage en mémoire)
