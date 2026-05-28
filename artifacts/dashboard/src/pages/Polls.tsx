import { useGetPolls } from "@workspace/api-client-react";
import { DEFAULT_GUILD, formatTs } from "@/lib/constants";
import { Badge } from "@/components/ui/badge";

function Skeleton({ className }: { className?: string }) {
  return <div className={`animate-pulse bg-muted rounded-lg ${className ?? ""}`} />;
}

export default function Polls() {
  const { data, isLoading } = useGetPolls({ guildId: DEFAULT_GUILD });

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      <h2 className="text-lg font-semibold text-foreground">Sondages</h2>

      {isLoading ? (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-52" />
          ))}
        </div>
      ) : !data || data.length === 0 ? (
        <div className="bg-card border border-card-border rounded-xl px-6 py-10 text-center text-sm text-muted-foreground">
          Aucun sondage trouvé pour ce serveur
        </div>
      ) : (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {data.map((poll) => {
            const totalVotes = Object.values(poll.votes).reduce(
              (s, v) => s + v,
              0,
            );
            return (
              <div
                key={poll.id}
                className="bg-card border border-card-border rounded-xl p-5 space-y-4"
              >
                <div className="flex items-start justify-between gap-2">
                  <p className="text-sm font-semibold text-foreground leading-snug">
                    {poll.question}
                  </p>
                  <Badge
                    variant={poll.ended ? "secondary" : "default"}
                    className="shrink-0 text-[10px]"
                  >
                    {poll.ended ? "Terminé" : "Actif"}
                  </Badge>
                </div>

                <div className="space-y-2">
                  {poll.options.map((opt, idx) => {
                    const votes = poll.votes[String(idx)] ?? 0;
                    const pct = totalVotes > 0 ? Math.round((votes / totalVotes) * 100) : 0;
                    return (
                      <div key={idx} className="space-y-1">
                        <div className="flex items-center justify-between text-xs">
                          <span className="text-foreground truncate max-w-[70%]">{opt}</span>
                          <span className="text-muted-foreground font-medium">{votes} ({pct}%)</span>
                        </div>
                        <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                          <div
                            className="h-full bg-primary rounded-full transition-all duration-300"
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>

                <div className="flex items-center justify-between text-[11px] text-muted-foreground border-t border-border pt-2">
                  <span>{totalVotes} vote{totalVotes !== 1 ? "s" : ""}</span>
                  <span>{formatTs(poll.createdAt)}</span>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
