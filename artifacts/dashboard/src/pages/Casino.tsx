import { useState, useEffect, useRef } from "react";
import { DEFAULT_GUILD } from "@/lib/constants";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");
const API = `${BASE}/api`;

// ── helpers ──────────────────────────────────────────────────────────────────

async function apiFetch(path: string, opts?: RequestInit) {
  const r = await fetch(`${API}${path}`, {
    headers: { "Content-Type": "application/json" },
    ...opts,
  });
  const json = await r.json();
  if (!r.ok) throw new Error(json.error ?? "Erreur API");
  return json;
}

function fmt(n: number) {
  return n.toLocaleString("fr");
}

// ── Types ────────────────────────────────────────────────────────────────────

interface Config {
  currency: string;
  minBet: number;
  maxBet: number;
  startingBalance: number;
  dailyAmount: number;
  slotsJackpotMultiplier: number;
}
interface Balance {
  balance: number;
  streak: number;
  canDaily: boolean;
  nextDailyMs: number;
}
interface Card { rank: string; suit: string }
interface BjState {
  status: "playing" | "win" | "lose" | "push" | "bust" | "blackjack";
  playerHand: Card[];
  dealerHand: Card[];
  playerValue: number;
  dealerValue: number;
  bet: number;
  payout: number;
  balance: number;
  canDouble: boolean;
}

type Tab = "slots" | "roulette" | "blackjack";

// ── Card component ────────────────────────────────────────────────────────────

function PlayingCard({ card, hidden }: { card: Card; hidden?: boolean }) {
  if (hidden || card.rank === "?") {
    return (
      <div className="w-12 h-16 rounded-md border-2 border-border bg-gradient-to-br from-indigo-600 to-purple-700 flex items-center justify-center shadow-md">
        <span className="text-white text-lg">🂠</span>
      </div>
    );
  }
  const isRed = card.suit === "♥" || card.suit === "♦";
  return (
    <div className="w-12 h-16 rounded-md border-2 border-border bg-card shadow-md flex flex-col justify-between p-1">
      <span className={cn("text-xs font-bold leading-none", isRed ? "text-red-500" : "text-foreground")}>
        {card.rank}{card.suit}
      </span>
      <span className={cn("text-base font-bold self-center", isRed ? "text-red-500" : "text-foreground")}>
        {card.suit}
      </span>
      <span className={cn("text-xs font-bold leading-none self-end rotate-180", isRed ? "text-red-500" : "text-foreground")}>
        {card.rank}{card.suit}
      </span>
    </div>
  );
}

// ── Roulette wheel animation ──────────────────────────────────────────────────

const ROULETTE_ORDER = [
  0,32,15,19,4,21,2,25,17,34,6,27,13,36,11,30,8,23,10,5,24,16,33,1,20,14,31,9,22,18,29,7,28,12,35,3,26
];
const RED_NRS = new Set([1,3,5,7,9,12,14,16,18,19,21,23,25,27,30,32,34,36]);

