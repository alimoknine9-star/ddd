import { useQuery, useMutation } from "@tanstack/react-query";
import { useState, useEffect, useRef } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Clock, ChefHat, Timer, AlertTriangle } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { queryClient, apiRequest } from "@/lib/queryClient";
import type { OrderWithItems, OrderItem } from "@shared/schema";
import { formatDistanceToNow } from "date-fns";

const STATUS_CONFIG = {
  queued: { label: "Queued", variant: "secondary" as const, color: "bg-muted" },
  preparing: { label: "Preparing", variant: "default" as const, color: "bg-primary/10" },
  almost_ready: { label: "Almost Ready", variant: "outline" as const, color: "bg-accent" },
  ready: { label: "Ready", variant: "default" as const, color: "bg-green-500/10" },
  delivered: { label: "Delivered", variant: "secondary" as const, color: "bg-muted" },
  cancelled: { label: "Cancelled", variant: "destructive" as const, color: "bg-destructive/10" },
};

const STATUS_FLOW = {
  queued: "preparing",
  preparing: "almost_ready",
  almost_ready: "ready",
  ready: "delivered",
};

function useKitchenTimer(
  status: string,
  startedPreparingAt: string | null,
  preparationTimeMinutes: number
) {
  const [remainingSeconds, setRemainingSeconds] = useState<number | null>(null);
  const notifiedRef = useRef<Set<string>>(new Set());
  const { toast } = useToast();

  useEffect(() => {
    if (status !== "preparing" || !startedPreparingAt) {
      setRemainingSeconds(null);
      return;
    }

    const calculateRemaining = () => {
      const startTime = new Date(startedPreparingAt).getTime();
      const targetTime = startTime + preparationTimeMinutes * 60 * 1000;
      const now = Date.now();
      const remaining = Math.floor((targetTime - now) / 1000);
      return remaining;
    };

    const updateTimer = () => {
      const remaining = calculateRemaining();
      setRemainingSeconds(remaining);

      const notificationKey = `${startedPreparingAt}-${preparationTimeMinutes}`;
      if (remaining <= 0 && !notifiedRef.current.has(notificationKey)) {
        notifiedRef.current.add(notificationKey);
        toast({
          title: "Timer Expired!",
          description: "A dish has exceeded its preparation time",
          variant: "destructive",
        });
      }
    };

    updateTimer();
    const interval = setInterval(updateTimer, 1000);

    return () => clearInterval(interval);
  }, [status, startedPreparingAt, preparationTimeMinutes, toast]);

  return remainingSeconds;
}

