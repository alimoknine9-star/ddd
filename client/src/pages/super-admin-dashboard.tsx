import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Building2, CreditCard, AlertTriangle, Plus, CalendarPlus } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useLocation } from "wouter";
import type { Organization, SubscriptionPlan } from "@shared/schema";

type AdminStats = {
  totalOrganizations: number;
  activeSubscriptions: number;
  expiringSoon: number;
};

type OrganizationWithStatus = Organization & {
  subscriptionStatus: "active" | "expired";
  currentPlan: SubscriptionPlan | null;
  expiresAt: string | null;
  daysRemaining: number;
};

type SessionData = {
  authenticated: boolean;
  user?: {
    id: number;
    username: string;
    name: string;
    globalRole: string;
    role: string;
    email: string | null;
  };
};

export default function SuperAdminDashboard() {
  const { toast } = useToast();
  const [, navigate] = useLocation();
  const [subscriptionDialogOpen, setSubscriptionDialogOpen] = useState(false);
  const [selectedOrg, setSelectedOrg] = useState<OrganizationWithStatus | null>(null);
  const [selectedPlanId, setSelectedPlanId] = useState<string>("");

  const { data: session, isLoading: sessionLoading } = useQuery<SessionData>({
    queryKey: ["/api/auth/session"],
  });

  const { data: stats, isLoading: statsLoading } = useQuery<AdminStats>({
    queryKey: ["/api/admin/stats"],
    enabled: session?.user?.globalRole === "super_admin",
  });

  const { data: organizations = [], isLoading: orgsLoading } = useQuery<OrganizationWithStatus[]>({
    queryKey: ["/api/admin/organizations"],
    enabled: session?.user?.globalRole === "super_admin",
  });

  const { data: plans = [] } = useQuery<SubscriptionPlan[]>({
    queryKey: ["/api/admin/plans"],
    enabled: session?.user?.globalRole === "super_admin",
  });

  const addSubscriptionMutation = useMutation({
    mutationFn: (data: { organizationId: number; planId: number }) =>
      apiRequest("POST", "/api/admin/subscriptions", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/organizations"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/stats"] });
      setSubscriptionDialogOpen(false);
      setSelectedOrg(null);
      setSelectedPlanId("");
      toast({ title: "Subscription added successfully" });
    },
    onError: (error: Error) => {
      toast({
        title: "Failed to add subscription",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const handleAddSubscription = (org: OrganizationWithStatus) => {
    setSelectedOrg(org);
    setSubscriptionDialogOpen(true);
  };

  const handleConfirmSubscription = () => {
    if (!selectedOrg || !selectedPlanId) return;
    addSubscriptionMutation.mutate({
      organizationId: selectedOrg.id,
      planId: parseInt(selectedPlanId),
    });
  };

  if (sessionLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-muted-foreground">Loading...</p>
      </div>
    );
  }

  if (!session?.authenticated || session.user?.globalRole !== "super_admin") {
    return (
      <div className="min-h-screen flex items-center justify-center p-6">
        <Card className="max-w-md w-full">
          <CardHeader>
            <CardTitle className="text-destructive">Access Denied</CardTitle>
            <CardDescription>
              You don't have permission to access this page. Only super administrators can view this dashboard.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button onClick={() => navigate("/")} className="w-full">
              Go to Home
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  const isLoading = statsLoading || orgsLoading;

  return (
    <div className="min-h-screen bg-background">
      <div className="p-4 md:p-6 space-y-6 max-w-7xl mx-auto">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl md:text-3xl font-bold">Super Admin Dashboard</h1>
            <p className="text-muted-foreground">Manage all organization subscriptions</p>
          </div>
          <Badge variant="outline" className="w-fit">
            {session.user?.name || session.user?.username}
          </Badge>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-sm font-medium">
                <Building2 className="h-4 w-4 text-primary" />
                Total Organizations
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-3xl font-bold">
                {isLoading ? "..." : stats?.totalOrganizations || 0}
              </p>
              <p className="text-xs text-muted-foreground">Registered businesses</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-sm font-medium">
                <CreditCard className="h-4 w-4 text-green-500" />
                Active Subscriptions
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-3xl font-bold text-green-600">
                {isLoading ? "..." : stats?.activeSubscriptions || 0}
              </p>
              <p className="text-xs text-muted-foreground">Currently active</p>
            </CardContent>
          </Card>

          <Card className="sm:col-span-2 lg:col-span-1">
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-sm font-medium">
                <AlertTriangle className="h-4 w-4 text-amber-500" />
                Expiring Soon
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-3xl font-bold text-amber-600">
                {isLoading ? "..." : stats?.expiringSoon || 0}
              </p>
              <p className="text-xs text-muted-foreground">Within 7 days</p>
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Organizations</CardTitle>
            <CardDescription>
              View and manage all registered organizations and their subscriptions
            </CardDescription>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="py-8 text-center text-muted-foreground">
                Loading organizations...
              </div>
            ) : organizations.length === 0 ? (
              <div className="py-8 text-center text-muted-foreground">
                No organizations registered yet
              </div>
            ) : (
              <>
                <div className="hidden md:block">
                  <ScrollArea className="w-full">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Name</TableHead>
                          <TableHead>Type</TableHead>
                          <TableHead>Email</TableHead>
                          <TableHead>Status</TableHead>
                          <TableHead>Current Plan</TableHead>
                          <TableHead>Days Remaining</TableHead>
                          <TableHead className="text-right">Actions</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {organizations.map((org) => (
                          <TableRow key={org.id}>
                            <TableCell className="font-medium">{org.name}</TableCell>
                            <TableCell>
                              <Badge variant="outline" className="capitalize">
                                {org.type.replace("_", " ")}
                              </Badge>
                            </TableCell>
                            <TableCell className="text-muted-foreground">
                              {org.email}
                            </TableCell>
                            <TableCell>
                              <Badge
                                variant={org.subscriptionStatus === "active" ? "default" : "destructive"}
                              >
                                {org.subscriptionStatus === "active" ? "Active" : "Expired"}
                              </Badge>
                            </TableCell>
                            <TableCell>
                              {org.currentPlan?.name || (
                                <span className="text-muted-foreground">No plan</span>
                              )}
                            </TableCell>
                            <TableCell>
                              {org.subscriptionStatus === "active" ? (
                                <span
                                  className={
                                    org.daysRemaining <= 7
                                      ? "text-amber-600 font-medium"
                                      : ""
                                  }
                                >
                                  {org.daysRemaining} days
                                </span>
                              ) : (
                                <span className="text-muted-foreground">—</span>
                              )}
                            </TableCell>
                            <TableCell className="text-right">
                              <Button
                                size="sm"
                                onClick={() => handleAddSubscription(org)}
                              >
                                <CalendarPlus className="h-4 w-4 mr-1" />
                                {org.subscriptionStatus === "active" ? "Extend" : "Add"}
                              </Button>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </ScrollArea>
                </div>

                <div className="md:hidden space-y-4">
                  {organizations.map((org) => (
                    <Card key={org.id} className="p-4">
                      <div className="space-y-3">
                        <div className="flex items-start justify-between">
                          <div>
                            <h3 className="font-medium">{org.name}</h3>
                            <p className="text-sm text-muted-foreground">{org.email}</p>
                          </div>
                          <Badge
                            variant={org.subscriptionStatus === "active" ? "default" : "destructive"}
                          >
                            {org.subscriptionStatus === "active" ? "Active" : "Expired"}
                          </Badge>
                        </div>

                        <div className="flex flex-wrap gap-2">
                          <Badge variant="outline" className="capitalize">
                            {org.type.replace("_", " ")}
                          </Badge>
                          {org.currentPlan && (
                            <Badge variant="secondary">{org.currentPlan.name}</Badge>
                          )}
                        </div>

                        <div className="flex items-center justify-between pt-2">
                          <div className="text-sm">
                            {org.subscriptionStatus === "active" ? (
                              <span
                                className={
                                  org.daysRemaining <= 7
                                    ? "text-amber-600 font-medium"
                                    : "text-muted-foreground"
                                }
                              >
                                {org.daysRemaining} days remaining
                              </span>
                            ) : (
                              <span className="text-muted-foreground">No active subscription</span>
                            )}
                          </div>
                          <Button
                            size="sm"
                            onClick={() => handleAddSubscription(org)}
                          >
                            <Plus className="h-4 w-4 mr-1" />
                            {org.subscriptionStatus === "active" ? "Extend" : "Add"}
                          </Button>
                        </div>
                      </div>
                    </Card>
                  ))}
                </div>
              </>
            )}
          </CardContent>
        </Card>
      </div>

      <Dialog open={subscriptionDialogOpen} onOpenChange={setSubscriptionDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              {selectedOrg?.subscriptionStatus === "active" ? "Extend" : "Add"} Subscription
            </DialogTitle>
            <DialogDescription>
              {selectedOrg?.subscriptionStatus === "active"
                ? `Extend subscription for ${selectedOrg?.name}. The new period will start from the current subscription's end date.`
                : `Add a new subscription for ${selectedOrg?.name}.`}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">Organization</label>
              <p className="text-sm text-muted-foreground">{selectedOrg?.name}</p>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">Select Plan</label>
              <Select value={selectedPlanId} onValueChange={setSelectedPlanId}>
                <SelectTrigger>
                  <SelectValue placeholder="Choose a subscription plan" />
                </SelectTrigger>
                <SelectContent>
                  {plans
                    .filter((plan) => plan.isActive && plan.organizationType === selectedOrg?.type)
                    .map((plan) => (
                      <SelectItem key={plan.id} value={plan.id.toString()}>
                        <div className="flex items-center justify-between gap-4">
                          <span>{plan.name}</span>
                          <span className="text-muted-foreground">
                            ${plan.price} / {plan.durationMonths} month{plan.durationMonths > 1 ? "s" : ""}
                          </span>
                        </div>
                      </SelectItem>
                    ))}
                  {plans.filter((plan) => plan.isActive && plan.organizationType === selectedOrg?.type).length === 0 && (
                    <SelectItem value="none" disabled>
                      No plans available for this organization type
                    </SelectItem>
                  )}
                </SelectContent>
              </Select>
            </div>

            {selectedPlanId && (
              <div className="rounded-lg bg-muted p-3">
                {(() => {
                  const plan = plans.find((p) => p.id.toString() === selectedPlanId);
                  return plan ? (
                    <div className="space-y-1">
                      <p className="font-medium">{plan.name}</p>
                      <p className="text-sm text-muted-foreground">{plan.description}</p>
                      <p className="text-sm">
                        Duration: {plan.durationMonths} month{plan.durationMonths > 1 ? "s" : ""}
                      </p>
                      <p className="text-sm font-medium text-primary">
                        Price: ${plan.price}
                      </p>
                    </div>
                  ) : null;
                })()}
              </div>
            )}
          </div>

          <DialogFooter className="flex-col sm:flex-row gap-2">
            <Button
              variant="outline"
              onClick={() => {
                setSubscriptionDialogOpen(false);
                setSelectedOrg(null);
                setSelectedPlanId("");
              }}
            >
              Cancel
            </Button>
            <Button
              onClick={handleConfirmSubscription}
              disabled={!selectedPlanId || addSubscriptionMutation.isPending}
            >
              {addSubscriptionMutation.isPending ? "Adding..." : "Confirm Subscription"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
