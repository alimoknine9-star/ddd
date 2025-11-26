import { Switch, Route } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ThemeProvider } from "@/components/theme-provider";
import { StaffLayout } from "@/components/staff-layout";
import { useWebSocket } from "@/hooks/use-websocket";
import NotFound from "@/pages/not-found";
import Login from "@/pages/login";
import CustomerMenu from "@/pages/customer-menu";
import WaiterDashboard from "@/pages/waiter-dashboard";
import KitchenScreen from "@/pages/kitchen-screen";
import CashierInterface from "@/pages/cashier-interface";
import AdminPanel from "@/pages/admin-panel";
import ReservationsPage from "@/pages/reservations";
import AnalyticsPage from "@/pages/analytics";
import SuperAdminDashboard from "@/pages/super-admin-dashboard";

function Router() {
  // Initialize WebSocket for real-time updates
  useWebSocket();

  return (
    <Switch>
      <Route path="/" component={Login} />
      <Route path="/menu" component={CustomerMenu} />
      
      <Route path="/waiter">
        <StaffLayout role="waiter">
          <WaiterDashboard />
        </StaffLayout>
      </Route>
      
      <Route path="/kitchen">
        <StaffLayout role="kitchen">
          <KitchenScreen />
        </StaffLayout>
      </Route>
      
      <Route path="/cashier">
        <StaffLayout role="cashier">
          <CashierInterface />
        </StaffLayout>
      </Route>
      
      <Route path="/admin">
        <StaffLayout role="admin">
          <AdminPanel />
        </StaffLayout>
      </Route>
      
      <Route path="/reservations">
        <StaffLayout role="admin">
          <ReservationsPage />
        </StaffLayout>
      </Route>
      
      <Route path="/analytics">
        <StaffLayout role="admin">
          <AnalyticsPage />
        </StaffLayout>
      </Route>
      
      <Route path="/super-admin" component={SuperAdminDashboard} />
      
      <Route component={NotFound} />
    </Switch>
  );
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <TooltipProvider>
          <Router />
          <Toaster />
        </TooltipProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
}
