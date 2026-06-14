import { Link, useLocation } from "wouter";
import { cn } from "@/lib/utils";
import {
  LayoutDashboard, FileText, Users, Package, Settings,
  Menu, X, LogOut, RefreshCw, CheckCircle2, WifiOff,
  CloudOff, Wifi, Github, ShieldCheck,
} from "lucide-react";
import { useState, useEffect } from "react";
import { logout } from "@/lib/auth";
import { getSettings } from "@/lib/db";
import type { SyncStatus } from "@/lib/sync";

const navItems = [
  { href: "/",           label: "Dashboard", icon: LayoutDashboard },
  { href: "/invoices",   label: "Invoices",  icon: FileText },
  { href: "/customers",  label: "Customers", icon: Users },
  { href: "/products",   label: "Products",  icon: Package },
  { href: "/settings",   label: "Settings",  icon: Settings },
];

// ── Status dot ────────────────────────────────────────────────────────────────
function Dot({ ok, warn }: { ok?: boolean; warn?: boolean }) {
  return (
    <span className={cn(
      "inline-block h-2 w-2 rounded-full flex-shrink-0",
      ok   ? "bg-emerald-400" :
      warn ? "bg-amber-400"   : "bg-red-400"
    )} />
  );
}

// ── Full status bar (sidebar footer) ─────────────────────────────────────────
function StatusBar({ syncStatus }: { syncStatus: SyncStatus }) {
  const [online, setOnline] = useState(navigator.onLine);
  const [githubConfigured, setGithubConfigured] = useState(false);

  useEffect(() => {
    const on  = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener("online",  on);
    window.addEventListener("offline", off);
    return () => { window.removeEventListener("online", on); window.removeEventListener("offline", off); };
  }, []);

  useEffect(() => {
    getSettings().then((s) => setGithubConfigured(!!(s.githubPat && s.githubRepo)));
  }, []);

  const syncLabel: Record<SyncStatus, { text: string; ok?: boolean; warn?: boolean }> = {
    idle:         { text: "Idle",         ok: true },
    checking:     { text: "Checking...",  warn: true },
    pulling:      { text: "Syncing...",   warn: true },
    done:         { text: "Synced",       ok: true },
    offline:      { text: "Offline",      warn: true },
    error:        { text: "Failed",       ok: false },
    unconfigured: { text: "Not set up",   ok: false },
  };

  const sync = syncLabel[syncStatus];

  return (
    <div className="px-3 py-3 space-y-1.5 border-t border-blue-700">
      {/* Auth */}
      <div className="flex items-center gap-2 px-2 py-1">
        <ShieldCheck className="h-3.5 w-3.5 text-blue-300 flex-shrink-0" />
        <span className="text-xs text-blue-200 flex-1">Blessy Packagings</span>
        <Dot ok />
      </div>

      {/* GitHub */}
      <div className="flex items-center gap-2 px-2 py-1">
        <Github className="h-3.5 w-3.5 text-blue-300 flex-shrink-0" />
        <span className="text-xs text-blue-200 flex-1">
          {githubConfigured ? "GitHub" : "GitHub (not set)"}
        </span>
        <Dot ok={githubConfigured} />
      </div>

      {/* Server / Network */}
      <div className="flex items-center gap-2 px-2 py-1">
        {online
          ? <Wifi    className="h-3.5 w-3.5 text-blue-300 flex-shrink-0" />
          : <WifiOff className="h-3.5 w-3.5 text-blue-300 flex-shrink-0" />
        }
        <span className="text-xs text-blue-200 flex-1">{online ? "Online" : "Offline"}</span>
        <Dot ok={online} warn={false} />
      </div>

      {/* Sync */}
      <div className="flex items-center gap-2 px-2 py-1">
        {syncStatus === "checking" || syncStatus === "pulling"
          ? <RefreshCw  className="h-3.5 w-3.5 text-blue-300 flex-shrink-0 animate-spin" />
          : syncStatus === "done"
          ? <CheckCircle2 className="h-3.5 w-3.5 text-blue-300 flex-shrink-0" />
          : <CloudOff className="h-3.5 w-3.5 text-blue-300 flex-shrink-0" />
        }
        <span className="text-xs text-blue-200 flex-1">Sync: {sync.text}</span>
        <Dot ok={sync.ok} warn={sync.warn} />
      </div>

      {/* Logout */}
      <button
        onClick={() => { logout(); window.location.reload(); }}
        className="flex items-center gap-2 w-full px-2 py-1.5 mt-1 text-xs text-blue-200 hover:text-white hover:bg-blue-700 rounded-lg transition-all"
        data-testid="button-logout"
      >
        <LogOut className="h-3.5 w-3.5" />
        Sign out
      </button>
    </div>
  );
}

