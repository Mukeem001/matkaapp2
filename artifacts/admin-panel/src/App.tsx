import { Switch, Route, Router as WouterRouter, Redirect } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ErrorBoundary } from "@/components/error-boundary";

import { ProtectedRoute } from "@/lib/auth";
import { Layout } from "@/components/layout";
import NotFound from "@/pages/not-found";

import Login from "@/pages/login";
import Dashboard from "@/pages/dashboard";
import Markets from "@/pages/markets";
import Markets2 from "@/pages/markets2";
import Results from "@/pages/results";
import GameRates from "@/pages/game-rates";
import Users from "@/pages/users";
import Bids from "@/pages/bids";
import Deposits from "@/pages/deposits";
import Withdrawals from "@/pages/withdrawals";
import Notices from "@/pages/notices";
import Logs from "@/pages/logs";
import Settings from "@/pages/settings";

// Configure React Query with aggressive cache busting for market status updates
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 0, // Data is immediately stale
      refetchInterval: 60000, // Auto-refetch every 60 seconds
      refetchOnMount: 'stale', // Refetch on mount if data is stale
      refetchOnWindowFocus: true, // Refetch when window regains focus
      refetchOnReconnect: true, // Refetch when connection is restored
      cacheTime: 5000, // Keep unused data in cache for only 5 seconds
      retry: 1, // Retry failed requests once
    },
  },
});

function Router() {
  return (
    <Switch>
      <Route path="/login" component={Login} />
      
      <Route path="/">
        <Redirect to="/dashboard" />
      </Route>

      <Route path="/dashboard">
        <ProtectedRoute component={() => <Layout><Dashboard /></Layout>} />
      </Route>
      <Route path="/markets">
        <ProtectedRoute component={() => <Layout><Markets /></Layout>} />
      </Route>
      <Route path="/markets2">
        <ProtectedRoute component={() => <Layout><Markets2 /></Layout>} />
      </Route>
      <Route path="/results">
        <ProtectedRoute component={() => <Layout><Results /></Layout>} />
      </Route>
      <Route path="/game-rates">
        <ProtectedRoute component={() => <Layout><GameRates /></Layout>} />
      </Route>
      <Route path="/users">
        <ProtectedRoute component={() => <Layout><Users /></Layout>} />
      </Route>
      <Route path="/bids">
        <ProtectedRoute component={() => <Layout><Bids /></Layout>} />
      </Route>
      <Route path="/deposits">
        <ProtectedRoute component={() => <Layout><Deposits /></Layout>} />
      </Route>
      <Route path="/withdrawals">
        <ProtectedRoute component={() => <Layout><Withdrawals /></Layout>} />
      </Route>
      <Route path="/notices">
        <ProtectedRoute component={() => <Layout><Notices /></Layout>} />
      </Route>
      <Route path="/logs">
        <ProtectedRoute component={() => <Layout><Logs /></Layout>} />
      </Route>
      <Route path="/settings">
        <ProtectedRoute component={() => <Layout><Settings /></Layout>} />
      </Route>
      
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <ErrorBoundary>
          <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
            <Router />
          </WouterRouter>
        </ErrorBoundary>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