function RouletteWheel({ spinning, result }: { spinning: boolean; result: number | null }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animRef = useRef<number>(0);
  const angleRef = useRef(0);
  const speedRef = useRef(0);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d")!;
    const size = canvas.width;
    const cx = size / 2;
    const cy = size / 2;
    const r = size / 2 - 4;
    const segAngle = (2 * Math.PI) / ROULETTE_ORDER.length;

    function draw(angle: number) {
      ctx.clearRect(0, 0, size, size);
      ROULETTE_ORDER.forEach((num, i) => {
        const start = angle + i * segAngle - segAngle / 2;
        const end = start + segAngle;
        ctx.beginPath();
        ctx.moveTo(cx, cy);
        ctx.arc(cx, cy, r, start, end);
        ctx.closePath();
        ctx.fillStyle = num === 0 ? "#16a34a" : RED_NRS.has(num) ? "#dc2626" : "#1f2937";
        ctx.fill();
        ctx.strokeStyle = "#374151";
        ctx.lineWidth = 0.5;
        ctx.stroke();
        const midAngle = start + segAngle / 2;
        ctx.save();
        ctx.translate(cx + (r * 0.7) * Math.cos(midAngle), cy + (r * 0.7) * Math.sin(midAngle));
        ctx.rotate(midAngle + Math.PI / 2);
        ctx.fillStyle = "#fff";
        ctx.font = `bold ${size < 200 ? 8 : 10}px sans-serif`;
        ctx.textAlign = "center";
        ctx.fillText(String(num), 0, 0);
        ctx.restore();
      });
      ctx.beginPath();
      ctx.arc(cx, cy, r * 0.15, 0, 2 * Math.PI);
      ctx.fillStyle = "#111827";
      ctx.fill();
      ctx.strokeStyle = "#6b7280";
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.fillStyle = "#f59e0b";
      ctx.font = `bold ${size < 200 ? 7 : 9}px sans-serif`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText("SPIN", cx, cy);
      ctx.beginPath();
      ctx.moveTo(cx, 2);
      ctx.lineTo(cx - 5, 14);
      ctx.lineTo(cx + 5, 14);
      ctx.closePath();
      ctx.fillStyle = "#f59e0b";
      ctx.fill();
    }

    if (spinning) {
      speedRef.current = 0.25;
      const animate = () => {
        angleRef.current += speedRef.current;
        speedRef.current *= 0.995;
        draw(angleRef.current);
        if (speedRef.current > 0.002) animRef.current = requestAnimationFrame(animate);
        else draw(angleRef.current);
      };
      animRef.current = requestAnimationFrame(animate);
    } else {
      draw(angleRef.current);
    }
    return () => cancelAnimationFrame(animRef.current);
  }, [spinning]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || result === null) return;
    const ctx = canvas.getContext("2d")!;
    const size = canvas.width;
    const idx = ROULETTE_ORDER.indexOf(result);
    if (idx < 0) return;
    const segAngle = (2 * Math.PI) / ROULETTE_ORDER.length;
    const targetAngle = -idx * segAngle - segAngle / 2 + Math.PI * 6;
    const start = angleRef.current;
    const duration = 3000;
    const t0 = performance.now();
    cancelAnimationFrame(animRef.current);
    const animate = (now: number) => {
      const p = Math.min((now - t0) / duration, 1);
      const ease = 1 - Math.pow(1 - p, 4);
      angleRef.current = start + ease * (targetAngle - start);
      const cx = size / 2, cy = size / 2, r = size / 2 - 4;
      const segA = (2 * Math.PI) / ROULETTE_ORDER.length;
      ctx.clearRect(0, 0, size, size);
      ROULETTE_ORDER.forEach((num, i) => {
        const sa = angleRef.current + i * segA - segA / 2;
        const ea = sa + segA;
        ctx.beginPath(); ctx.moveTo(cx, cy); ctx.arc(cx, cy, r, sa, ea); ctx.closePath();
        ctx.fillStyle = num === 0 ? "#16a34a" : RED_NRS.has(num) ? "#dc2626" : "#1f2937";
        ctx.fill(); ctx.strokeStyle = "#374151"; ctx.lineWidth = 0.5; ctx.stroke();
        const mid = sa + segA / 2;
        ctx.save();
        ctx.translate(cx + r * 0.7 * Math.cos(mid), cy + r * 0.7 * Math.sin(mid));
        ctx.rotate(mid + Math.PI / 2);
        ctx.fillStyle = "#fff"; ctx.font = `bold ${size < 200 ? 8 : 10}px sans-serif`; ctx.textAlign = "center";
        ctx.fillText(String(num), 0, 0); ctx.restore();
      });
      ctx.beginPath(); ctx.arc(cx, cy, r * 0.15, 0, 2 * Math.PI);
      ctx.fillStyle = "#111827"; ctx.fill(); ctx.strokeStyle = "#6b7280"; ctx.lineWidth = 2; ctx.stroke();
      ctx.fillStyle = "#f59e0b"; ctx.font = `bold ${size < 200 ? 7 : 9}px sans-serif`;
      ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.fillText("SPIN", cx, cy);
      ctx.beginPath(); ctx.moveTo(cx, 2); ctx.lineTo(cx - 5, 14); ctx.lineTo(cx + 5, 14);
      ctx.closePath(); ctx.fillStyle = "#f59e0b"; ctx.fill();
      if (p < 1) animRef.current = requestAnimationFrame(animate);
    };
    animRef.current = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(animRef.current);
  }, [result]);

  return <canvas ref={canvasRef} width={220} height={220} className="rounded-full" />;
}

