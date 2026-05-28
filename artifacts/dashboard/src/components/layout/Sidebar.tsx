import { Link, useLocation } from "wouter";
import { NAV_ITEMS } from "@/lib/constants";
import {
  LayoutDashboard,
  Trophy,
  Coins,
  ShieldAlert,
  BarChart3,
  Bot,
  X,
  Terminal,
} from "lucide-react";
import { cn } from "@/lib/utils";

const ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  LayoutDashboard,
  Trophy,
  Coins,
  ShieldAlert,
  BarChart3,
  Terminal,
};

interface SidebarProps {
  open: boolean;
  onClose: () => void;
}

export function Sidebar({ open, onClose }: SidebarProps) {
  const [location] = useLocation();

  return (
    <>
      {open && (
        <div
          className="fixed inset-0 z-20 bg-black/50 lg:hidden"
          onClick={onClose}
        />
      )}
      <aside
        className={cn(
          "fixed top-0 left-0 z-30 h-full w-60 flex flex-col transition-transform duration-200",
          "bg-[hsl(var(--sidebar))] text-[hsl(var(--sidebar-foreground))]",
          "border-r border-[hsl(var(--sidebar-border))]",
          open ? "translate-x-0" : "-translate-x-full",
          "lg:translate-x-0 lg:static lg:z-auto lg:h-screen",
        )}
      >
        <div className="flex items-center gap-2.5 px-5 py-5 border-b border-[hsl(var(--sidebar-border))]">
          <div className="flex items-center justify-center w-8 h-8 rounded-full bg-[hsl(var(--sidebar-primary))]">
            <Bot className="w-4 h-4 text-white" />
          </div>
          <span className="font-semibold text-sm tracking-tight">
            Bot Dashboard
          </span>
          <button
            className="ml-auto lg:hidden text-[hsl(var(--sidebar-foreground))] opacity-60 hover:opacity-100"
            onClick={onClose}
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-0.5">
          {NAV_ITEMS.map((item) => {
            const Icon = ICONS[item.icon];
            const active = location === item.path;
            return (
              <Link
                key={item.path}
                href={item.path}
                onClick={onClose}
                className={cn(
                  "flex items-center gap-3 px-3 py-2 rounded-md text-sm transition-colors",
                  active
                    ? "bg-[hsl(var(--sidebar-primary))] text-white font-medium"
                    : "text-[hsl(var(--sidebar-foreground))] opacity-70 hover:opacity-100 hover:bg-[hsl(var(--sidebar-accent))]",
                )}
              >
                <Icon className="w-4 h-4 shrink-0" />
                {item.label}
              </Link>
            );
          })}
        </nav>

        <div className="px-5 py-3 border-t border-[hsl(var(--sidebar-border))] text-[10px] opacity-30">
          Louboutin#0386 · discord.js v14
        </div>
      </aside>
    </>
  );
}
