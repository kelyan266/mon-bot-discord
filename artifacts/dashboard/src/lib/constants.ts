export const DEFAULT_GUILD = "1496898542424555562";

export const NAV_ITEMS = [
  { path: "/", label: "Vue d'ensemble", icon: "LayoutDashboard" },
  { path: "/leaderboard", label: "Classement XP", icon: "Trophy" },
  { path: "/economy", label: "Économie", icon: "Coins" },
  { path: "/moderation", label: "Modération", icon: "ShieldAlert" },
  { path: "/polls", label: "Sondages", icon: "BarChart3" },
  { path: "/casino", label: "Casino", icon: "Dice5" },
  { path: "/commands", label: "Commandes", icon: "Terminal" },
] as const;

export const REFRESH_INTERVALS = [
  { label: "Manuel", value: 0 },
  { label: "5 min", value: 5 * 60 * 1000 },
  { label: "10 min", value: 10 * 60 * 1000 },
  { label: "30 min", value: 30 * 60 * 1000 },
] as const;

export function truncateId(id: string, len = 8) {
  return id.length > len ? id.slice(0, len) + "…" : id;
}

export function formatTs(ts: number) {
  return new Date(ts).toLocaleString("fr-FR", {
    dateStyle: "short",
    timeStyle: "short",
  });
}
