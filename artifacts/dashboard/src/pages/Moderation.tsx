import {
  useGetWarnings,
  useCreateWarning,
  useDeleteWarning,
  useResolveUsers,
} from "@workspace/api-client-react";
import type { UserProfile } from "@workspace/api-client-react";
import { DEFAULT_GUILD, formatTs } from "@/lib/constants";
import { CSVLink } from "react-csv";
import {
  Download,
  Search,
  Plus,
  Trash2,
  AlertTriangle,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { useQueryClient } from "@tanstack/react-query";
import { useState, useMemo } from "react";

function Skeleton({ className }: { className?: string }) {
  return (
    <div className={`animate-pulse bg-muted rounded-lg ${className ?? ""}`} />
  );
}

function Avatar({
  profile,
  size = 28,
}: {
  profile?: UserProfile;
  size?: number;
}) {
  const name = profile?.displayName ?? profile?.username ?? "?";
  if (profile?.avatarUrl) {
    return (
      <img
        src={profile.avatarUrl}
        alt={name}
        width={size}
        height={size}
        className="rounded-full shrink-0"
        style={{ width: size, height: size }}
      />
    );
  }
  return (
    <div
      className="rounded-full bg-primary/20 text-primary flex items-center justify-center text-xs font-semibold shrink-0"
      style={{ width: size, height: size }}
    >
      {name[0]?.toUpperCase() ?? "?"}
    </div>
  );
}

function UserCell({
  userId,
  profiles,
}: {
  userId: string;
  profiles: Map<string, UserProfile>;
}) {
  const p = profiles.get(userId);
  const display = p?.displayName ?? p?.username;
  return (
    <div className="flex items-center gap-2">
      <Avatar profile={p} size={26} />
      <div className="min-w-0">
        {display ? (
          <>
            <div className="text-sm font-medium text-foreground truncate">
              {display}
            </div>
            <div className="text-[11px] text-muted-foreground font-mono truncate">
              {userId}
            </div>
          </>
        ) : (
          <div className="text-sm font-mono text-foreground">{userId}</div>
        )}
      </div>
    </div>
  );
}

function AddWarnDialog({
  onCreated,
}: {
  onCreated: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [userId, setUserId] = useState("");
  const [moderatorId, setModeratorId] = useState("");
  const [reason, setReason] = useState("");
  const mutation = useCreateWarning();

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!userId.trim() || !moderatorId.trim() || !reason.trim()) return;
    mutation.mutate(
      {
        data: {
          guildId: DEFAULT_GUILD,
          userId: userId.trim(),
          moderatorId: moderatorId.trim(),
          reason: reason.trim(),
        },
      },
      {
        onSuccess: () => {
          setOpen(false);
          setUserId("");
          setModeratorId("");
          setReason("");
          onCreated();
        },
      },
    );
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" className="gap-1.5 text-xs">
          <Plus className="w-3.5 h-3.5" />
          Ajouter un warn
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Ajouter un avertissement</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4 mt-2">
          <div className="space-y-1.5">
            <Label htmlFor="userId">ID Discord du membre</Label>
            <Input
              id="userId"
              placeholder="ex: 1379011240545878022"
              value={userId}
              onChange={(e) => setUserId(e.target.value)}
              className="font-mono text-sm"
            />
            <p className="text-[11px] text-muted-foreground">
              Clic droit sur le membre → Copier l'identifiant
            </p>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="modId">ID Discord du modérateur</Label>
            <Input
              id="modId"
              placeholder="ex: 1379011240545878022"
              value={moderatorId}
              onChange={(e) => setModeratorId(e.target.value)}
              className="font-mono text-sm"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="reason">Raison</Label>
            <Input
              id="reason"
              placeholder="ex: Spam répété dans #général"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
            />
          </div>
          <div className="flex justify-end gap-2 pt-1">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setOpen(false)}
            >
              Annuler
            </Button>
            <Button
              type="submit"
              size="sm"
              disabled={
                mutation.isPending ||
                !userId.trim() ||
                !moderatorId.trim() ||
                !reason.trim()
              }
            >
              {mutation.isPending ? "Enregistrement…" : "Ajouter"}
            </Button>
          </div>
          {mutation.isError && (
            <p className="text-xs text-destructive">
              Erreur — vérifie les IDs Discord.
            </p>
          )}
        </form>
      </DialogContent>
    </Dialog>
  );
}