// ── Mobile sync pill ──────────────────────────────────────────────────────────
function MobileSyncPill({ syncStatus }: { syncStatus: SyncStatus }) {
  if (syncStatus === "idle" || syncStatus === "unconfigured") return null;
  const map: Record<SyncStatus, { text: string; cls: string }> = {
    idle:         { text: "",           cls: "" },
    unconfigured: { text: "",           cls: "" },
    checking:     { text: "Checking",   cls: "text-slate-400" },
    pulling:      { text: "Syncing...", cls: "text-blue-500" },
    done:         { text: "Synced ✓",   cls: "text-emerald-600" },
    offline:      { text: "Offline",    cls: "text-amber-500" },
    error:        { text: "Sync failed",cls: "text-red-500" },
  };
  const { text, cls } = map[syncStatus];
  return <span className={cn("text-xs font-medium", cls)}>{text}</span>;
}

// ── Layout ────────────────────────────────────────────────────────────────────
interface LayoutProps {
  children: React.ReactNode;
  syncStatus: SyncStatus;
}

export default function Layout({ children, syncStatus }: LayoutProps) {
  const [location] = useLocation();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const isActive = (href: string) =>
    href === "/" ? location === "/" : location.startsWith(href);

  return (
    <div className="flex h-screen overflow-hidden" style={{ background: "#f8fafc" }}>
      {/* Mobile overlay */}
      {sidebarOpen && (
        <div className="fixed inset-0 bg-black/30 z-20 lg:hidden"
          onClick={() => setSidebarOpen(false)} />
      )}

      {/* Sidebar */}
      <aside className={cn(
        "fixed lg:static inset-y-0 left-0 z-30 w-60 flex flex-col transform transition-transform duration-200",
        "text-white",
        sidebarOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0"
      )}
        style={{ background: "#1A5FA8" }}
      >
        {/* Logo area */}
        <div className="px-4 py-5 border-b border-blue-700">
          <div className="flex items-center gap-3">
            <img
              src="/Offline-Billing-System/logo-icon.png"
              alt="Blessy Packagings"
              className="h-10 w-10 object-contain flex-shrink-0"
              onError={(e) => {
                // fallback to text monogram if image fails
                const t = e.currentTarget;
                t.style.display = "none";
                t.nextElementSibling?.classList.remove("hidden");
              }}
            />
            <div className="hidden h-10 w-10 rounded-lg flex-shrink-0 items-center justify-center text-white font-bold"
              style={{ background: "#F7A023" }}>BP</div>
            <div>
              <p className="font-bold text-white text-sm leading-tight tracking-wide">BLESSY</p>
              <p className="text-xs text-blue-200 leading-tight">Packagings</p>
            </div>
          </div>
        </div>

        {/* Nav */}
        <nav className="flex-1 px-3 py-4 space-y-0.5 overflow-y-auto">
          {navItems.map((item) => {
            const Icon = item.icon;
            const active = isActive(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all",
                  active
                    ? "bg-white/20 text-white"
                    : "text-blue-100 hover:bg-white/10 hover:text-white"
                )}
                data-testid={`nav-${item.label.toLowerCase()}`}
                onClick={() => setSidebarOpen(false)}
              >
                <Icon className={cn("h-4 w-4 flex-shrink-0", active ? "text-white" : "text-blue-300")} />
                {item.label}
              </Link>
            );
          })}
        </nav>

        {/* Status bar */}
        <StatusBar syncStatus={syncStatus} />
      </aside>

      {/* Main */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Mobile header */}
        <header className="lg:hidden bg-white border-b border-slate-200 px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button
              onClick={() => setSidebarOpen(!sidebarOpen)}
              className="p-1.5 rounded-md hover:bg-slate-100 text-slate-600"
            >
              {sidebarOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
            </button>
            <img
              src="/Offline-Billing-System/logo-icon.png"
              alt="BP"
              className="h-7 w-7 object-contain"
            />
            <span className="font-bold text-slate-900 text-sm">Blessy Packagings</span>
          </div>
          <MobileSyncPill syncStatus={syncStatus} />
        </header>

        {/* Page */}
        <main className="flex-1 overflow-y-auto">
          <div className="max-w-6xl mx-auto px-4 lg:px-6 py-6">
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}
