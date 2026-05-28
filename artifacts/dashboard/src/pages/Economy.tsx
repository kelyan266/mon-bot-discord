import { useGetEconomy } from "@workspace/api-client-react";
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
import { CSVLink } from "react-csv";
import { Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useState } from "react";

function Skeleton({ className }: { className?: string }) {
  return <div className={`animate-pulse bg-muted rounded-lg ${className ?? ""}`} />;
}

export default function Economy() {
  const { data, isLoading } = useGetEconomy({ guildId: DEFAULT_GUILD, limit: 50 });

  const [sortKey, setSortKey] = useState<"rank" | "balance">("rank");
  const sorted = [...(data ?? [])].sort((a, b) =>
    sortKey === "rank" ? a.rank - b.rank : b.balance - a.balance,
  );

  const top20 = sorted.slice(0, 20).map((e) => ({
    name: truncateId(e.userId),
    balance: e.balance,
  }));

  const csvData = sorted.map((e) => ({
    rang: e.rank,
    userId: e.userId,
    solde: e.balance,
  }));

  const thClass =
    "px-4 py-2.5 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide cursor-pointer hover:text-foreground select-none";
  const tdClass = "px-4 py-2.5 text-sm text-foreground";

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-foreground">Économie</h2>
        <CSVLink data={csvData} filename="economy.csv" className="inline-flex">
          <Button variant="outline" size="sm" className="gap-1.5 text-xs">
            <Download className="w-3.5 h-3.5" />
            CSV
          </Button>
        </CSVLink>
      </div>

      {isLoading ? (
        <Skeleton className="h-52" />
      ) : (
        <div className="bg-card border border-card-border rounded-xl p-5">
          <p className="text-sm font-semibold text-foreground mb-4">
            Solde Top 20
          </p>
          {top20.length === 0 ? (
            <div className="h-40 flex items-center justify-center text-sm text-muted-foreground">
              Aucune donnée
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={top20} margin={{ left: -10, right: 8 }}>
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
                  formatter={(v) => [`${Number(v).toLocaleString()} 🪙`, "Solde"]}
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
      )}

      {isLoading ? (
        <Skeleton className="h-72" />
      ) : (
        <div className="bg-card border border-card-border rounded-xl overflow-hidden">
          <table className="w-full">
            <thead className="bg-muted/50 border-b border-border">
              <tr>
                <th
                  className={thClass}
                  onClick={() => setSortKey("rank")}
                >
                  #
                </th>
                <th className={thClass}>Utilisateur</th>
                <th
                  className={thClass}
                  onClick={() => setSortKey("balance")}
                >
                  Solde 🪙
                </th>
              </tr>
            </thead>
            <tbody>
              {sorted.length === 0 ? (
                <tr>
                  <td
                    colSpan={3}
                    className="px-4 py-8 text-center text-sm text-muted-foreground"
                  >
                    Aucune donnée — le bot doit d'abord collecter de l'activité
                  </td>
                </tr>
              ) : (
                sorted.map((e) => (
                  <tr
                    key={e.userId}
                    className="border-b border-border last:border-0 hover:bg-muted/30 transition-colors"
                  >
                    <td className={tdClass}>
                      <span className="inline-flex items-center justify-center w-6 h-6 rounded text-xs font-bold bg-yellow-500/10 text-yellow-600 dark:text-yellow-400">
                        {e.rank}
                      </span>
                    </td>
                    <td className={`${tdClass} font-mono`}>
                      {truncateId(e.userId, 12)}
                    </td>
                    <td className={`${tdClass} font-semibold`}>
                      {e.balance.toLocaleString()} 🪙
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
