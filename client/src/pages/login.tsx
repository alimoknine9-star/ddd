import { useState } from "react";
import { useLocation } from "wouter";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { UtensilsCrossed, Shield, Users, Loader2 } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";

interface LoginResponse {
  user: {
    id: number;
    username: string;
    name: string;
    globalRole: "super_admin" | "org_admin" | "org_staff";
    role: "admin" | "waiter" | "kitchen" | "cashier";
    email: string | null;
  };
  organization: { id: number; name: string; type: string; logoUrl: string | null } | null;
}

interface SessionResponse {
  authenticated: boolean;
  user?: LoginResponse["user"];
  organization?: LoginResponse["organization"];
}

export default function Login() {
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");

  const { data: session, isLoading: sessionLoading } = useQuery<SessionResponse>({
    queryKey: ["/api/auth/session"],
    staleTime: 0,
  });

  const loginMutation = useMutation({
    mutationFn: async (data: { username: string; password: string }) => {
      return apiRequest<LoginResponse>("/api/auth/login", {
        method: "POST",
        body: JSON.stringify(data),
        headers: { "Content-Type": "application/json" },
      });
    },
    onSuccess: (data) => {
      toast({ title: "Welcome!", description: `Logged in as ${data.user.name}` });
      if (data.user.globalRole === "super_admin") navigate("/super-admin");
      else if (data.user.globalRole === "org_admin") navigate("/admin");
      else {
        const routes: Record<string, string> = { waiter: "/waiter", kitchen: "/kitchen", cashier: "/cashier", admin: "/admin" };
        navigate(routes[data.user.role] || "/");
      }
    },
    onError: (error: any) => {
      toast({
        title: "Login failed",
        description: error?.error || "Invalid credentials",
        variant: "destructive",
      });
    },
  });

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    loginMutation.mutate({ username, password });
  };

  if (sessionLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (session?.authenticated && session.user) {
    const user = session.user;
    if (user.globalRole === "super_admin") navigate("/super-admin");
    else if (user.globalRole === "org_admin") navigate("/admin");
    else {
      const routes: Record<string, string> = { waiter: "/waiter", kitchen: "/kitchen", cashier: "/cashier", admin: "/admin" };
      navigate(routes[user.role] || "/");
    }
    return null;
  }

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-6">
      <div className="max-w-md w-full space-y-8">
        <div className="text-center">
          <div className="flex items-center justify-center mb-4">
            <div className="h-16 w-16 rounded-lg bg-primary flex items-center justify-center">
              <UtensilsCrossed className="h-10 w-10 text-primary-foreground" />
            </div>
          </div>
          <h1 className="text-3xl font-bold mb-2">Business Platform</h1>
          <p className="text-muted-foreground">Restaurant & Queue Management SaaS</p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Sign In</CardTitle>
            <CardDescription>Enter your credentials to access your account</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleLogin} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="username">Username</Label>
                <Input id="username" type="text" placeholder="Enter your username" value={username} onChange={(e) => setUsername(e.target.value)} required />
              </div>
              <div className="space-y-2">
                <Label htmlFor="password">Password</Label>
                <Input id="password" type="password" placeholder="Enter your password" value={password} onChange={(e) => setPassword(e.target.value)} required />
              </div>
              <Button type="submit" className="w-full" disabled={loginMutation.isPending}>
                {loginMutation.isPending ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Signing in...
                  </>
                ) : (
                  "Sign In"
                )}
              </Button>
            </form>

            <div className="mt-6 p-4 bg-muted rounded-lg">
              <p className="text-sm font-medium mb-2">Demo Accounts:</p>
              <div className="text-xs text-muted-foreground space-y-1">
                <p><Shield className="inline h-3 w-3 mr-1" /> superadmin / superadmin123</p>
                <p><Users className="inline h-3 w-3 mr-1" /> demoadmin / demo123</p>
                <p>Staff: waiter1, kitchen1, cashier1 / staff123</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-muted">
          <CardContent className="pt-6">
            <p className="text-sm text-center text-muted-foreground">
              For customers: Scan the QR code at your table to view the menu and place orders.
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
