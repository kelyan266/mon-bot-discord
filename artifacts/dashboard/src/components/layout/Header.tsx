import { Menu, Sun, Moon, RefreshCw, Printer } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useTheme } from "@/hooks/useTheme";
import { useQueryClient } from "@tanstack/react-query";
import { REFRESH_INTERVALS } from "@/lib/constants";
import { useEffect, useRef, useState } from "react";

interface HeaderProps {
  title: string;
  onMenuClick: () => void;
}

export function Header({ title, onMenuClick }: HeaderProps) {
  const { theme, toggle } = useTheme();
  const qc = useQueryClient();
  const [autoRefresh, setAutoRefresh] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (timerRef.current) clearInterval(timerRef.current);
    if (autoRefresh > 0) {
      timerRef.current = setInterval(() => {
        qc.invalidateQueries();
      }, autoRefresh);
    }
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [autoRefresh, qc]);

  const currentLabel =
    REFRESH_INTERVALS.find((r) => r.value === autoRefresh)?.label ?? "Manuel";

  return (
    <header className="sticky top-0 z-10 flex items-center gap-3 px-4 h-14 border-b border-border bg-background/90 backdrop-blur-sm">
      <button
        className="lg:hidden text-muted-foreground hover:text-foreground"
        onClick={onMenuClick}
      >
        <Menu className="w-5 h-5" />
      </button>

      <h1 className="flex-1 text-sm font-semibold text-foreground">{title}</h1>

      <Button
        variant="outline"
        size="sm"
        className="hidden sm:flex gap-1.5 text-xs"
        onClick={() => window.print()}
      >
        <Printer className="w-3.5 h-3.5" />
        Export PDF
      </Button>

      <div className="flex items-center border border-border rounded-md overflow-hidden">
        <Button
          variant="ghost"
          size="sm"
          className="rounded-none border-r border-border h-8 px-3 text-xs gap-1.5"
          onClick={() => qc.invalidateQueries()}
        >
          <RefreshCw className="w-3.5 h-3.5" />
          <span className="hidden sm:inline">Actualiser</span>
        </Button>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="sm"
              className="rounded-none h-8 px-2 text-xs"
            >
              {currentLabel}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            {REFRESH_INTERVALS.map((r) => (
              <DropdownMenuItem
                key={r.value}
                onClick={() => setAutoRefresh(r.value)}
              >
                {r.label}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <Button variant="ghost" size="icon" className="h-8 w-8" onClick={toggle}>
        {theme === "dark" ? (
          <Sun className="w-4 h-4" />
        ) : (
          <Moon className="w-4 h-4" />
        )}
      </Button>
    </header>
  );
}
