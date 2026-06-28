# Intégration dans ton bot

## 1. Remplace l'ID du rôle

Dans `commands/activite.js`, ligne 7 :
```js
const ROLE_ACTIF_ID = 'TON_ROLE_ID_ICI'; // ← colle l'ID du rôle ici
```

## 2. Ajoute la commande dans ton handler

Dans ton fichier de chargement de commandes (souvent `index.js` ou `bot.js`) :

```js
const { planifierResetMinuit } = require('./utils/resetActivite');

client.once('ready', () => {
  console.log(`Connecté en tant que ${client.user.tag}`);

  // Lance le reset automatique à minuit
  planifierResetMinuit(client);
});
```

## 3. Enregistre la commande slash

Si tu utilises un tableau de commandes pour `rest.put(...)` :
```js
const activite = require('./commands/activite');
// Ajoute activite.data.toJSON() dans ton tableau de commandes
```

## Fonctionnement résumé

| Étape | Ce qui se passe |
|-------|----------------|
| `/activite @membre` | Marque le membre actif, lui donne le rôle, envoie l'embed |
| Minuit | Le rôle est retiré automatiquement, la map est vidée |

## Permissions requises par le bot

- `Manage Roles` — pour donner/retirer le rôle
- Le rôle du bot doit être **au-dessus** du rôle à attribuer dans la hiérarchie
