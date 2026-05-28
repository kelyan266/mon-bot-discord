import { useState, useMemo } from "react";
import {
  Search, ChevronDown, ChevronRight,
  Shield, Lock, ScanSearch, BarChart2, Trophy, Coins,
  Ticket, CalendarDays, Music2, Mic2, Megaphone,
  Settings2, ShieldAlert, Smile, Zap,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

interface Command {
  name: string;
  usage: string;
  description: string;
  details?: string;
  permissions?: string;
  options?: { name: string; description: string; required?: boolean }[];
}

interface Category {
  id: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  color: string;
  commands: Command[];
}

const CATEGORIES: Category[] = [
  {
    id: "moderation",
    label: "Modération",
    icon: Shield,
    color: "#ED4245",
    commands: [
      {
        name: "/warn",
        usage: "/warn <user> <raison>",
        description: "Ajouter un avertissement à un membre.",
        details: "Après 3 avertissements cumulés (manuels + auto), le membre est automatiquement expulsé. Un DM est envoyé à chaque warn.",
        permissions: "Gérer les messages",
        options: [
          { name: "user", description: "Le membre à avertir", required: true },
          { name: "raison", description: "Raison de l'avertissement", required: true },
        ],
      },
      {
        name: "/warnings",
        usage: "/warnings [@user]",
        description: "Voir la liste des avertissements d'un membre.",
        options: [
          { name: "@user", description: "Le membre (vous par défaut)", required: false },
        ],
      },
      {
        name: "/clearwarnings",
        usage: "/clearwarnings <user>",
        description: "Supprimer tous les avertissements d'un membre.",
        permissions: "Gérer les messages",
        options: [
          { name: "user", description: "Le membre dont effacer les warns", required: true },
        ],
      },
      {
        name: "/delwarning",
        usage: "/delwarning <user> <id>",
        description: "Supprimer un avertissement précis par son ID.",
        permissions: "Gérer les messages",
        options: [
          { name: "user", description: "Le membre", required: true },
          { name: "id", description: "L'identifiant du warn (visible avec /warnings)", required: true },
        ],
      },
      {
        name: "/kick",
        usage: "/kick <user> [raison]",
        description: "Expulser un membre du serveur.",
        details: "Le membre reçoit un DM avec la raison avant d'être expulsé. Il peut revenir avec une invitation.",
        permissions: "Expulser des membres",
        options: [
          { name: "user", description: "Le membre à expulser", required: true },
          { name: "raison", description: "Raison de l'expulsion", required: false },
        ],
      },
      {
        name: "/ban",
        usage: "/ban <user> [raison]",
        description: "Bannir un membre du serveur.",
        details: "Bannissement permanent. Un DM est envoyé avec la raison avant le ban.",
        permissions: "Bannir des membres",
        options: [
          { name: "user", description: "Le membre à bannir", required: true },
          { name: "raison", description: "Raison du ban", required: false },
        ],
      },
      {
        name: "/unban",
        usage: "/unban <user-id>",
        description: "Débannir un utilisateur.",
        permissions: "Bannir des membres",
        options: [
          { name: "user-id", description: "L'ID Discord de l'utilisateur à débannir", required: true },
        ],
      },
      {
        name: "/timeout",
        usage: "/timeout <user> <durée>",
        description: "Mettre un membre en sourdine temporairement.",
        details: "Le membre ne peut plus écrire ni parler en vocal pendant la durée spécifiée (en minutes).",
        permissions: "Modérer des membres",
        options: [
          { name: "user", description: "Le membre à mettre en timeout", required: true },
          { name: "durée", description: "Durée en minutes", required: true },
        ],
      },
      {
        name: "/untimeout",
        usage: "/untimeout <user>",
        description: "Retirer la sourdine d'un membre.",
        permissions: "Modérer des membres",
        options: [
          { name: "user", description: "Le membre dont lever le timeout", required: true },
        ],
      },
      {
        name: "/purge",
        usage: "/purge <n>",
        description: "Supprimer les N derniers messages du salon.",
        details: "Supprime entre 1 et 100 messages. Les messages de plus de 14 jours ne peuvent pas être supprimés.",
        permissions: "Gérer les messages",
        options: [
          { name: "n", description: "Nombre de messages à supprimer (1–100)", required: true },
        ],
      },
    ],
  },
  {
    id: "channels",
    label: "Salons",
    icon: Lock,
    color: "#5865F2",
    commands: [
      {
        name: "/lock",
        usage: "/lock [raison]",
        description: "Verrouiller le salon — personne ne peut écrire.",
        permissions: "Gérer les salons",
        options: [
          { name: "raison", description: "Raison du verrouillage (optionnel)", required: false },
        ],
      },
      {
        name: "/unlock",
        usage: "/unlock",
        description: "Déverrouiller le salon.",
        permissions: "Gérer les salons",
      },
      {
        name: "/slowmode",
        usage: "/slowmode <secondes>",
        description: "Délai entre les messages dans ce salon.",
        details: "Mets 0 pour désactiver. Maximum 21600 secondes (6 heures).",
        permissions: "Gérer les salons",
        options: [
          { name: "secondes", description: "Délai en secondes (0 = désactiver)", required: true },
        ],
      },
    ],
  },
  {
    id: "utility",
    label: "Utilitaires",
    icon: ScanSearch,
    color: "#00B0F4",
    commands: [
      {
        name: "/avatar",
        usage: "/avatar [@user]",
        description: "Avatar HD + bannière d'un membre.",
        options: [
          { name: "@user", description: "Le membre (vous par défaut)", required: false },
        ],
      },
      {
        name: "/serverinfo",
        usage: "/serverinfo",
        description: "Carte détaillée du serveur : membres, boosts, création, etc.",
      },
      {
        name: "/userinfo",
        usage: "/userinfo [@user]",
        description: "Profil complet d'un membre : badges, rôles, permissions.",
        options: [
          { name: "@user", description: "Le membre (vous par défaut)", required: false },
        ],
      },
      {
        name: "/roleinfo",
        usage: "/roleinfo <rôle>",
        description: "Infos d'un rôle : membres qui l'ont, permissions, couleur.",
        options: [
          { name: "rôle", description: "Le rôle à inspecter", required: true },
        ],
      },
      {
        name: "/stats",
        usage: "/stats",
        description: "Dashboard global du serveur.",
      },
      {
        name: "/membercount",
        usage: "/membercount",
        description: "Compteur de membres en temps réel.",
      },
      {
        name: "/channelstats",
        usage: "/channelstats",
        description: "Top des salons les plus actifs.",
      },
      {
        name: "/userstats",
        usage: "/userstats [@user]",
        description: "Stats anti-spam d'un membre.",
        options: [
          { name: "@user", description: "Le membre (vous par défaut)", required: false },
        ],
      },
      {
        name: "/rolemembers",
        usage: "/rolemembers <rôle>",
        description: "Compter et lister les membres ayant un rôle.",
        options: [
          { name: "rôle", description: "Le rôle à inspecter", required: true },
        ],
      },
      {
        name: "/snipe",
        usage: "/snipe",
        description: "Réafficher le dernier message supprimé dans ce salon.",
        details: "Messages conservés en mémoire pendant 1 heure. Un seul message par salon.",
      },
      {
        name: "/ping",
        usage: "/ping",
        description: "Latence du bot et de l'API Discord.",
      },
    ],
  },
  {
    id: "polls",
    label: "Sondages & Citations",
    icon: BarChart2,
    color: "#9B59B6",
    commands: [
      {
        name: "/poll create",
        usage: "/poll create <question> <opt1> <opt2> [opt3–5]",
        description: "Créer un sondage avec votes en temps réel.",
        details: "Jusqu'à 5 options. Chaque membre ne peut voter qu'une seule fois. Résultats visibles sur le dashboard.",
        options: [
          { name: "question", description: "La question du sondage", required: true },
          { name: "opt1/opt2", description: "Les choix de réponse (minimum 2)", required: true },
          { name: "opt3–5", description: "Options supplémentaires", required: false },
        ],
      },
      {
        name: "/poll end",
        usage: "/poll end <id>",
        description: "Fermer un sondage et afficher les résultats définitifs.",
        permissions: "Gérer les messages",
        options: [
          { name: "id", description: "L'ID du sondage à terminer", required: true },
        ],
      },
      {
        name: "/quote random",
        usage: "/quote random",
        description: "Afficher une citation aléatoire du serveur.",
      },
      {
        name: "/quote add",
        usage: "/quote add <texte> [auteur]",
        description: "Ajouter une citation à la collection du serveur.",
        options: [
          { name: "texte", description: "Le texte de la citation", required: true },
          { name: "auteur", description: "L'auteur de la citation", required: false },
        ],
      },
      {
        name: "/quote list",
        usage: "/quote list",
        description: "Voir toutes les citations du serveur.",
      },
      {
        name: "/quote delete",
        usage: "/quote delete <id>",
        description: "Supprimer une citation par son ID.",
        permissions: "Gérer les messages",
        options: [
          { name: "id", description: "L'ID de la citation à supprimer", required: true },
        ],
      },
    ],
  },
  {
    id: "levels",
    label: "Niveaux & XP",
    icon: Trophy,
    color: "#F0B232",
    commands: [
      {
        name: "/level",
        usage: "/level [@user]",
        description: "Afficher le niveau, l'XP et la barre de progression d'un membre.",
        details: "15–25 XP par message (cooldown 60s) • 10 XP/min en vocal (≥2 humains). Formule : 5L² + 50L + 100 XP pour passer au niveau suivant.",
        options: [
          { name: "@user", description: "Le membre (vous par défaut)", required: false },
        ],
      },
      {
        name: "/leaderboard",
        usage: "/leaderboard",
        description: "Classement XP / Messages / Vocal avec pagination.",
      },
      {
        name: "/levelrole set",
        usage: "/levelrole set <niveau> <rôle>",
        description: "Attribuer un rôle automatiquement quand un membre atteint un niveau.",
        details: "Les rôles sont cumulatifs : atteindre le niveau 20 octroie aussi les rôles des niveaux inférieurs non encore obtenus.",
        permissions: "Gérer le serveur",
        options: [
          { name: "niveau", description: "Le niveau déclencheur", required: true },
          { name: "rôle", description: "Le rôle à attribuer", required: true },
        ],
      },
      {
        name: "/levelrole remove",
        usage: "/levelrole remove <niveau>",
        description: "Retirer la récompense de rôle pour un niveau.",
        permissions: "Gérer le serveur",
        options: [
          { name: "niveau", description: "Le niveau dont supprimer la récompense", required: true },
        ],
      },
      {
        name: "/levelrole list",
        usage: "/levelrole list",
        description: "Voir toutes les récompenses de rôle configurées.",
      },
    ],
  },
  {
    id: "casino",
    label: "Casino",
    icon: Coins,
    color: "#F1C40F",
    commands: [
      {
        name: "/balance",
        usage: "/balance [@user]",
        description: "Voir le portefeuille de pièces d'un membre.",
        options: [
          { name: "@user", description: "Le membre (vous par défaut)", required: false },
        ],
      },
      {
        name: "/daily",
        usage: "/daily",
        description: "Récompense quotidienne de pièces (+ bonus streak).",
        details: "Disponible une fois par 24h. Le streak augmente avec les claims consécutifs (+10% par jour, plafonné à 7 jours).",
      },
      {
        name: "/slots",
        usage: "/slots <mise>",
        description: "Machine à sous — 3 symboles pour gagner.",
        details: "Triple 7 = jackpot (×20 par défaut). Double symbole = ×1.5. Symboles : 🍒🍋🍇🍉🍊💎7️⃣",
        options: [
          { name: "mise", description: "Nombre de pièces à miser", required: true },
        ],
      },
      {
        name: "/blackjack",
        usage: "/blackjack <mise>",
        description: "Blackjack interactif : tirer / rester / doubler.",
        details: "Le croupier tire jusqu'à 17. Blackjack naturel = ×2.5. Victoire = ×2. Double possible si le solde le permet.",
        options: [
          { name: "mise", description: "Nombre de pièces à miser", required: true },
        ],
      },
      {
        name: "/roulette",
        usage: "/roulette <mise> <choix>",
        description: "Roulette européenne (rouge/noir/pair/impair/numéro).",
        details: "Rouge/Noir/Pair/Impair = ×2 • Douzaines (1–12, 13–24, 25–36) = ×3 • Numéro plein = ×36",
        options: [
          { name: "mise", description: "Nombre de pièces à miser", required: true },
          { name: "choix", description: "rouge | noir | pair | impair | 1-12 | 13-24 | 25-36 | numéro", required: true },
        ],
      },
      {
        name: "/economy top",
        usage: "/economy top",
        description: "Classement des membres les plus riches du serveur.",
      },
    ],
  },
  {
    id: "tickets",
    label: "Tickets",
    icon: Ticket,
    color: "#E74C3C",
    commands: [
      {
        name: "/ticket close",
        usage: "/ticket close",
        description: "Fermer le ticket actuel (et l'archiver).",
      },
      {
        name: "/ticket add",
        usage: "/ticket add <user>",
        description: "Ajouter un membre au ticket ouvert.",
        options: [
          { name: "user", description: "Le membre à ajouter", required: true },
        ],
      },
      {
        name: "/ticket remove",
        usage: "/ticket remove <user>",
        description: "Retirer un membre du ticket ouvert.",
        options: [
          { name: "user", description: "Le membre à retirer", required: true },
        ],
      },
    ],
  },
  {
    id: "events",
    label: "Événements",
    icon: CalendarDays,
    color: "#2ECC71",
    commands: [
      {
        name: "/event create",
        usage: "/event create <titre> <description> <date> <heure>",
        description: "Créer un événement sur le serveur.",
        details: "Format date : JJ/MM/AAAA · Format heure : HH:MM. Options supplémentaires : places max, rappel en minutes avant le début.",
        options: [
          { name: "titre", description: "Nom de l'événement", required: true },
          { name: "description", description: "Description", required: true },
          { name: "date", description: "Date (JJ/MM/AAAA)", required: true },
          { name: "heure", description: "Heure (HH:MM)", required: true },
        ],
      },
      {
        name: "/event join",
        usage: "/event join <id>",
        description: "S'inscrire à un événement.",
        options: [
          { name: "id", description: "L'ID de l'événement", required: true },
        ],
      },
      {
        name: "/event leave",
        usage: "/event leave <id>",
        description: "Se désinscrire d'un événement.",
        options: [
          { name: "id", description: "L'ID de l'événement", required: true },
        ],
      },
      {
        name: "/event list",
        usage: "/event list",
        description: "Voir tous les événements à venir du serveur.",
      },
      {
        name: "/event info",
        usage: "/event info <id>",
        description: "Détails complets d'un événement + liste des inscrits.",
        options: [
          { name: "id", description: "L'ID de l'événement", required: true },
        ],
      },
      {
        name: "/event cancel",
        usage: "/event cancel <id>",
        description: "Annuler un événement (créateur ou admin).",
        options: [
          { name: "id", description: "L'ID de l'événement à annuler", required: true },
        ],
      },
    ],
  },
  {
    id: "activity",
    label: "Activité & Présence",
    icon: Music2,
    color: "#1DB954",
    commands: [
      {
        name: "/spotify",
        usage: "/spotify [@membre]",
        description: "Carte Spotify immersive d'un membre (cover, barre de progression, artiste, album).",
        options: [
          { name: "@membre", description: "Le membre (vous par défaut)", required: false },
        ],
      },
      {
        name: "/activity",
        usage: "/activity [@membre]",
        description: "Toutes les activités d'un membre : Spotify, jeu, stream, etc.",
        options: [
          { name: "@membre", description: "Le membre (vous par défaut)", required: false },
        ],
      },
      {
        name: "/whoisplaying",
        usage: "/whoisplaying <jeu>",
        description: "Lister les membres qui jouent à un jeu en ce moment.",
        options: [
          { name: "jeu", description: "Nom du jeu", required: true },
        ],
      },
      {
        name: "/listening",
        usage: "/listening",
        description: "Voir les membres qui écoutent Spotify en ce moment.",
      },
      {
        name: "/sessions",
        usage: "/sessions",
        description: "Vue d'ensemble du serveur : statuts, jeux actifs, Spotify, streams.",
      },
    ],
  },
  {
    id: "voice",
    label: "Vocal",
    icon: Mic2,
    color: "#57F287",
    commands: [
      {
        name: "/tempvc create",
        usage: "/tempvc create [nom]",
        description: "Créer un salon vocal temporaire et t'y déplacer.",
        details: "Le salon est supprimé automatiquement quand il se vide.",
        options: [
          { name: "nom", description: "Nom du salon (optionnel)", required: false },
        ],
      },
      {
        name: "/tempvc rename",
        usage: "/tempvc rename <nom>",
        description: "Renommer ton salon vocal temporaire actif.",
        options: [
          { name: "nom", description: "Le nouveau nom", required: true },
        ],
      },
      {
        name: "/tempvc sethub",
        usage: "/tempvc sethub <salon>",
        description: "Définir un salon « hub » de création automatique.",
        details: "Rejoindre ce salon crée automatiquement un temp VC personnel pour chaque membre.",
        permissions: "Gérer les salons",
        options: [
          { name: "salon", description: "Le salon vocal à définir comme hub", required: true },
        ],
      },
      {
        name: "/tempvc clearhub",
        usage: "/tempvc clearhub",
        description: "Retirer le salon hub de ce serveur.",
        permissions: "Gérer les salons",
      },
      {
        name: "/voice lock",
        usage: "/voice lock",
        description: "Verrouiller le salon vocal où tu es — personne ne peut rejoindre.",
        details: "Seul le créateur du salon ou un admin peut verrouiller un salon temporaire.",
      },
      {
        name: "/voice unlock",
        usage: "/voice unlock",
        description: "Déverrouiller le salon vocal.",
      },
    ],
  },
  {
    id: "announce",
    label: "Annonces & Messages",
    icon: Megaphone,
    color: "#EB459E",
    commands: [
      {
        name: "/say",
        usage: "/say <message> [salon]",
        description: "Faire parler le bot dans un salon.",
        permissions: "Gérer les messages",
        options: [
          { name: "message", description: "Le message à envoyer", required: true },
          { name: "salon", description: "Le salon cible (actuel par défaut)", required: false },
        ],
      },
      {
        name: "/mention",
        usage: "/mention <cible> [message] [salon]",
        description: "Mentionner un membre ou un rôle via le bot.",
        permissions: "Gérer les messages",
        options: [
          { name: "cible", description: "Le membre ou rôle à mentionner", required: true },
          { name: "message", description: "Message accompagnant la mention", required: false },
          { name: "salon", description: "Le salon cible", required: false },
        ],
      },
      {
        name: "/announce",
        usage: "/announce <message> [salon] [embed]",
        description: "Annonce @everyone (option embed stylé).",
        permissions: "Mentionner @everyone",
        options: [
          { name: "message", description: "Le texte de l'annonce", required: true },
          { name: "salon", description: "Le salon cible", required: false },
          { name: "embed", description: "Afficher en embed stylé", required: false },
        ],
      },
      {
        name: "/embed",
        usage: "/embed <message> [titre] [couleur]",
        description: "Envoyer une annonce en embed personnalisé.",
        permissions: "Gérer les messages",
        options: [
          { name: "message", description: "Corps du message", required: true },
          { name: "titre", description: "Titre de l'embed", required: false },
          { name: "couleur", description: "Couleur : bleu, vert, jaune, rouge, violet…", required: false },
        ],
      },
      {
        name: "/dm",
        usage: "/dm <user> <message>",
        description: "Envoyer un message privé à un membre via le bot.",
        permissions: "Gérer les messages",
        options: [
          { name: "user", description: "Le destinataire", required: true },
          { name: "message", description: "Le contenu du message", required: true },
        ],
      },
      {
        name: "/partenariat",
        usage: "/partenariat <partenaire> <message> [lien] [image] [logo] [salon]",
        description: "Publier une annonce de partenariat formatée avec embed doré.",
        details: "Ping @everyone automatique. Embed gold avec logo, image, lien cliquable.",
        permissions: "Gérer le serveur",
        options: [
          { name: "partenaire", description: "Nom du partenaire", required: true },
          { name: "message", description: "Description du partenariat", required: true },
          { name: "lien", description: "URL du partenaire", required: false },
          { name: "image", description: "Image principale", required: false },
          { name: "logo", description: "Logo du partenaire", required: false },
          { name: "salon", description: "Salon cible", required: false },
        ],
      },
    ],
  },
  {
    id: "config",
    label: "Configuration",
    icon: Settings2,
    color: "#95A5A6",
    commands: [
      {
        name: "/logs",
        usage: "/logs setup|status|disable",
        description: "Logs des messages supprimés/modifiés + activité vocale.",
        permissions: "Gérer le serveur",
      },
      {
        name: "/aiwelcome",
        usage: "/aiwelcome setup|test|status|clear",
        description: "Message de bienvenue généré par IA pour les nouveaux membres.",
        permissions: "Gérer le serveur",
      },
      {
        name: "/autorole",
        usage: "/autorole set|show|clear",
        description: "Rôle attribué automatiquement à l'arrivée d'un membre.",
        permissions: "Gérer le serveur",
      },
      {
        name: "/automod",
        usage: "/automod enable|disable|status",
        description: "Anti-spam & détection IA de toxicité.",
        details: "Anti-spam : score pondéré (fréquence, doublons, mentions, liens). ≥1.0 = timeout 5min + warn. Toxicité IA (gpt-5-nano) : ≥0.8 suppression + warn, ≥0.95 timeout 10min. Exemptions : propriétaire, Gérer les messages, boosters Nitro.",
        permissions: "Gérer le serveur",
      },
      {
        name: "/levels",
        usage: "/levels enable|disable|status",
        description: "Activer / désactiver le système de niveaux XP.",
        permissions: "Gérer le serveur",
      },
      {
        name: "/casino config",
        usage: "/casino config view|set|reset",
        description: "Configurer le casino : monnaie, mises min/max, daily, jackpot…",
        permissions: "Gérer le serveur",
      },
      {
        name: "/botrole",
        usage: "/botrole add|remove|clear|list",
        description: "Gérer les rôles requis pour utiliser le bot.",
        permissions: "Gérer le serveur",
      },
      {
        name: "/permissions",
        usage: "/permissions view|add-role|remove-role|…",
        description: "Gérer les accès aux catégories de commandes par rôle.",
        permissions: "Administrateur",
      },
      {
        name: "/xp",
        usage: "/xp give|take|set|reset <user>",
        description: "Ajuster l'XP d'un membre manuellement.",
        permissions: "Gérer le serveur",
      },
      {
        name: "/economy",
        usage: "/economy give|take|set|reset <user>",
        description: "Gérer les pièces d'un membre.",
        permissions: "Gérer le serveur",
      },
      {
        name: "/setavatar",
        usage: "/setavatar <url>",
        description: "Changer l'avatar du bot.",
        details: "L'URL doit pointer vers une image PNG, JPG ou GIF. Soumis aux rate-limits Discord.",
        permissions: "Propriétaire du bot",
        options: [
          { name: "url", description: "URL directe vers l'image", required: true },
        ],
      },
    ],
  },
  {
    id: "protection",
    label: "Protection",
    icon: ShieldAlert,
    color: "#E74C3C",
    commands: [
      {
        name: "/protection antinuke",
        usage: "/protection antinuke enable|disable|status|config",
        description: "Anti-nuke : bloque les bans/kicks/suppressions massifs.",
        details: "Détecte et bloque les actions destructives en masse (bans, kicks, suppressions de salons/rôles) effectuées sur une courte période.",
        permissions: "Administrateur",
      },
      {
        name: "/protection antiraid",
        usage: "/protection antiraid enable|disable|status|config",
        description: "Anti-raid : bloque les jointures massives suspectes.",
        details: "Détecte les pics d'arrivées anormaux (bots, raids). Déclenche un lockdown automatique.",
        permissions: "Administrateur",
      },
      {
        name: "/protection antiwebhook",
        usage: "/protection antiwebhook enable|disable|status|config",
        description: "Supprimer automatiquement les webhooks non autorisés.",
        permissions: "Administrateur",
      },
    ],
  },
  {
    id: "automod",
    label: "Auto-Modération",
    icon: Zap,
    color: "#FEE75C",
    commands: [
      {
        name: "/automod enable",
        usage: "/automod enable",
        description: "Activer l'auto-modération sur le serveur.",
        details: "Active l'anti-spam (score pondéré) et la détection de toxicité IA.",
        permissions: "Gérer le serveur",
      },
      {
        name: "/automod disable",
        usage: "/automod disable",
        description: "Désactiver l'auto-modération.",
        permissions: "Gérer le serveur",
      },
      {
        name: "/automod status",
        usage: "/automod status",
        description: "Afficher l'état actuel de l'auto-modération.",
      },
    ],
  },
  {
    id: "fun",
    label: "Fun",
    icon: Smile,
    color: "#FF79C6",
    commands: [
      {
        name: "/hack",
        usage: "/hack <cible>",
        description: "Simule un faux « hack » animé sur un membre (troll).",
        details: "Affiche une progression de 'hacking' fictive avec étapes humoristiques. Commande de troll uniquement.",
        options: [
          { name: "cible", description: "Le membre à 'hacker'", required: true },
        ],
      },
    ],
  },
];

function CommandCard({ cmd }: { cmd: Command }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="border border-border rounded-lg overflow-hidden">
      <button
        className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-muted/40 transition-colors"
        onClick={() => setOpen((o) => !o)}
      >
        <code className="text-sm font-mono font-semibold text-primary">
          {cmd.name}
        </code>
        <span className="text-xs text-muted-foreground flex-1 truncate">
          — {cmd.description}
        </span>
        {open ? (
          <ChevronDown className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
        ) : (
          <ChevronRight className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
        )}
      </button>

      {open && (
        <div className="px-4 pb-4 space-y-3 border-t border-border bg-muted/20">
          <div className="pt-3 space-y-1">
            <p className="text-xs text-muted-foreground">Usage</p>
            <code className="text-xs bg-muted px-2 py-1 rounded font-mono block">
              {cmd.usage}
            </code>
          </div>

          {cmd.details && (
            <p className="text-xs text-muted-foreground leading-relaxed">
              {cmd.details}
            </p>
          )}

          {cmd.permissions && (
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground">Permission :</span>
              <Badge variant="outline" className="text-[10px]">
                {cmd.permissions}
              </Badge>
            </div>
          )}

          {cmd.options && cmd.options.length > 0 && (
            <div className="space-y-1.5">
              <p className="text-xs text-muted-foreground">Options</p>
              <div className="space-y-1">
                {cmd.options.map((opt) => (
                  <div key={opt.name} className="flex items-start gap-2 text-xs">
                    <code className="text-primary font-mono shrink-0">
                      {opt.name}
                      {opt.required ? "" : "?"}
                    </code>
                    <span className="text-muted-foreground">{opt.description}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function CategorySection({ cat, defaultOpen }: { cat: Category; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen ?? false);
  const Icon = cat.icon;

  return (
    <div className="bg-card border border-border rounded-xl overflow-hidden">
      <button
        className="w-full flex items-center gap-3 px-4 py-3.5 hover:bg-muted/30 transition-colors"
        onClick={() => setOpen((o) => !o)}
      >
        <span style={{ color: cat.color }} className="shrink-0 flex items-center">
          <Icon className="w-4 h-4" />
        </span>
        <span className="font-semibold text-sm text-foreground">{cat.label}</span>
        <span className="text-xs text-muted-foreground ml-1">
          {cat.commands.length} commande{cat.commands.length > 1 ? "s" : ""}
        </span>
        <ChevronDown
          className={cn(
            "w-4 h-4 text-muted-foreground ml-auto transition-transform",
            open && "rotate-180",
          )}
        />
      </button>
      {open && (
        <div className="px-4 pb-4 space-y-2 border-t border-border">
          <div className="pt-3 space-y-2">
            {cat.commands.map((cmd) => (
              <CommandCard key={cmd.name} cmd={cmd} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export default function Commands() {
  const [search, setSearch] = useState("");

  const filtered = useMemo(() => {
    if (!search.trim()) return CATEGORIES;
    const q = search.toLowerCase();
    return CATEGORIES.map((cat) => ({
      ...cat,
      commands: cat.commands.filter(
        (c) =>
          c.name.toLowerCase().includes(q) ||
          c.description.toLowerCase().includes(q) ||
          c.usage.toLowerCase().includes(q),
      ),
    })).filter((cat) => cat.commands.length > 0);
  }, [search]);

  const totalCommands = CATEGORIES.reduce((s, c) => s + c.commands.length, 0);

  return (
    <div className="p-6 space-y-5 max-w-4xl mx-auto">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h2 className="text-lg font-semibold">Commandes</h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            {totalCommands} commandes · {CATEGORIES.length} catégories
          </p>
        </div>
        <div className="relative w-64">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
          <Input
            placeholder="Rechercher une commande…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-8 text-sm h-8"
          />
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground text-sm">
          Aucune commande trouvée pour « {search} »
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map((cat, i) => (
            <CategorySection key={cat.id} cat={cat} defaultOpen={i === 0 && !!search} />
          ))}
        </div>
      )}
    </div>
  );
}