// ── Slot machine animation ────────────────────────────────────────────────────

function SlotReel({ symbol, spinning }: { symbol: string; spinning: boolean }) {
  const [displayed, setDisplayed] = useState(symbol);
  const [blur, setBlur] = useState(false);
  const ALL = ["🍒", "🍋", "🍇", "🍉", "🍊", "💎", "7️⃣"];
  const iRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (spinning) {
      setBlur(true);
      iRef.current = setInterval(() => {
        setDisplayed(ALL[Math.floor(Math.random() * ALL.length)]!);
      }, 80);
    } else {
      if (iRef.current) clearInterval(iRef.current);
      setBlur(false);
      setDisplayed(symbol);
    }
    return () => { if (iRef.current) clearInterval(iRef.current); };
  }, [spinning, symbol]);

  return (
    <div className={cn(
      "w-20 h-20 rounded-xl border-2 border-border bg-card flex items-center justify-center text-4xl shadow-inner transition-all",
      blur && "opacity-70",
      !spinning && symbol === "7️⃣" && "border-yellow-400 shadow-yellow-400/30 shadow-lg",
      !spinning && symbol === "💎" && "border-cyan-400 shadow-cyan-400/30 shadow-lg",
    )}>
      <span style={{ filter: blur ? "blur(1px)" : "none", transition: "filter 0.1s" }}>
        {displayed}
      </span>
    </div>
  );
}

// ── Main Casino page ──────────────────────────────────────────────────────────

