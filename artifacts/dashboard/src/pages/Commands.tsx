import { useState, useMemo } from "react";
import { Search, ChevronDown, ChevronRight, Shield, Trophy, Coins, Mic, Bot, Zap, Smile, Hash } from "lucide-react";
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
        name: "/kick",
        usage: "/kick <membre> [raison]",
        description: "Expulse un membre du serveur.",
        details: "Le membre reçoit un DM avec la raison avant d'être expulsé. Il peut revenir avec une invitation.",
        permissions: "Expulser des membres",
        options: [
          { name: "membre", description: "Le membre à expulser", required: true },
          { name: "raison", description: "Raison de l'expulsion", required: false },
        ],
      },
      {
        name: "/ban",
        usage: "/ban <membre> [raison]",
        description: "Bannit un membre du serveur.",
        details: "Bannissement permanent. Le membre est retiré du serveur et ne peut plus rejoindre. Un DM est envoyé avec la raison avant le ban.",
        permissions: "Bannir des membres",
        options: [
          { name: "membre", description: "Le membre à bannir", required: true },
          { name: "raison", description: "Raison du ban", required: false },
        ],
      },
      {
        name: "/unban",
        usage: "/unban <user_id>",
        description: "Lève le bannissement d'un utilisateur.",
        permissions: "Bannir des membres",
        options: [
          { name: "user_id", description: "L'ID Discord de l'utilisateur à débannir", required: true },
        ],
      },
      {
        name: "/timeout",
        usage: "/timeout <membre> <durée> [raison]",
        description: "Met un membre en sourdine temporairement (timeout).",
        details: "Le membre ne peut plus envoyer de messages ni parler en vocal pendant la durée spécifiée. Durée en minutes.",
        permissions: "Modérer des membres",
        options: [
          { name: "membre", description: "Le membre à mettre en timeout", required: true },
          { name: "durée", description: "Durée en minutes", required: true },
          { name: "raison", description: "Raison du timeout", required: false },
        ],
      },
      {
        name: "/untimeout",
        usage: "/untimeout <membre>",
        description: "Lève le timeout d'un membre.",
        permissions: "Modérer des membres",
        options: [
          { name: "membre", description: "Le membre dont lever le timeout", required: true },
        ],
      },
      {
        name: "/warn",
        usage: "/warn <membre> <raison>",
        description: "Avertit un membre et enregistre l'avertissement.",
        details: "Après 3 avertissements au total (manuels + auto), le membre est automatiquement expulsé. Un DM est envoyé à chaque warn.",
        permissions: "Gérer les messages",
        options: [
          { name: "membre", description: "Le membre à avertir", required: true },
          { name: "raison", description: "Raison de l'avertissement", required: true },
        ],
      },
      {
        name: "/warnings",
        usage: "/warnings <membre>",
        description: "Affiche la liste des avertissements d'un membre.",
        options: [
          { name: "membre", description: "Le membre dont voir les warns", required: true },
        ],
      },
      {
        name: "/clearwarnings",
        usage: "/clearwarnings <membre>",
        description: "Supprime tous les avertissements d'un membre.",
        permissions: "Gérer les messages",
        options: [
          { name: "membre", description: "Le membre dont effacer les warns", required: true },
        ],
      },
      {
        name: "/delwarning",
        usage: "/delwarning <id>",
        description: "Supprime un avertissement spécifique par son ID.",
        permissions: "Gérer les messages",
        options: [
          { name: "id", description: "L'identifiant du warn (visible avec /warnings)", required: true },
        ],
      },
      {
        name: "/purge",
        usage: "/purge <nombre>",
        description: "Supprime en masse les derniers messages d'un salon.",
        details: "Supprime entre 1 et 100 messages. Les messages de plus de 14 jours ne peuvent pas être supprimés (limite Discord).",
        permissions: "Gérer les messages",
        options: [
          { name: "nombre", description: "Nombre de messages à supprimer (1-100)", required: true },
        ],
      },
      {
        name: "/slowmode",
        usage: "/slowmode <secondes>",
        description: "Active ou modifie le mode lent dans un salon.",
        details: "Met 0 pour désactiver. Maximum 21600 secondes (6 heures).",
        permissions: "Gérer les salons",
        options: [
          { name: "secondes", description: "Délai entre les messages (0 pour désactiver)", required: true },
        ],
      },
      {
        name: "/lock",
        usage: "/lock [salon]",
        description: "Verrouille un salon textuel — @everyone ne peut plus écrire.",
        permissions: "Gérer les salons",
        options: [
          { name: "salon", description: "Le salon à verrouiller (par défaut : salon actuel)", required: false },
        ],
      },
      {
        name: "/unlock",
        usage: "/unlock [salon]",
        description: "Déverrouille un salon textuel.",
        permissions: "Gérer les salons",
        options: [
          { name: "salon", description: "Le salon à déverrouiller (par défaut : salon actuel)", required: false },
        ],
      },
      {
        name: "/snipe",
        usage: "/snipe",
        description: "Réaffiche le dernier message supprimé dans ce salon.",
        details: "Les messages sont conservés en mémoire avec un délai de 1 heure. Seul le message le plus récent est gardé par salon.",
      },
      {
        name: "/dm",
        usage: "/dm <membre> <message>",
        description: "Envoie un message privé à un membre via le bot.",
        permissions: "Gérer le serveur",
        options: [
          { name: "membre", description: "Le destinataire", required: true },
          { name: "message", description: "Le contenu du message", required: true },
        ],
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
        description: "Active l'auto-modération sur le serveur.",
        details: "Une fois activée, le bot analyse chaque message avec deux systèmes : (1) Anti-spam : score pondéré basé sur la fréquence, les doublons, les mentions en masse et les liens. Un score ≥ 1.0 déclenche un timeout de 5 min + warn. (2) Détection de toxicité IA (gpt-5-nano) : score 0-1. Score ≥ 0.8 → suppression + warn. Score ≥ 0.95 → timeout 10 min supplémentaire.",
        permissions: "Gérer le serveur",
      },
      {
        name: "/automod disable",
        usage: "/automod disable",
        description: "Désactive l'auto-modération.",
        permissions: "Gérer le serveur",
      },
      {
        name: "/automod status",
        usage: "/automod status",
        description: "Affiche l'état actuel de l'auto-modération.",
        details: "Exemptions : le propriétaire du serveur, les membres avec la permission 'Gérer les messages', et les boosters Nitro sont exempts de l'anti-spam et de la détection de toxicité.",
      },
    ],
  },
  {
    id: "levels",
    label: "Niveaux & XP",
    icon: Trophy,
    color: "#5865F2",
    commands: [
      {
        name: "/level",
        usage: "/level [membre]",
        description: "Affiche le niveau et l'XP d'un membre.",
        details: "Formule de passage de niveau : XP nécessaire pour le niveau L = 5L² + 50L + 100 (identique à Mee6). Les annonces de level-up sont postées dans le salon actif.",
        options: [
          { name: "membre", description: "Le membre (vous par défaut)", required: false },
        ],
      },
      {
        name: "/leaderboard",
        usage: "/leaderboard",
        description: "Affiche le classement XP du serveur (top 10).",
      },
      {
        name: "/levels enable",
        usage: "/levels enable",
        description: "Active le système de niveaux sur le serveur.",
        details: "Quand activé : 15-25 XP par message (cooldown 60s par utilisateur), 10 XP/min en vocal (si ≥ 2 humains, non muet/sourd).",
        permissions: "Gérer le serveur",
      },
      {
        name: "/levels disable",
        usage: "/levels disable",
        description: "Désactive le système de niveaux.",
        permissions: "Gérer le serveur",
      },
      {
        name: "/levels status",
        usage: "/levels status",
        description: "Affiche l'état du système de niveaux.",
      },
      {
        name: "/xp give",
        usage: "/xp give <membre> <quantité> [confirm_server]",
        description: "Donne de l'XP à un membre (ou à tout le serveur).",
        details: "Avec confirm_server: true, donne l'XP à tous les membres du serveur. Déclenche immédiatement les récompenses de rôle si un nouveau niveau est atteint.",
        permissions: "Gérer le serveur",
        options: [
          { name: "membre", description: "Le membre ciblé", required: true },
          { name: "quantité", description: "Quantité d'XP à donner", required: true },
          { name: "confirm_server", description: "Si true, applique à tout le serveur", required: false },
        ],
      },
      {
        name: "/xp take",
        usage: "/xp take <membre> <quantité> [confirm_server]",
        description: "Retire de l'XP à un membre (ou à tout le serveur).",
        permissions: "Gérer le serveur",
        options: [
          { name: "membre", description: "Le membre ciblé", required: true },
          { name: "quantité", description: "Quantité d'XP à retirer", required: true },
          { name: "confirm_server", description: "Si true, applique à tout le serveur", required: false },
        ],
      },
      {
        name: "/xp set",
        usage: "/xp set <membre> <valeur>",
        description: "Définit l'XP exact d'un membre.",
        permissions: "Gérer le serveur",
        options: [
          { name: "membre", description: "Le membre ciblé", required: true },
          { name: "valeur", description: "Valeur d'XP à définir", required: true },
        ],
      },
      {
        name: "/xp reset",
        usage: "/xp reset <membre> [confirm_server]",
        description: "Remet l'XP d'un membre à zéro (ou tout le serveur).",
        permissions: "Gérer le serveur",
        options: [
          { name: "membre", description: "Le membre ciblé", required: true },
          { name: "confirm_server", description: "Si true, remet tout le serveur à zéro", required: false },
        ],
      },
      {
        name: "/levelrole set",
        usage: "/levelrole set <niveau> <rôle>",
        description: "Assigne un rôle automatiquement quand un membre atteint un niveau.",
        details: "Les rôles sont cumulatifs : atteindre le niveau 20 octroie aussi tous les rôles des niveaux inférieurs non encore obtenus. Le bot ne peut attribuer que les rôles inférieurs au sien dans la hiérarchie.",
        permissions: "Gérer le serveur",
        options: [
          { name: "niveau", description: "Le niveau déclencheur", required: true },
          { name: "rôle", description: "Le rôle à attribuer", required: true },
        ],
      },
      {
        name: "/levelrole remove",
        usage: "/levelrole remove <niveau>",
        description: "Supprime la récompense de rôle pour un niveau.",
        permissions: "Gérer le serveur",
        options: [
          { name: "niveau", description: "Le niveau dont supprimer la récompense", required: true },
        ],
      },
      {
        name: "/levelrole list",
        usage: "/levelrole list",
        description: "Liste toutes les récompenses de rôle configurées.",
      },
    ],
  },
  {
    id: "economy",
    label: "Économie",
    icon: Coins,
    color: "#F0B232",
    commands: [
      {
        name: "/balance",
        usage: "/balance [membre]",
        description: "Affiche le solde de pièces d'un membre.",
        options: [
          { name: "membre", description: "Le membre (vous par défaut)", required: false },
        ],
      },
      {
        name: "/daily",
        usage: "/daily",
        description: "Réclame ta récompense quotidienne de pièces.",
        details: "Disponible une fois par 24h. Le montant varie selon la configuration du serveur.",
      },
      {
        name: "/pay",
        usage: "/pay <membre> <montant>",
        description: "Transfère des pièces à un autre membre.",
        options: [
          { name: "membre", description: "Le destinataire", required: true },
          { name: "montant", description: "Nombre de pièces à envoyer", required: true },
        ],
      },
      {
        name: "/work",
        usage: "/work",
        description: "Travaille pour gagner des pièces.",
        details: "Cooldown entre chaque utilisation. Montant aléatoire dans une fourchette définie.",
      },
      {
        name: "/shop",
        usage: "/shop",
        description: "Affiche les articles disponibles dans la boutique du serveur.",
      },
      {
        name: "/buy",
        usage: "/buy <article>",
        description: "Achète un article dans la boutique.",
        options: [
          { name: "article", description: "L'article à acheter", required: true },
        ],
      },
      {
        name: "/inventory",
        usage: "/inventory [membre]",
        description: "Affiche l'inventaire d'un membre.",
        options: [
          { name: "membre", description: "Le membre (vous par défaut)", required: false },
        ],
      },
      {
        name: "/slots",
        usage: "/slots <mise>",
        description: "Joue à la machine à sous avec une mise.",
        details: "Jeu de casino. Symboles 🍒🍋🍊🍇⭐💎. Jackpot pour trois symboles identiques.",
        options: [
          { name: "mise", description: "Nombre de pièces à miser", required: true },
        ],
      },
      {
        name: "/coinflip",
        usage: "/coinflip <mise> <face|pile>",
        description: "Pile ou face — mise contre le bot.",
        options: [
          { name: "mise", description: "Nombre de pièces à miser", required: true },
          { name: "côté", description: "face ou pile", required: true },
        ],
      },
    ],
  },
  {
    id: "voice",
    label: "Vocal",
    icon: Mic,
    color: "#57F287",
    commands: [
      {
        name: "/voice lock",
        usage: "/voice lock [salon]",
        description: "Verrouille un salon vocal — @everyone ne peut plus rejoindre.",
        details: "Modifie les permissions de connexion pour @everyone sur ce salon vocal. Les membres déjà connectés restent.",
        permissions: "Gérer les salons",
        options: [
          { name: "salon", description: "Le salon vocal (salon actuel par défaut)", required: false },
        ],
      },
      {
        name: "/voice unlock",
        usage: "/voice unlock [salon]",
        description: "Déverrouille un salon vocal.",
        permissions: "Gérer les salons",
        options: [
          { name: "salon", description: "Le salon vocal (salon actuel par défaut)", required: false },
        ],
      },
      {
        name: "/tempvc create",
        usage: "/tempvc create",
        description: "Crée un salon vocal temporaire.",
        details: "Crée un nouveau salon vocal dont tu es propriétaire. Tu peux ensuite le renommer et le personnaliser. Le salon est supprimé automatiquement quand il se vide.",
      },
      {
        name: "/tempvc rename",
        usage: "/tempvc rename <nom>",
        description: "Renomme ton salon vocal temporaire.",
        options: [
          { name: "nom", description: "Le nouveau nom du salon", required: true },
        ],
      },
      {
        name: "/tempvc sethub",
        usage: "/tempvc sethub <salon>",
        description: "Définit un salon vocal 'hub' de création automatique.",
        details: "Quand un membre rejoint ce salon hub, un nouveau salon temporaire est automatiquement créé pour lui. Pratique pour une gestion dynamique des salons vocaux.",
        permissions: "Gérer les salons",
        options: [
          { name: "salon", description: "Le salon vocal à définir comme hub", required: true },
        ],
      },
      {
        name: "/tempvc clearhub",
        usage: "/tempvc clearhub",
        description: "Supprime la configuration du hub vocal.",
        permissions: "Gérer les salons",
      },
    ],
  },
  {
    id: "utility",
    label: "Utilitaires",
    icon: Bot,
    color: "#EB459E",
    commands: [
      {
        name: "/help",
        usage: "/help [commande]",
        description: "Affiche la liste des commandes ou l'aide détaillée d'une commande.",
        options: [
          { name: "commande", description: "Nom d'une commande spécifique", required: false },
        ],
      },
      {
        name: "/ping",
        usage: "/ping",
        description: "Affiche la latence du bot et de l'API Discord.",
        details: "Utile pour vérifier que le bot est bien en ligne et réactif.",
      },
      {
        name: "/userstats",
        usage: "/userstats [membre]",
        description: "Affiche les statistiques d'un membre : messages, vocal, avertissements, etc.",
        options: [
          { name: "membre", description: "Le membre (vous par défaut)", required: false },
        ],
      },
      {
        name: "/channelstats",
        usage: "/channelstats",
        description: "Affiche les statistiques du salon actuel.",
      },
      {
        name: "/embed",
        usage: "/embed <titre> <contenu> [couleur]",
        description: "Envoie un message embed personnalisé dans le salon actuel.",
        permissions: "Gérer les messages",
        options: [
          { name: "titre", description: "Titre de l'embed", required: true },
          { name: "contenu", description: "Corps du message", required: true },
          { name: "couleur", description: "Couleur hex (ex: #5865F2)", required: false },
        ],
      },
      {
        name: "/autorole set",
        usage: "/autorole set <rôle>",
        description: "Définit le rôle attribué automatiquement aux nouveaux membres.",
        permissions: "Gérer le serveur",
        options: [
          { name: "rôle", description: "Le rôle à attribuer à l'arrivée", required: true },
        ],
      },
      {
        name: "/autorole clear",
        usage: "/autorole clear",
        description: "Supprime la configuration d'autorole.",
        permissions: "Gérer le serveur",
      },
      {
        name: "/autorole show",
        usage: "/autorole show",
        description: "Affiche le rôle actuellement configuré en autorole.",
      },
      {
        name: "/botrole set",
        usage: "/botrole set <rôle>",
        description: "Définit le rôle attribué automatiquement aux bots qui rejoignent.",
        permissions: "Gérer le serveur",
        options: [
          { name: "rôle", description: "Le rôle à attribuer aux bots", required: true },
        ],
      },
      {
        name: "/botrole clear",
        usage: "/botrole clear",
        description: "Supprime la configuration de botrole.",
        permissions: "Gérer le serveur",
      },
      {
        name: "/botrole show",
        usage: "/botrole show",
        description: "Affiche le rôle actuellement configuré pour les bots.",
      },
      {
        name: "/setavatar",
        usage: "/setavatar <url>",
        description: "Change l'avatar du bot.",
        details: "L'URL doit pointer vers une image PNG, JPG ou GIF. Soumis aux limites de rate-limit Discord (changements rares recommandés).",
        permissions: "Propriétaire du bot",
        options: [
          { name: "url", description: "URL directe vers l'image", required: true },
        ],
      },
    ],
  },
  {
    id: "fun",
    label: "Fun",
    icon: Smile,
    color: "#EB459E",
    commands: [
      {
        name: "/hack",
        usage: "/hack <cible>",
        description: "Simule un faux 'hack' animé sur un membre (troll).",
        details: "Affiche une progression de 'hacking' en temps réel avec des étapes fictives (scan ports, bruteforce, etc.), puis révèle aléatoirement des 'données' humoristiques sur la cible. Commande de troll uniquement.",
        options: [
          { name: "cible", description: "Le membre à 'hacker'", required: true },
        ],
      },
    ],
  },
  {
    id: "polls",
    label: "Sondages",
    icon: Hash,
    color: "#9B59B6",
    commands: [
      {
        name: "/poll create",
        usage: "/poll create <question> <option1> <option2> [option3] ...",
        description: "Crée un sondage avec jusqu'à 10 options.",
        details: "Le sondage est affiché avec des boutons cliquables. Chaque membre ne peut voter qu'une seule fois. Le résultat en temps réel est visible sur le dashboard.",
        options: [
          { name: "question", description: "La question du sondage", required: true },
          { name: "option1/2", description: "Les choix de réponse (minimum 2)", required: true },
        ],
      },
      {
        name: "/poll end",
        usage: "/poll end <id>",
        description: "Termine un sondage et affiche les résultats définitifs.",
        permissions: "Gérer les messages",
        options: [
          { name: "id", description: "L'ID du sondage à terminer", required: true },
        ],
      },
      {
        name: "/poll list",
        usage: "/poll list",
        description: "Liste tous les sondages actifs du serveur.",
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
        <span className="text-sm text-muted-foreground flex-1 truncate">
          — {cmd.description}
        </span>
        {cmd.permissions && (
          <Badge variant="outline" className="text-[10px] hidden sm:flex shrink-0">
            {cmd.permissions}
          </Badge>
        )}
        {open ? (
          <ChevronDown className="w-4 h-4 text-muted-foreground shrink-0" />
        ) : (
          <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" />
        )}
      </button>

      {open && (
        <div className="px-4 pb-4 border-t border-border bg-muted/20 space-y-3 pt-3">
          <div className="flex items-start gap-2 flex-wrap">
            <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mt-0.5">
              Usage :
            </span>
            <code className="text-xs bg-muted rounded px-2 py-0.5 font-mono text-foreground">
              {cmd.usage}
            </code>
          </div>

          {cmd.details && (
            <p className="text-sm text-muted-foreground leading-relaxed">
              {cmd.details}
            </p>
          )}

          {cmd.options && cmd.options.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">
                Paramètres :
              </p>
              <div className="space-y-1.5">
                {cmd.options.map((opt) => (
                  <div key={opt.name} className="flex items-start gap-2 text-sm">
                    <code className="font-mono text-primary shrink-0">
                      {opt.name}
                    </code>
                    {opt.required !== false && (
                      <span className="text-[10px] text-destructive font-semibold mt-0.5 shrink-0">
                        requis
                      </span>
                    )}
                    <span className="text-muted-foreground">{opt.description}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {cmd.permissions && (
            <p className="text-xs text-muted-foreground">
              <span className="font-semibold">Permission requise :</span>{" "}
              {cmd.permissions}
            </p>
          )}
        </div>
      )}
    </div>
  );
}

function CategorySection({ cat, defaultOpen }: { cat: Category; defaultOpen: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  const Icon = cat.icon;

  return (
    <div className="bg-card border border-card-border rounded-xl overflow-hidden">
      <button
        className="w-full flex items-center gap-3 px-5 py-4 hover:bg-muted/30 transition-colors"
        onClick={() => setOpen((o) => !o)}
      >
        <div
          className="flex items-center justify-center w-7 h-7 rounded-md shrink-0"
          style={{ backgroundColor: cat.color + "22", color: cat.color }}
        >
          <Icon className="w-4 h-4" />
        </div>
        <span className="font-semibold text-sm text-foreground">{cat.label}</span>
        <span className="text-xs text-muted-foreground">
          {cat.commands.length} commande{cat.commands.length > 1 ? "s" : ""}
        </span>
        <div className="ml-auto">
          {open ? (
            <ChevronDown className="w-4 h-4 text-muted-foreground" />
          ) : (
            <ChevronRight className="w-4 h-4 text-muted-foreground" />
          )}
        </div>
      </button>

      {open && (
        <div className="px-4 pb-4 space-y-2 border-t border-border pt-3">
          {cat.commands.map((cmd) => (
            <CommandCard key={cmd.name} cmd={cmd} />
          ))}
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
          (c.details ?? "").toLowerCase().includes(q),
      ),
    })).filter((cat) => cat.commands.length > 0);
  }, [search]);

  const totalCommands = CATEGORIES.reduce((s, c) => s + c.commands.length, 0);

  return (
    <div className="p-6 space-y-5 max-w-4xl mx-auto">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-lg font-semibold text-foreground">Commandes</h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            {totalCommands} commandes slash · Cliquez sur une commande pour voir les détails
          </p>
        </div>
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
          <Input
            className="pl-8 h-8 text-xs w-64"
            placeholder="Rechercher une commande…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="bg-card border border-card-border rounded-xl px-6 py-10 text-center text-sm text-muted-foreground">
          Aucune commande ne correspond à "{search}"
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map((cat, i) => (
            <CategorySection
              key={cat.id}
              cat={cat}
              defaultOpen={i === 0 || !!search}
            />
          ))}
        </div>
      )}
    </div>
  );
}
