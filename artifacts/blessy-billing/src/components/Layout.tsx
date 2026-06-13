import { Link, useLocation } from "wouter";
import { cn } from "@/lib/utils";
import {
  LayoutDashboard,
  FileText,
  Users,
  Package,
  Settings,
  Menu,
  X,
  LogOut,
  Cloud,
  CloudOff,
  RefreshCw,
  CheckCircle2,
  WifiOff,
} from "lucide-react";
import { useState } from "react";
import { logout } from "@/lib/auth";
import type { SyncStatus } from "@/lib/sync";

const navItems = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard },
  { href: "/invoices", label: "Invoices", icon: FileText },
  { href: "/customers", label: "Customers", icon: Users },
  { href: "/products", label: "Products", icon: Package },
  { href: "/settings", label: "Settings", icon: Settings },
];

function SyncIndicator({ status }: { status: SyncStatus }) {
  if (status === "idle" || status === "unconfigured") return null;

  const config: Record<SyncStatus, { icon: React.ReactNode; text: string; className: string }> = {
    idle:         { icon: null, text: "", className: "" },
    unconfigured: { icon: null, text: "", className: "" },
    checking:     { icon: <RefreshCw className="h-3 w-3 animate-spin" />, text: "Checking...", className: "text-slate-400" },
    pulling:      { icon: <RefreshCw className="h-3 w-3 animate-spin" />, text: "Syncing...", className: "text-blue-500" },
    done:         { icon: <CheckCircle2 className="h-3 w-3" />, text: "Synced", className: "text-emerald-500" },
    offline:      { icon: <WifiOff className="h-3 w-3" />, text: "Offline", className: "text-amber-500" },
    error:        { icon: <CloudOff className="h-3 w-3" />, text: "Sync failed", className: "text-red-400" },
  };

  const { icon, text, className } = config[status];
  if (!text) return null;

  return (
    <div className={cn("flex items-center gap-1.5 text-xs font-medium px-3 py-2", className)}>
      {icon}
      <span>{text}</span>
    </div>
  );
}

interface LayoutProps {
  children: React.ReactNode;
  syncStatus: SyncStatus;
}

export default function Layout({ children, syncStatus }: LayoutProps) {
  const [location] = useLocation();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const isActive = (href: string) => {
    if (href === "/") return location === "/";
    return location.startsWith(href);
  };

  function handleLogout() {
    logout();
    window.location.reload();
  }

  return (
    <div className="flex h-screen bg-slate-50 overflow-hidden">
      {/* Mobile overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-black/20 z-20 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        className={cn(
          "fixed lg:static inset-y-0 left-0 z-30 w-60 bg-white border-r border-slate-200 flex flex-col transform transition-transform duration-200",
          sidebarOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0"
        )}
      >
        {/* Logo */}
        <div className="px-5 py-5 border-b border-slate-100">
          <div className="flex items-center gap-3">
            <div className="h-9 w-9 bg-emerald-600 rounded-lg flex items-center justify-center flex-shrink-0">
              <span className="text-white font-bold text-sm">BP</span>
            </div>
            <div>
              <p className="font-bold text-slate-900 text-sm leading-tight">Blessy</p>
              <p className="text-xs text-slate-500 leading-tight">Packagings</p>
            </div>
          </div>
        </div>

        {/* Nav */}
        <nav className="flex-1 px-3 py-4 space-y-0.5">
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
                    ? "bg-emerald-50 text-emerald-700"
                    : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"
                )}
                data-testid={`nav-${item.label.toLowerCase()}`}
                onClick={() => setSidebarOpen(false)}
              >
                <Icon className={cn("h-4 w-4 flex-shrink-0", active ? "text-emerald-600" : "text-slate-400")} />
                {item.label}
              </Link>
            );
          })}
        </nav>

        {/* Footer — sync status + logout */}
        <div className="border-t border-slate-100">
          <SyncIndicator status={syncStatus} />
          <div className="px-3 pb-3">
            <button
              onClick={handleLogout}
              className="flex items-center gap-2 w-full px-3 py-2 text-sm text-slate-500 hover:text-red-600 hover:bg-red-50 rounded-lg transition-all"
              data-testid="button-logout"
            >
              <LogOut className="h-4 w-4" />
              Sign out
            </button>
          </div>
        </div>
      </aside>

      {/* Main content */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Mobile header */}
        <header className="lg:hidden bg-white border-b border-slate-200 px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button
              onClick={() => setSidebarOpen(!sidebarOpen)}
              className="p-1.5 rounded-md hover:bg-slate-100 text-slate-600"
              data-testid="button-toggle-sidebar"
            >
              {sidebarOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
            </button>
            <div className="flex items-center gap-2">
              <div className="h-7 w-7 bg-emerald-600 rounded-md flex items-center justify-center">
                <span className="text-white font-bold text-xs">BP</span>
              </div>
              <span className="font-bold text-slate-900 text-sm">Blessy Packagings</span>
            </div>
          </div>
          {/* Mobile sync indicator */}
          <SyncIndicator status={syncStatus} />
        </header>

        {/* Page content */}
        <main className="flex-1 overflow-y-auto">
          <div className="max-w-6xl mx-auto px-4 lg:px-6 py-6">
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}
