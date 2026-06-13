import { useState, useEffect, useCallback } from "react";
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

function AuthenticatedApp() {
  const qc = useQueryClient();
  const [syncStatus, setSyncStatus] = useState<SyncStatus>("idle");

  useEffect(() => {
    syncOnOpen((status) => {
      setSyncStatus(status);
      // When pull completes, invalidate all queries so UI refreshes
      if (status === "done") {
        qc.invalidateQueries();
        // Reset to idle after 3s
        setTimeout(() => setSyncStatus("idle"), 3000);
      }
      if (status === "offline" || status === "error" || status === "unconfigured") {
        setTimeout(() => setSyncStatus("idle"), 4000);
      }
    });
  }, [qc]);

  return <AppRoutes syncStatus={syncStatus} />;
}

function App() {
  const [loggedIn, setLoggedIn] = useState(isLoggedIn());

  const handleLogin = useCallback(() => setLoggedIn(true), []);
  const handleLogout = useCallback(() => { logout(); setLoggedIn(false); }, []);

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
          <AuthenticatedApp />
        </WouterRouter>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
