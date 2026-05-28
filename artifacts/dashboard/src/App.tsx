import { Switch, Route, Router as WouterRouter, useLocation } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { useState } from "react";
import { Sidebar } from "@/components/layout/Sidebar";
import { Header } from "@/components/layout/Header";
import { useTheme } from "@/hooks/useTheme";
import NotFound from "@/pages/not-found";
import Overview from "@/pages/Overview";
import Leaderboard from "@/pages/Leaderboard";
import Economy from "@/pages/Economy";
import Moderation from "@/pages/Moderation";
import Polls from "@/pages/Polls";
import Commands from "@/pages/Commands";
import { NAV_ITEMS } from "@/lib/constants";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 2 * 60 * 1000,
      retry: 1,
    },
  },
});

const PAGE_TITLES: Record<string, string> = {
  "/": "Vue d'ensemble",
  "/leaderboard": "Classement XP",
  "/economy": "Économie",
  "/moderation": "Modération",
  "/polls": "Sondages",
  "/commands": "Commandes",
};

function DashboardShell() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [location] = useLocation();
  const { theme } = useTheme();

  const title = PAGE_TITLES[location] ?? "Dashboard";

  return (
    <div className={`flex h-screen overflow-hidden bg-background ${theme}`}>
      <Sidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} />
      <div className="flex flex-col flex-1 min-w-0 overflow-hidden">
        <Header title={title} onMenuClick={() => setSidebarOpen(true)} />
        <main className="flex-1 overflow-y-auto">
          <Switch>
            <Route path="/" component={Overview} />
            <Route path="/leaderboard" component={Leaderboard} />
            <Route path="/economy" component={Economy} />
            <Route path="/moderation" component={Moderation} />
            <Route path="/polls" component={Polls} />
            <Route path="/commands" component={Commands} />
            <Route component={NotFound} />
          </Switch>
        </main>
      </div>
    </div>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
          <DashboardShell />
        </WouterRouter>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