export default function Moderation() {
  const qc = useQueryClient();
  const { data, isLoading } = useGetWarnings({ guildId: DEFAULT_GUILD });
  const deleteMutation = useDeleteWarning();

  const [search, setSearch] = useState("");
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const uniqueIds = useMemo(() => {
    const ids = new Set<string>();
    for (const w of data ?? []) {
      ids.add(w.userId);
      ids.add(w.moderatorId);
    }
    return [...ids].join(",");
  }, [data]);

  const { data: profiles } = useResolveUsers({ ids: uniqueIds || "_" });

  const profileMap = useMemo(() => {
    const m = new Map<string, UserProfile>();
    for (const p of profiles ?? []) m.set(p.id, p);
    return m;
  }, [profiles]);

  const filtered = useMemo(
    () =>
      (data ?? []).filter((w) => {
        if (!search) return true;
        const q = search.toLowerCase();
        const profile = profileMap.get(w.userId);
        return (
          w.userId.includes(q) ||
          w.reason.toLowerCase().includes(q) ||
          (profile?.username ?? "").toLowerCase().includes(q) ||
          (profile?.displayName ?? "").toLowerCase().includes(q)
        );
      }),
    [data, search, profileMap],
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

  const handleDelete = (id: string) => {
    setDeletingId(id);
    deleteMutation.mutate(
      { warningId: id },
      {
        onSettled: () => {
          setDeletingId(null);
          void qc.invalidateQueries({ queryKey: ["/api/bot/warnings"] });
        },
      },
    );
  };

  const csvData = filtered.map((w) => {
    const up = profileMap.get(w.userId);
    const mp = profileMap.get(w.moderatorId);
    return {
      date: formatTs(w.timestamp),
      userId: w.userId,
      pseudo: up?.displayName ?? up?.username ?? "",
      moderateurId: w.moderatorId,
      moderateur: mp?.displayName ?? mp?.username ?? "",
      raison: w.reason,
      id: w.id,
    };
  });

  const thClass =
    "px-4 py-2.5 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide";
  const tdClass = "px-4 py-2.5 text-sm text-foreground";

  return (
    <div className="p-6 space-y-5 max-w-7xl mx-auto">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h2 className="text-lg font-semibold text-foreground">Modération</h2>
        <div className="flex items-center gap-2 flex-wrap">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
            <Input
              className="pl-8 h-8 text-xs w-52"
              placeholder="Pseudo, ID, raison…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            {search && (
              <button
                className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                onClick={() => setSearch("")}
              >
                <X className="w-3 h-3" />
              </button>
            )}
          </div>
          <CSVLink data={csvData} filename="warnings.csv" className="inline-flex">
            <Button variant="outline" size="sm" className="gap-1.5 text-xs">
              <Download className="w-3.5 h-3.5" />
              CSV
            </Button>
          </CSVLink>
          <AddWarnDialog onCreated={() => qc.invalidateQueries({ queryKey: ["/api/bot/warnings"] })} />
        </div>
      </div>

      {topOffender && (
        <div className="flex items-center gap-3 bg-destructive/10 border border-destructive/20 rounded-xl px-4 py-3">
          <AlertTriangle className="w-4 h-4 text-destructive shrink-0" />
          <span className="text-sm text-destructive font-semibold">Récidiviste :</span>
          <UserCell userId={topOffender} profiles={profileMap} />
          <span className="ml-auto text-sm text-destructive font-bold whitespace-nowrap">
            {warnCounts[topOffender]} warns
          </span>
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
                <th className={thClass}>Membre</th>
                <th className={thClass}>Modérateur</th>
                <th className={thClass}>Raison</th>
                <th className={thClass}>Warns</th>
                <th className={thClass} />
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr>
                  <td
                    colSpan={6}
                    className="px-4 py-10 text-center text-sm text-muted-foreground"
                  >
                    {data?.length === 0
                      ? "Aucun avertissement enregistré"
                      : "Aucun résultat pour ce filtre"}
                  </td>
                </tr>
              ) : (
                filtered.map((w) => (
                  <tr
                    key={w.id}
                    className="border-b border-border last:border-0 hover:bg-muted/20 transition-colors"
                  >
                    <td className={`${tdClass} text-muted-foreground whitespace-nowrap`}>
                      {formatTs(w.timestamp)}
                    </td>
                    <td className={tdClass}>
                      <UserCell userId={w.userId} profiles={profileMap} />
                    </td>
                    <td className={tdClass}>
                      <UserCell userId={w.moderatorId} profiles={profileMap} />
                    </td>
                    <td className={tdClass}>
                      <span className="line-clamp-2 text-sm">{w.reason}</span>
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
                    <td className="px-3 py-2">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                        disabled={deletingId === w.id}
                        onClick={() => handleDelete(w.id)}
                        title="Supprimer ce warn"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
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
