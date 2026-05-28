import { useGetWarnings } from "@workspace/api-client-react";
import { DEFAULT_GUILD, truncateId, formatTs } from "@/lib/constants";
import { CSVLink } from "react-csv";
import { Download, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useState, useMemo } from "react";

function Skeleton({ className }: { className?: string }) {
  return <div className={`animate-pulse bg-muted rounded-lg ${className ?? ""}`} />;
}

export default function Moderation() {
  const { data, isLoading } = useGetWarnings({ guildId: DEFAULT_GUILD });

  const [search, setSearch] = useState("");

  const filtered = useMemo(
    () =>
      (data ?? []).filter(
        (w) =>
          !search ||
          w.userId.includes(search) ||
          w.reason.toLowerCase().includes(search.toLowerCase()),
      ),
    [data, search],
  );

  const warnCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const w of data ?? []) {
      counts[w.userId] = (counts[w.userId] ?? 0) + 1;
    }
    return counts;
  }, [data]);

  const topOffender = useMemo(() => {
    let top = "";
    let max = 0;
    for (const [id, count] of Object.entries(warnCounts)) {
      if (count > max) {
        max = count;
        top = id;
      }
    }
    return top;
  }, [warnCounts]);

  const csvData = filtered.map((w) => ({
    date: formatTs(w.timestamp),
    userId: w.userId,
    moderateur: w.moderatorId,
    raison: w.reason,
    id: w.id,
  }));

  const thClass =
    "px-4 py-2.5 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide";
  const tdClass = "px-4 py-2.5 text-sm text-foreground";

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h2 className="text-lg font-semibold text-foreground">Modération</h2>
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
            <Input
              className="pl-8 h-8 text-xs w-52"
              placeholder="Filtrer par userId / raison…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <CSVLink data={csvData} filename="warnings.csv" className="inline-flex">
            <Button variant="outline" size="sm" className="gap-1.5 text-xs">
              <Download className="w-3.5 h-3.5" />
              CSV
            </Button>
          </CSVLink>
        </div>
      </div>

      {topOffender && (
        <div className="flex items-center gap-3 bg-destructive/10 border border-destructive/20 rounded-lg px-4 py-3 text-sm">
          <span className="text-destructive font-semibold">⚠ Récidiviste :</span>
          <span className="font-mono text-foreground">{truncateId(topOffender, 16)}</span>
          <span className="ml-auto text-destructive font-bold">{warnCounts[topOffender]} avertissements</span>
        </div>
      )}

      {isLoading ? (
        <Skeleton className="h-72" />
      ) : (
        <div className="bg-card border border-card-border rounded-xl overflow-hidden">
          <table className="w-full">
            <thead className="bg-muted/50 border-b border-border">
              <tr>
                <th className={thClass}>Date</th>
                <th className={thClass}>Utilisateur</th>
                <th className={thClass}>Modérateur</th>
                <th className={thClass}>Raison</th>
                <th className={thClass}>Total warns</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center text-sm text-muted-foreground">
                    {data?.length === 0
                      ? "Aucun avertissement enregistré"
                      : "Aucun résultat pour ce filtre"}
                  </td>
                </tr>
              ) : (
                filtered.map((w) => (
                  <tr
                    key={w.id}
                    className="border-b border-border last:border-0 hover:bg-muted/30 transition-colors"
                  >
                    <td className={`${tdClass} text-muted-foreground whitespace-nowrap`}>
                      {formatTs(w.timestamp)}
                    </td>
                    <td className={`${tdClass} font-mono`}>
                      {truncateId(w.userId, 12)}
                    </td>
                    <td className={`${tdClass} font-mono text-muted-foreground`}>
                      {truncateId(w.moderatorId, 12)}
                    </td>
                    <td className={tdClass}>
                      <span className="line-clamp-2">{w.reason}</span>
                    </td>
                    <td className={tdClass}>
                      <span
                        className={`inline-flex items-center justify-center w-6 h-6 rounded-full text-xs font-bold ${
                          (warnCounts[w.userId] ?? 0) >= 3
                            ? "bg-destructive/15 text-destructive"
                            : "bg-muted text-muted-foreground"
                        }`}
                      >
                        {warnCounts[w.userId] ?? 1}
                      </span>
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
