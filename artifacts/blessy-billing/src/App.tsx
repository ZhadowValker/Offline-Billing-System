import { useState, useCallback, useRef } from "react";
import { Switch, Route, Router as WouterRouter } from "wouter";
import { QueryClient, QueryClientProvider, useQueryClient } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import Layout from "@/components/Layout";
import Dashboard from "@/pages/Dashboard";
import InvoiceList from "@/pages/InvoiceList";
import InvoiceForm from "@/pages/InvoiceForm";
import InvoiceView from "@/pages/InvoiceView";
import Customers from "@/pages/Customers";
import Products from "@/pages/Products";
import SettingsPage from "@/pages/SettingsPage";
import NotFound from "@/pages/not-found";
import LoginPage from "@/pages/LoginPage";
import { isLoggedIn, logout } from "@/lib/auth";
import { syncOnOpen, type SyncStatus } from "@/lib/sync";

const queryClient = new QueryClient();

function AppRoutes({ syncStatus }: { syncStatus: SyncStatus }) {
  return (
    <Layout syncStatus={syncStatus}>
      <Switch>
        <Route path="/" component={Dashboard} />
        <Route path="/invoices" component={InvoiceList} />
        <Route path="/invoices/new">
          {() => <InvoiceForm mode="create" />}
        </Route>
        <Route path="/invoices/:id/edit">
          {() => <InvoiceForm mode="edit" />}
        </Route>
        <Route path="/invoices/:id" component={InvoiceView} />
        <Route path="/customers" component={Customers} />
        <Route path="/products" component={Products} />
        <Route path="/settings" component={SettingsPage} />
        <Route component={NotFound} />
      </Switch>
    </Layout>
  );
}

function AuthenticatedApp({ syncStatus }: { syncStatus: SyncStatus }) {
  return <AppRoutes syncStatus={syncStatus} />;
}

function App() {
  const [loggedIn, setLoggedIn] = useState(isLoggedIn());
  const [syncStatus, setSyncStatus] = useState<SyncStatus>("idle");
  // Ref to avoid stale closure in the sync callback
  const syncStatusRef = useRef<SyncStatus>("idle");

  const runSync = useCallback(() => {
    syncOnOpen((status) => {
      syncStatusRef.current = status;
      setSyncStatus(status);

      if (status === "done") {
        // Invalidate React Query cache so every page re-fetches fresh data
        queryClient.invalidateQueries();
        setTimeout(() => setSyncStatus("idle"), 3000);
      }
      if (status === "offline" || status === "error" || status === "unconfigured") {
        setTimeout(() => setSyncStatus("idle"), 4000);
      }
    });
  }, []);

  // Trigger sync immediately on login — before any page renders
  const handleLogin = useCallback(() => {
    setLoggedIn(true);
    runSync();
  }, [runSync]);

  const handleLogout = useCallback(() => {
    logout();
    setLoggedIn(false);
    setSyncStatus("idle");
  }, []);

  if (!loggedIn) {
    return (
      <QueryClientProvider client={queryClient}>
        <TooltipProvider>
          <LoginPage onLogin={handleLogin} />
          <Toaster />
        </TooltipProvider>
      </QueryClientProvider>
    );
  }

  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
          <AuthenticatedApp syncStatus={syncStatus} />
        </WouterRouter>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