export default function Casino() {
  const { toast } = useToast();
  const guildId = DEFAULT_GUILD;

  const [userId, setUserId] = useState(() => localStorage.getItem("casino_userId") ?? "");
  const [userIdInput, setUserIdInput] = useState(userId);
  const [tab, setTab] = useState<Tab>("slots");
  const [config, setConfig] = useState<Config | null>(null);
  const [balance, setBalance] = useState<Balance | null>(null);
  const [betInput, setBetInput] = useState("100");
  const [loading, setLoading] = useState(false);

  // Slots state
  const [slotReels, setSlotReels] = useState(["🎰", "🎰", "🎰"]);
  const [slotSpinning, setSlotSpinning] = useState(false);
  const [slotResult, setSlotResult] = useState<null | { reels: string[]; multiplier: number; winnings: number; net: number; resultType: string }>(null);

  // Roulette state
  const [rouletteChoice, setRouletteChoice] = useState("rouge");
  const [rouletteSpinning, setRouletteSpinning] = useState(false);
  const [rouletteResult, setRouletteResult] = useState<null | { roll: number; color: string; won: boolean; multiplier: number; label: string; winnings: number; net: number }>(null);
  const [rouletteNumber, setRouletteNumber] = useState<number | null>(null);

  // Blackjack state
  const [bjState, setBjState] = useState<BjState | null>(null);
  const [bjLoading, setBjLoading] = useState(false);

  // Daily cooldown timer
  const [dailyCountdown, setDailyCountdown] = useState("");

  useEffect(() => {
    if (!userId) return;
    apiFetch(`/bot/casino/config?guildId=${guildId}`).then(setConfig).catch(() => {});
    refreshBalance();
  }, [userId]);

  useEffect(() => {
    if (!balance || balance.canDaily) { setDailyCountdown(""); return; }
    const tick = () => {
      const ms = balance.nextDailyMs - (Date.now() - (Date.now() - balance.nextDailyMs));
      if (ms <= 0) { setDailyCountdown(""); return; }
      refreshBalance();
    };
    const id = setInterval(() => {
      setDailyCountdown(() => {
        const remaining = balance.nextDailyMs;
        if (remaining <= 0) return "";
        const h = Math.floor(remaining / 3600000);
        const m = Math.floor((remaining % 3600000) / 60000);
        return `${h}h ${m}min`;
      });
    }, 60000);
    setDailyCountdown(() => {
      const h = Math.floor(balance.nextDailyMs / 3600000);
      const m = Math.floor((balance.nextDailyMs % 3600000) / 60000);
      return `${h}h ${m}min`;
    });
    return () => clearInterval(id);
  }, [balance?.canDaily]);

  async function refreshBalance() {
    if (!userId) return;
    const b = await apiFetch(`/bot/casino/balance?guildId=${guildId}&userId=${userId}`).catch(() => null);
    if (b) setBalance(b);
  }

  function saveUserId() {
    const id = userIdInput.trim();
    if (!id) return;
    localStorage.setItem("casino_userId", id);
    setUserId(id);
    toast({ title: "✅ Connecté", description: `ID Discord : ${id}` });
  }

  async function claimDaily() {
    if (!userId || !balance?.canDaily) return;
    setLoading(true);
    try {
      const r = await apiFetch("/bot/casino/daily", {
        method: "POST",
        body: JSON.stringify({ guildId, userId }),
      });
      setBalance((b) => b ? { ...b, balance: r.balance, streak: r.streak, canDaily: false, nextDailyMs: 24 * 3600000 } : b);
      toast({
        title: "🎁 Récompense réclamée !",
        description: `+${fmt(r.earned)} ${config?.currency ?? "🪙"}${r.streak > 0 ? ` (streak ×${r.streak})` : ""}`,
      });
    } catch (e: unknown) {
      toast({ title: "❌ Erreur", description: (e as Error).message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }

  async function playSlots() {
    if (!userId || slotSpinning) return;
    const bet = parseInt(betInput);
    if (isNaN(bet) || bet <= 0) { toast({ title: "❌ Mise invalide", variant: "destructive" }); return; }
    setSlotSpinning(true);
    setSlotResult(null);
    try {
      const r = await apiFetch("/bot/casino/slots", {
        method: "POST",
        body: JSON.stringify({ guildId, userId, bet }),
      });
      await new Promise((res) => setTimeout(res, 1200));
      setSlotReels(r.reels);
      setSlotResult(r);
      setBalance((b) => b ? { ...b, balance: r.balance } : b);
      if (r.resultType === "jackpot") toast({ title: "🎉 JACKPOT !", description: `+${fmt(r.winnings)} ${config?.currency ?? "🪙"} (×${r.multiplier})` });
      else if (r.resultType === "double") toast({ title: "✨ Double !", description: `+${fmt(r.winnings)} ${config?.currency ?? "🪙"}` });
    } catch (e: unknown) {
      toast({ title: "❌ Erreur", description: (e as Error).message, variant: "destructive" });
    } finally {
      setSlotSpinning(false);
    }
  }

  async function playRoulette() {
    if (!userId || rouletteSpinning) return;
    const bet = parseInt(betInput);
    if (isNaN(bet) || bet <= 0) { toast({ title: "❌ Mise invalide", variant: "destructive" }); return; }
    const choice = rouletteChoice === "number" ? String(rouletteNumber ?? 0) : rouletteChoice;
    setRouletteSpinning(true);
    setRouletteResult(null);
    setRouletteNumber(null);
    try {
      const r = await apiFetch("/bot/casino/roulette", {
        method: "POST",
        body: JSON.stringify({ guildId, userId, bet, choice }),
      });
      await new Promise((res) => setTimeout(res, 3200));
      setRouletteResult(r);
      setRouletteNumber(r.roll);
      setBalance((b) => b ? { ...b, balance: r.balance } : b);
      if (r.won) toast({ title: "✅ Gagné !", description: `+${fmt(r.winnings)} ${config?.currency ?? "🪙"} (×${r.multiplier})` });
      else toast({ title: "❌ Perdu", description: `Numéro ${r.roll} — ${r.label}` });
    } catch (e: unknown) {
      toast({ title: "❌ Erreur", description: (e as Error).message, variant: "destructive" });
    } finally {
      setRouletteSpinning(false);
    }
  }

  async function startBj() {
    if (!userId || bjLoading) return;
    const bet = parseInt(betInput);
    if (isNaN(bet) || bet <= 0) { toast({ title: "❌ Mise invalide", variant: "destructive" }); return; }
    setBjLoading(true);
    try {
      const r = await apiFetch("/bot/casino/blackjack/start", {
        method: "POST",
        body: JSON.stringify({ guildId, userId, bet }),
      });
      setBjState(r);
      setBalance((b) => b ? { ...b, balance: r.balance } : b);
      if (r.status === "blackjack") toast({ title: "♠ BLACKJACK !", description: `+${fmt(r.payout)} ${config?.currency ?? "🪙"}` });
    } catch (e: unknown) {
      toast({ title: "❌ Erreur", description: (e as Error).message, variant: "destructive" });
    } finally {
      setBjLoading(false);
    }
  }

  async function bjAction(action: "hit" | "stand" | "double") {
    if (!userId || bjLoading) return;
    setBjLoading(true);
    try {
      const r = await apiFetch("/bot/casino/blackjack/action", {
        method: "POST",
        body: JSON.stringify({ userId, action }),
      });
      setBjState(r);
      setBalance((b) => b ? { ...b, balance: r.balance } : b);
      if (r.status === "win") toast({ title: "🏆 Victoire !", description: `+${fmt(r.payout)} ${config?.currency ?? "🪙"}` });
      else if (r.status === "push") toast({ title: "🤝 Égalité", description: "Mise remboursée" });
      else if (r.status === "bust") toast({ title: "💥 Bust !", description: "Tu as dépassé 21", variant: "destructive" });
      else if (r.status === "lose") toast({ title: "😞 Perdu", description: "Le croupier gagne" });
    } catch (e: unknown) {
      toast({ title: "❌ Erreur", description: (e as Error).message, variant: "destructive" });
    } finally {
      setBjLoading(false);
    }
  }

  const currency = config?.currency ?? "🪙";
  const isPlaying = bjState?.status === "playing";
  const bjDone = bjState && bjState.status !== "playing";

  // ── Login screen ────────────────────────────────────────────────────────────
  if (!userId) {
    return (
      <div className="flex flex-col items-center justify-center min-h-full p-8">
        <div className="w-full max-w-sm bg-card border border-border rounded-2xl p-8 space-y-6 shadow-xl">
          <div className="text-center space-y-2">
            <div className="text-5xl">🎰</div>
            <h2 className="text-2xl font-bold">Casino</h2>
            <p className="text-muted-foreground text-sm">Entre ton ID Discord pour jouer avec ton solde du serveur</p>
          </div>
          <div className="space-y-3">
            <Input
              placeholder="ID Discord (ex: 123456789012345678)"
              value={userIdInput}
              onChange={(e) => setUserIdInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && saveUserId()}
              className="text-center"
            />
            <Button className="w-full" onClick={saveUserId}>Entrer au casino →</Button>
          </div>
          <p className="text-center text-xs text-muted-foreground">
            Ton ID Discord se trouve dans Discord via<br />Paramètres → Avancé → Mode développeur,<br />puis clic droit sur ton profil → Copier l'identifiant
          </p>
        </div>
      </div>
    );
  }

  // ── Bet controls (shared) ──────────────────────────────────────────────────
  const BetRow = () => (
    <div className="flex items-center gap-2">
      <span className="text-sm text-muted-foreground whitespace-nowrap">Mise :</span>
      <Input
        type="number"
        value={betInput}
        onChange={(e) => setBetInput(e.target.value)}
        className="w-28 text-center"
        min={config?.minBet ?? 10}
        max={config?.maxBet || undefined}
        disabled={isPlaying}
      />
      {[50, 100, 500, 1000].map((v) => (
        <button
          key={v}
          onClick={() => setBetInput(String(v))}
          disabled={isPlaying}
          className="text-xs px-2 py-1 rounded border border-border hover:bg-accent transition-colors disabled:opacity-40"
        >
          {v}
        </button>
      ))}
      {balance && (
        <button
          onClick={() => setBetInput(String(balance.balance))}
          disabled={isPlaying}
          className="text-xs px-2 py-1 rounded border border-amber-500/50 text-amber-500 hover:bg-amber-500/10 transition-colors disabled:opacity-40"
        >
          Max
        </button>
      )}
    </div>
  );

  return (
    <div className="p-6 space-y-6 max-w-4xl mx-auto">

      {/* Header / Balance bar */}
      <div className="flex flex-wrap items-center gap-4 bg-card border border-border rounded-2xl px-5 py-4 shadow-sm">
        <div className="flex-1 min-w-0">
          <p className="text-xs text-muted-foreground">Solde</p>
          <p className="text-2xl font-bold tabular-nums">
            {balance ? `${fmt(balance.balance)} ${currency}` : "…"}
          </p>
          {balance && balance.streak > 0 && (
            <p className="text-xs text-orange-400">🔥 Streak {balance.streak} jour(s)</p>
          )}
        </div>
        <Button
          size="sm"
          variant={balance?.canDaily ? "default" : "outline"}
          disabled={!balance?.canDaily || loading}
          onClick={claimDaily}
          className={cn(balance?.canDaily && "animate-pulse")}
        >
          {balance?.canDaily
            ? `🎁 Daily (+${config ? fmt(config.dailyAmount) : "…"} ${currency})`
            : `⏳ Daily ${dailyCountdown}`}
        </Button>
        <button
          onClick={() => { localStorage.removeItem("casino_userId"); setUserId(""); setUserIdInput(""); }}
          className="text-xs text-muted-foreground hover:text-foreground transition-colors"
        >
          Changer de compte
        </button>
      </div>

      {/* Game tabs */}
      <div className="flex gap-2 border-b border-border pb-0">
        {(["slots", "roulette", "blackjack"] as Tab[]).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={cn(
              "px-5 py-2.5 text-sm font-medium rounded-t-xl transition-colors border border-border border-b-0 -mb-px",
              tab === t
                ? "bg-card text-foreground"
                : "bg-transparent text-muted-foreground hover:text-foreground",
            )}
          >
            {t === "slots" ? "🎰 Machines à sous" : t === "roulette" ? "🎡 Roulette" : "♠ Blackjack"}
          </button>
        ))}
      </div>

      {/* ── SLOTS ── */}
      {tab === "slots" && (
        <div className="bg-card border border-border rounded-2xl p-6 space-y-6 shadow-sm">
          <div className="text-center space-y-1">
            <h2 className="text-xl font-bold">🎰 Machine à sous</h2>
            <p className="text-xs text-muted-foreground">
              Triple 7 = ×{config?.slotsJackpotMultiplier ?? 20} • Triple 💎 = ×{Math.max(3, Math.round((config?.slotsJackpotMultiplier ?? 20) * 0.5))} • Double = ×1.5
            </p>
          </div>

          <div className="flex justify-center gap-3">
            {slotReels.map((s, i) => (
              <SlotReel key={i} symbol={s} spinning={slotSpinning} />
            ))}
          </div>

          {slotResult && !slotSpinning && (
            <div className={cn(
              "rounded-xl px-4 py-3 text-center text-sm font-medium border",
              slotResult.resultType === "jackpot" ? "bg-yellow-500/10 border-yellow-500/30 text-yellow-400" :
              slotResult.resultType === "double" ? "bg-green-500/10 border-green-500/30 text-green-400" :
              "bg-red-500/10 border-red-500/30 text-muted-foreground",
            )}>
              {slotResult.resultType === "jackpot" && `🎉 JACKPOT ! ×${slotResult.multiplier} → +${fmt(slotResult.winnings)} ${currency}`}
              {slotResult.resultType === "double" && `✨ Double ! ×1.5 → +${fmt(slotResult.winnings)} ${currency}`}
              {slotResult.resultType === "loss" && `💨 Rien… Perte de ${fmt(-slotResult.net)} ${currency}`}
            </div>
          )}

          <div className="space-y-3">
            <BetRow />
            <Button className="w-full h-12 text-base font-semibold" onClick={playSlots} disabled={slotSpinning}>
              {slotSpinning ? "🎰 Spin…" : "🎰 Lancer"}
            </Button>
          </div>
        </div>
      )}

      {/* ── ROULETTE ── */}
      {tab === "roulette" && (
        <div className="bg-card border border-border rounded-2xl p-6 space-y-6 shadow-sm">
          <div className="text-center space-y-1">
            <h2 className="text-xl font-bold">🎡 Roulette</h2>
            <p className="text-xs text-muted-foreground">Rouge/Noir/Pair/Impair = ×2 • Douzaines = ×3 • Numéro plein = ×36</p>
          </div>

          <div className="flex flex-col lg:flex-row items-center gap-6">
            <div className="flex-shrink-0">
              <RouletteWheel spinning={rouletteSpinning} result={rouletteNumber} />
            </div>

            <div className="flex-1 space-y-4 w-full">
              {rouletteResult && !rouletteSpinning && (
                <div className={cn(
                  "rounded-xl px-4 py-3 text-center text-sm font-medium border",
                  rouletteResult.won
                    ? "bg-green-500/10 border-green-500/30 text-green-400"
                    : "bg-red-500/10 border-red-500/30 text-red-400",
                )}>
                  {rouletteResult.won
                    ? `✅ Gagné ! Numéro ${rouletteResult.roll} → +${fmt(rouletteResult.winnings)} ${currency} (×${rouletteResult.multiplier})`
                    : `❌ Numéro ${rouletteResult.roll} (${rouletteResult.color === "red" ? "🔴" : rouletteResult.color === "green" ? "🟢" : "⚫"}) — Perdu`}
                </div>
              )}

              <div className="space-y-2">
                <p className="text-sm font-medium">Choix :</p>
                <div className="grid grid-cols-2 gap-2">
                  {[
                    { v: "rouge", l: "🔴 Rouge", cls: "border-red-500/40 data-[active=true]:bg-red-500/20 data-[active=true]:border-red-500" },
                    { v: "noir", l: "⚫ Noir", cls: "border-gray-500/40 data-[active=true]:bg-gray-500/20 data-[active=true]:border-gray-400" },
                    { v: "pair", l: "Pair", cls: "border-border data-[active=true]:bg-primary/20 data-[active=true]:border-primary" },
                    { v: "impair", l: "Impair", cls: "border-border data-[active=true]:bg-primary/20 data-[active=true]:border-primary" },
                    { v: "1-12", l: "1–12 (×3)", cls: "border-border data-[active=true]:bg-primary/20 data-[active=true]:border-primary" },
                    { v: "13-24", l: "13–24 (×3)", cls: "border-border data-[active=true]:bg-primary/20 data-[active=true]:border-primary" },
                    { v: "25-36", l: "25–36 (×3)", cls: "border-border data-[active=true]:bg-primary/20 data-[active=true]:border-primary" },
                    { v: "number", l: "Numéro plein (×36)", cls: "border-yellow-500/40 data-[active=true]:bg-yellow-500/20 data-[active=true]:border-yellow-500" },
                  ].map(({ v, l, cls }) => (
                    <button
                      key={v}
                      data-active={rouletteChoice === v}
                      onClick={() => setRouletteChoice(v)}
                      disabled={rouletteSpinning}
                      className={cn("px-3 py-2 rounded-lg border text-sm transition-all disabled:opacity-40", cls)}
                    >
                      {l}
                    </button>
                  ))}
                </div>
                {rouletteChoice === "number" && (
                  <Input
                    type="number"
                    placeholder="Numéro (0-36)"
                    value={rouletteNumber ?? ""}
                    onChange={(e) => setRouletteNumber(Math.max(0, Math.min(36, parseInt(e.target.value) || 0)))}
                    className="w-36 text-center"
                    min={0} max={36}
                    disabled={rouletteSpinning}
                  />
                )}
              </div>

              <div className="space-y-3">
                <BetRow />
                <Button className="w-full h-12 text-base font-semibold" onClick={playRoulette} disabled={rouletteSpinning}>
                  {rouletteSpinning ? "🎡 Rotation…" : "🎡 Lancer la bille"}
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── BLACKJACK ── */}
      {tab === "blackjack" && (
        <div className="bg-card border border-border rounded-2xl p-6 space-y-6 shadow-sm">
          <div className="text-center space-y-1">
            <h2 className="text-xl font-bold">♠ Blackjack</h2>
            <p className="text-xs text-muted-foreground">Approchez 21 sans dépasser • Blackjack naturel = ×{config ? (config as Config & { bjNaturalPayout?: number }).bjNaturalPayout ? ((config as Config & { bjNaturalPayout?: number }).bjNaturalPayout! / 100).toFixed(1) : "2.5" : "2.5"}</p>
          </div>

          {bjState && (
            <div className="space-y-4">
              <div className="space-y-3">
                <div>
                  <p className="text-xs text-muted-foreground mb-1.5">
                    Croupier ({bjState.status === "playing" ? `visible: ${bjState.dealerValue}` : bjState.dealerValue})
                  </p>
                  <div className="flex gap-2 flex-wrap">
                    {bjState.dealerHand.map((c, i) => (
                      <PlayingCard key={i} card={c} />
                    ))}
                  </div>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground mb-1.5">Toi ({bjState.playerValue})</p>
                  <div className="flex gap-2 flex-wrap">
                    {bjState.playerHand.map((c, i) => (
                      <PlayingCard key={i} card={c} />
                    ))}
                  </div>
                </div>
              </div>

              {bjDone && (
                <div className={cn(
                  "rounded-xl px-4 py-3 text-center text-sm font-semibold border",
                  (bjState.status === "win" || bjState.status === "blackjack") ? "bg-green-500/10 border-green-500/30 text-green-400" :
                  bjState.status === "push" ? "bg-yellow-500/10 border-yellow-500/30 text-yellow-400" :
                  "bg-red-500/10 border-red-500/30 text-red-400",
                )}>
                  {bjState.status === "win" && `🏆 Victoire ! +${fmt(bjState.payout)} ${currency}`}
                  {bjState.status === "blackjack" && `♠ BLACKJACK ! +${fmt(bjState.payout)} ${currency}`}
                  {bjState.status === "push" && `🤝 Égalité — mise remboursée`}
                  {bjState.status === "lose" && `😞 Le croupier gagne`}
                  {bjState.status === "bust" && `💥 Bust ! Tu as dépassé 21`}
                </div>
              )}

              {isPlaying && (
                <div className="flex gap-2">
                  <Button onClick={() => bjAction("hit")} disabled={bjLoading} className="flex-1">🃏 Tirer</Button>
                  <Button onClick={() => bjAction("stand")} disabled={bjLoading} variant="outline" className="flex-1">🛑 Rester</Button>
                  <Button onClick={() => bjAction("double")} disabled={bjLoading || !bjState.canDouble} variant="secondary" className="flex-1">💰 Doubler</Button>
                </div>
              )}

              {bjDone && (
                <Button className="w-full" variant="outline" onClick={() => { setBjState(null); }}>
                  Nouvelle partie
                </Button>
              )}
            </div>
          )}

          {!bjState && (
            <div className="space-y-4">
              <div className="grid grid-cols-3 gap-3 text-center">
                {[
                  { rank: "A", suit: "♠" }, { rank: "K", suit: "♥" }, { rank: "J", suit: "♦" }
                ].map((c, i) => (
                  <div key={i} className="flex justify-center opacity-40">
                    <PlayingCard card={c} />
                  </div>
                ))}
              </div>
              <BetRow />
              <Button className="w-full h-12 text-base font-semibold" onClick={startBj} disabled={bjLoading}>
                {bjLoading ? "Démarrage…" : "♠ Démarrer une partie"}
              </Button>
            </div>
          )}
        </div>
      )}

      {/* Payout table */}
      <details className="bg-card border border-border rounded-xl text-sm">
        <summary className="px-4 py-3 cursor-pointer font-medium text-muted-foreground hover:text-foreground transition-colors">
          📊 Tableau des gains
        </summary>
        <div className="px-4 pb-4 pt-0 space-y-3">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <p className="font-semibold mb-1">🎰 Machines à sous</p>
              <table className="w-full text-xs">
                <tbody>
                  <tr><td>7️⃣ × 3</td><td className="text-yellow-400 text-right">×{config?.slotsJackpotMultiplier ?? 20}</td></tr>
                  <tr><td>💎 × 3</td><td className="text-cyan-400 text-right">×{Math.max(3, Math.round((config?.slotsJackpotMultiplier ?? 20) * 0.5))}</td></tr>
                  <tr><td>🍉 × 3</td><td className="text-right">×{Math.max(2, Math.round((config?.slotsJackpotMultiplier ?? 20) * 0.25))}</td></tr>
                  <tr><td>Double sym.</td><td className="text-right">×1.5</td></tr>
                </tbody>
              </table>
            </div>
            <div>
              <p className="font-semibold mb-1">🎡 Roulette</p>
              <table className="w-full text-xs">
                <tbody>
                  <tr><td>Rouge / Noir</td><td className="text-right">×2</td></tr>
                  <tr><td>Pair / Impair</td><td className="text-right">×2</td></tr>
                  <tr><td>Douzaine</td><td className="text-right">×3</td></tr>
                  <tr><td>Numéro plein</td><td className="text-yellow-400 text-right">×36</td></tr>
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </details>
    </div>
  );
}