export default function KitchenScreen() {
  const { toast } = useToast();

  const { data: confirmedOrders = [] } = useQuery<OrderWithItems[]>({
    queryKey: ["/api/orders", "confirmed"],
  });

  const updateItemStatusMutation = useMutation({
    mutationFn: ({ orderId, itemId, status }: { orderId: number; itemId: number; status: string }) =>
      apiRequest("PATCH", `/api/orders/${orderId}/items/${itemId}/status`, { status }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/orders"] });
      queryClient.invalidateQueries({ queryKey: ["/api/orders", "pending"] });
      queryClient.invalidateQueries({ queryKey: ["/api/orders", "confirmed"] });
      toast({ title: "Status updated" });
    },
  });

  const allItems = confirmedOrders.flatMap((order) =>
    order.orderItems.map((item) => ({
      ...item,
      orderId: order.id,
      tableNumber: order.table.number,
      orderCreatedAt: order.createdAt,
    }))
  );

  const activeItems = allItems.filter(
    (item) => !["delivered", "cancelled"].includes(item.status)
  );
  const queuedItems = allItems.filter((item) => item.status === "queued");
  const preparingItems = allItems.filter((item) => item.status === "preparing");
  const almostReadyItems = allItems.filter((item) => item.status === "almost_ready");
  const readyItems = allItems.filter((item) => item.status === "ready");

  const handleStatusChange = (orderId: number, itemId: number, currentStatus: string) => {
    const nextStatus = STATUS_FLOW[currentStatus as keyof typeof STATUS_FLOW];
    if (nextStatus) {
      updateItemStatusMutation.mutate({ orderId, itemId, status: nextStatus });
    }
  };

  const TimerDisplay = ({ item }: { item: any }) => {
    const remainingSeconds = useKitchenTimer(
      item.status,
      item.startedPreparingAt,
      item.menuItem.preparationTimeMinutes
    );

    if (remainingSeconds === null) return null;

    const minutes = Math.floor(Math.abs(remainingSeconds) / 60);
    const seconds = Math.abs(remainingSeconds) % 60;
    const isOvertime = remainingSeconds < 0;
    const isWarning = remainingSeconds > 0 && remainingSeconds <= 300;
    const isDanger = remainingSeconds > 0 && remainingSeconds <= 60;

    const timerColor = isOvertime
      ? "text-destructive"
      : isDanger
      ? "text-orange-600 dark:text-orange-400"
      : isWarning
      ? "text-yellow-600 dark:text-yellow-400"
      : "text-primary";

    const bgColor = isOvertime
      ? "bg-destructive/10"
      : isDanger
      ? "bg-orange-500/10"
      : isWarning
      ? "bg-yellow-500/10"
      : "bg-primary/10";

    return (
      <div className={`flex items-center gap-2 p-3 ${bgColor} rounded-md`}>
        <Timer className={`h-5 w-5 ${timerColor}`} />
        <div className="flex-1">
          <p className={`font-bold text-lg ${timerColor}`}>
            {isOvertime && "-"}
            {minutes.toString().padStart(2, "0")}:{seconds.toString().padStart(2, "0")}
          </p>
          <p className="text-xs text-muted-foreground">
            {isOvertime ? "Overtime!" : isDanger ? "Hurry!" : isWarning ? "Almost done" : "On track"}
          </p>
        </div>
        {(isWarning || isDanger || isOvertime) && (
          <AlertTriangle className={`h-5 w-5 ${timerColor}`} />
        )}
      </div>
    );
  };

  const renderOrderItem = (item: any) => {
    const config = STATUS_CONFIG[item.status as keyof typeof STATUS_CONFIG];
    const canAdvance = STATUS_FLOW[item.status as keyof typeof STATUS_FLOW];

    return (
      <Card
        key={item.id}
        className={`${config.color} hover-elevate`}
        data-testid={`card-kitchen-item-${item.id}`}
      >
        <CardHeader className="pb-3">
          <div className="flex items-start justify-between gap-4">
            <div className="flex-1">
              <div className="flex items-center gap-2 mb-1">
                <Badge variant="outline">Table {item.tableNumber}</Badge>
                <Badge variant={config.variant}>{config.label}</Badge>
              </div>
              <CardTitle className="text-lg">{item.menuItem.name}</CardTitle>
            </div>
            <div className="text-right">
              <p className="text-2xl font-bold">×{item.quantity}</p>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          {item.notes && (
            <div className="p-3 bg-background rounded-md border">
              <p className="text-sm font-medium mb-1">Special Instructions:</p>
              <p className="text-sm text-muted-foreground">{item.notes}</p>
            </div>
          )}
          {item.status === "preparing" && <TimerDisplay item={item} />}
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Clock className="h-4 w-4" />
            <span>{formatDistanceToNow(new Date(item.orderCreatedAt), { addSuffix: true })}</span>
          </div>
          {canAdvance && (
            <Button
              className="w-full"
              onClick={() => handleStatusChange(item.orderId, item.id, item.status)}
              disabled={updateItemStatusMutation.isPending}
              data-testid={`button-advance-${item.id}`}
            >
              Mark as {STATUS_CONFIG[canAdvance as keyof typeof STATUS_CONFIG].label}
            </Button>
          )}
        </CardContent>
      </Card>
    );
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-2">
            <ChefHat className="h-8 w-8" />
            Kitchen Order Queue
          </h1>
          <p className="text-muted-foreground">
            {activeItems.length} active order{activeItems.length !== 1 ? "s" : ""}
          </p>
        </div>
      </div>

      <Tabs defaultValue="all" className="w-full">
        <TabsList className="grid w-full grid-cols-5">
          <TabsTrigger value="all" data-testid="tab-all">
            All ({activeItems.length})
          </TabsTrigger>
          <TabsTrigger value="queued" data-testid="tab-queued">
            Queued ({queuedItems.length})
          </TabsTrigger>
          <TabsTrigger value="preparing" data-testid="tab-preparing">
            Preparing ({preparingItems.length})
          </TabsTrigger>
          <TabsTrigger value="almost_ready" data-testid="tab-almost-ready">
            Almost Ready ({almostReadyItems.length})
          </TabsTrigger>
          <TabsTrigger value="ready" data-testid="tab-ready">
            Ready ({readyItems.length})
          </TabsTrigger>
        </TabsList>

        <TabsContent value="all" className="mt-6">
          {activeItems.length === 0 ? (
            <Card>
              <CardContent className="py-12 text-center">
                <ChefHat className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                <p className="text-muted-foreground">No active orders</p>
              </CardContent>
            </Card>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {activeItems.map(renderOrderItem)}
            </div>
          )}
        </TabsContent>

        <TabsContent value="queued" className="mt-6">
          {queuedItems.length === 0 ? (
            <Card>
              <CardContent className="py-12 text-center">
                <p className="text-muted-foreground">No queued items</p>
              </CardContent>
            </Card>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {queuedItems.map(renderOrderItem)}
            </div>
          )}
        </TabsContent>

        <TabsContent value="preparing" className="mt-6">
          {preparingItems.length === 0 ? (
            <Card>
              <CardContent className="py-12 text-center">
                <p className="text-muted-foreground">No items being prepared</p>
              </CardContent>
            </Card>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {preparingItems.map(renderOrderItem)}
            </div>
          )}
        </TabsContent>

        <TabsContent value="almost_ready" className="mt-6">
          {almostReadyItems.length === 0 ? (
            <Card>
              <CardContent className="py-12 text-center">
                <p className="text-muted-foreground">No items almost ready</p>
              </CardContent>
            </Card>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {almostReadyItems.map(renderOrderItem)}
            </div>
          )}
        </TabsContent>

        <TabsContent value="ready" className="mt-6">
          {readyItems.length === 0 ? (
            <Card>
              <CardContent className="py-12 text-center">
                <p className="text-muted-foreground">No items ready</p>
              </CardContent>
            </Card>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {readyItems.map(renderOrderItem)}
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
