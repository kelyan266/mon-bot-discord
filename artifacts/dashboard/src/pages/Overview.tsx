import {
  useGetBotStats,
  useGetLeaderboard,
  useGetEconomy,
} from "@workspace/api-client-react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
} from "recharts";
import { DEFAULT_GUILD, truncateId } from "@/lib/constants";
import { Users, ShieldAlert, BarChart3, Server, Star, Coins } from "lucide-react";

interface KpiProps {
  label: string;
  value: number | string;
  icon: React.ReactNode;
  color: string;
}

function KpiCard({ label, value, icon, color }: KpiProps) {
  return (
    <div className="bg-card border border-card-border rounded-xl p-5 flex items-start gap-4">
      <div
        className="flex items-center justify-center w-10 h-10 rounded-lg shrink-0"
        style={{ backgroundColor: color + "22", color }}
      >
        {icon}
      </div>
      <div>
        <p className="text-xs text-muted-foreground font-medium">{label}</p>
        <p className="text-2xl font-bold text-foreground mt-0.5">
          {value.toLocaleString()}
        </p>
      </div>
    </div>
  );
}

function Skeleton({ className }: { className?: string }) {
  return (
    <div className={`animate-pulse bg-muted rounded-lg ${className ?? ""}`} />
  );
}

export default function Overview() {
  const { data: stats, isLoading: statsLoading } = useGetBotStats();
  const { data: lb } = useGetLeaderboard({ guildId: DEFAULT_GUILD, limit: 5 });
  const { data: eco } = useGetEconomy({ guildId: DEFAULT_GUILD, limit: 5 });

  const lbChartData =
    lb?.map((e) => ({ name: truncateId(e.userId), xp: e.xp })) ?? [];
  const ecoChartData =
    eco?.map((e) => ({ name: truncateId(e.userId), balance: e.balance })) ?? [];

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      <h2 className="text-lg font-semibold text-foreground">Vue d'ensemble</h2>

      {statsLoading ? (
        <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-20" />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
          <KpiCard
            label="Membres suivis"
            value={stats?.totalUsers ?? 0}
            icon={<Users className="w-5 h-5" />}
            color="#5865F2"
          />
          <KpiCard
            label="Avertissements"
            value={stats?.totalWarnings ?? 0}
            icon={<ShieldAlert className="w-5 h-5" />}
            color="#ED4245"
          />
          <KpiCard
            label="Sondages actifs"
            value={stats?.activePolls ?? 0}
            icon={<BarChart3 className="w-5 h-5" />}
            color="#57F287"
          />
          <KpiCard
            label="Serveurs"
            value={stats?.totalGuilds ?? 0}
            icon={<Server className="w-5 h-5" />}
            color="#FEE75C"
          />
          <KpiCard
            label="Niveau max"
            value={stats?.topLevel ?? 0}
            icon={<Star className="w-5 h-5" />}
            color="#EB459E"
          />
          <KpiCard
            label="Pièces en circulation"
            value={stats?.totalEconomyCoins ?? 0}
            icon={<Coins className="w-5 h-5" />}
            color="#F0B232"
          />
        </div>
      )}

      <div className="grid lg:grid-cols-2 gap-6">
        <div className="bg-card border border-card-border rounded-xl p-5">
          <p className="text-sm font-semibold text-foreground mb-4">
            Top 5 XP
          </p>
          {lbChartData.length === 0 ? (
            <div className="h-40 flex items-center justify-center text-sm text-muted-foreground">
              Aucune donnée
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={180}>
              <BarChart data={lbChartData} margin={{ left: -10, right: 8 }}>
                <CartesianGrid strokeDasharray="3 3" className="opacity-20" />
                <XAxis
                  dataKey="name"
                  tick={{ fontSize: 11 }}
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis
                  tick={{ fontSize: 11 }}
                  axisLine={false}
                  tickLine={false}
                />
                <Tooltip
                  contentStyle={{
                    fontSize: 12,
                    borderRadius: 8,
                    border: "1px solid hsl(var(--border))",
                    background: "hsl(var(--popover))",
                    color: "hsl(var(--popover-foreground))",
                  }}
                />
                <Bar dataKey="xp" fill="hsl(235 85% 64%)" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>

        <div className="bg-card border border-card-border rounded-xl p-5">
          <p className="text-sm font-semibold text-foreground mb-4">
            Top 5 Économie
          </p>
          {ecoChartData.length === 0 ? (
            <div className="h-40 flex items-center justify-center text-sm text-muted-foreground">
              Aucune donnée
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={180}>
              <BarChart data={ecoChartData} margin={{ left: -10, right: 8 }}>
                <CartesianGrid strokeDasharray="3 3" className="opacity-20" />
                <XAxis
                  dataKey="name"
                  tick={{ fontSize: 11 }}
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis
                  tick={{ fontSize: 11 }}
                  axisLine={false}
                  tickLine={false}
                />
                <Tooltip
                  contentStyle={{
                    fontSize: 12,
                    borderRadius: 8,
                    border: "1px solid hsl(var(--border))",
                    background: "hsl(var(--popover))",
                    color: "hsl(var(--popover-foreground))",
                  }}
                />
                <Bar
                  dataKey="balance"
                  fill="hsl(45 100% 55%)"
                  radius={[4, 4, 0, 0]}
                />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>
    </div>
  );
}
