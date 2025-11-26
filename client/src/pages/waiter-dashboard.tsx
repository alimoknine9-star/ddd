import { useState, useEffect, useRef } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Clock, Users, CheckCircle, XCircle, Bell, Volume2, VolumeX } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { queryClient, apiRequest } from "@/lib/queryClient";
import type { Table, OrderWithItems, WaiterCall } from "@shared/schema";
import { formatDistanceToNow } from "date-fns";

const TABLE_STATUS_CONFIG = {
  free: { label: "Free", variant: "secondary" as const, color: "text-muted-foreground" },
  occupied: { label: "Occupied", variant: "default" as const, color: "text-primary" },
  reserved: { label: "Reserved", variant: "outline" as const, color: "text-accent-foreground" },
};

export default function WaiterDashboard() {
  const { toast } = useToast();
  const [selectedOrder, setSelectedOrder] = useState<OrderWithItems | null>(null);
  const [cancelOrderItem, setCancelOrderItem] = useState<{ orderId: number; itemId: number } | null>(null);
  const [soundEnabled, setSoundEnabled] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const previousCallIdsRef = useRef<Set<number>>(new Set());
  const previousReadyOrdersRef = useRef<Set<number>>(new Set());

  const { data: tables = [] } = useQuery<Table[]>({
    queryKey: ["/api/tables"],
  });

  const { data: pendingOrders = [] } = useQuery<OrderWithItems[]>({
    queryKey: ["/api/orders", "pending"],
  });

  const { data: confirmedOrders = [] } = useQuery<OrderWithItems[]>({
    queryKey: ["/api/orders", "confirmed"],
  });

  const { data: waiterCalls = [] } = useQuery<WaiterCall[]>({
    queryKey: ["/api/waiter-calls"],
  });

  useEffect(() => {
    if (!audioRef.current && soundEnabled) {
      audioRef.current = new Audio();
      audioRef.current.src = "data:audio/wav;base64,UklGRnoGAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQoGAACBhYqFbF1fdJivrJBhNjVgodDbq2EcBj+a2/LDciUFLIHO8tiJNwgZaLvt559NEAxQp+PwtmMcBjiR1/LMeSwFJHfH8N2QQAoUXrTp66hVFApGn+DyvmwhBjqL0fPTgjMGHm7A7+OZSA0PVKvi7q1aGgxDmN/xwG4hBjiJ0fPTgjMGHm7A7+OZSA0PVKvi7q1aGgxDmN/xwG4hBjiJ0fPTgjMGHm7A7+OZSA0PVKvi7q1aGgxDmN/xwG4hBjiJ0fPTgjMGHm7A7+OZSA0PVKvi7q1aGgxDmN/xwG4hBjiJ0fPTgjMGHm7A7+OZSA0PVKvi7q1aGgxDmN/xwG4hBjiJ0fPTgjMGHm7A7+OZSA0PVKvi7q1aGgxDmN/xwG4hBjiJ0fPTgjMGHm7A7+OZSA0PVKvi7q1aGgxDmN/xwG4hBjiJ0fPTgjMGHm7A7+OZSA0PVKvi7q1aGgxDmN/xwG4hBjiJ0fPTgjMGHm7A7+OZSA0PVKvi7q1aGgxDmN/xwG4hBjiJ0fPTgjMGHm7A7+OZSA0PVKvi7q1aGgxDmN/xwG4h";
    }
  }, [soundEnabled]);

  useEffect(() => {
    const unresolvedCalls = waiterCalls.filter((call) => !call.resolved);
    const currentCallIds = new Set(unresolvedCalls.map((call) => call.id));
    
    unresolvedCalls.forEach((call) => {
      if (!previousCallIdsRef.current.has(call.id)) {
        toast({
          title: "New Waiter Call!",
          description: `Table ${call.tableId} needs assistance`,
          variant: "destructive",
        });
        if (soundEnabled && audioRef.current) {
          audioRef.current.play().catch(() => {});
        }
      }
    });
    
    previousCallIdsRef.current = currentCallIds;
  }, [waiterCalls, toast, soundEnabled]);

  useEffect(() => {
    const readyOrders = confirmedOrders.filter((order) =>
      order.orderItems.every(
        (item) =>
          item.status === "ready" ||
          item.status === "delivered" ||
          item.status === "cancelled"
      )
    );

    readyOrders.forEach((order) => {
      if (!previousReadyOrdersRef.current.has(order.id)) {
        toast({
          title: "Order Ready!",
          description: `Table ${order.table.number}'s order is ready for delivery`,
        });
        if (soundEnabled && audioRef.current) {
          audioRef.current.play().catch(() => {});
        }
        previousReadyOrdersRef.current.add(order.id);
      }
    });

    const currentReadyIds = new Set(readyOrders.map((o) => o.id));
    previousReadyOrdersRef.current = currentReadyIds;
  }, [confirmedOrders, toast, soundEnabled]);

  const updateTableMutation = useMutation({
    mutationFn: ({ id, status }: { id: number; status: string }) =>
      apiRequest("PATCH", `/api/tables/${id}`, { status }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/tables"] });
      queryClient.invalidateQueries({ queryKey: ["/api/tables/occupied"] });
      toast({ title: "Table updated successfully" });
    },
  });

  const confirmOrderMutation = useMutation({
    mutationFn: (orderId: number) =>
      apiRequest("PATCH", `/api/orders/${orderId}/confirm`, {}),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/orders"] });
      queryClient.invalidateQueries({ queryKey: ["/api/orders", "pending"] });
      queryClient.invalidateQueries({ queryKey: ["/api/orders", "confirmed"] });
      setSelectedOrder(null);
      toast({
        title: "Order Confirmed",
        description: "Order has been sent to the kitchen.",
      });
    },
  });

  const cancelOrderItemMutation = useMutation({
    mutationFn: ({ orderId, itemId }: { orderId: number; itemId: number }) =>
      apiRequest("PATCH", `/api/orders/${orderId}/items/${itemId}/cancel`, {}),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/orders"] });
      queryClient.invalidateQueries({ queryKey: ["/api/orders", "pending"] });
      queryClient.invalidateQueries({ queryKey: ["/api/orders", "confirmed"] });
      setCancelOrderItem(null);
      toast({
        title: "Item Cancelled",
        description: "The item has been removed from the order.",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Cannot Cancel",
        description: error.message || "Item cannot be cancelled at this stage.",
        variant: "destructive",
      });
    },
  });

  const resolveCallMutation = useMutation({
    mutationFn: (callId: number) =>
      apiRequest("PATCH", `/api/waiter-calls/${callId}/resolve`, {}),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/waiter-calls"] });
      toast({ title: "Call resolved" });
    },
  });

  const unresolvedCalls = waiterCalls.filter((call) => !call.resolved);

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Tables</h1>
          <p className="text-muted-foreground">Manage table status and orders</p>
        </div>
        <div className="flex items-center gap-3">
          <Button
            variant="outline"
            size="icon"
            onClick={() => setSoundEnabled(!soundEnabled)}
            title={soundEnabled ? "Disable sound alerts" : "Enable sound alerts"}
          >
            {soundEnabled ? <Volume2 className="h-4 w-4" /> : <VolumeX className="h-4 w-4" />}
          </Button>
          {unresolvedCalls.length > 0 && (
            <Badge variant="destructive" className="h-10 px-4 text-base">
              <Bell className="h-4 w-4 mr-2" />
              {unresolvedCalls.length} Call{unresolvedCalls.length !== 1 ? "s" : ""}
            </Badge>
          )}
        </div>
      </div>

      {unresolvedCalls.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Bell className="h-5 w-5" />
              Active Waiter Calls
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {unresolvedCalls.map((call) => (
                <div
                  key={call.id}
                  className="flex items-center justify-between p-3 bg-muted rounded-md"
                  data-testid={`waiter-call-${call.id}`}
                >
                  <div>
                    <p className="font-semibold">Table {call.tableId}</p>
                    {call.reason && (
                      <p className="text-sm text-muted-foreground">{call.reason}</p>
                    )}
                    <p className="text-xs text-muted-foreground mt-1">
                      {formatDistanceToNow(new Date(call.createdAt), { addSuffix: true })}
                    </p>
                  </div>
                  <Button
                    variant="outline"
                    onClick={() => resolveCallMutation.mutate(call.id)}
                    data-testid={`button-resolve-call-${call.id}`}
                  >
                    <CheckCircle className="h-4 w-4 mr-2" />
                    Resolve
                  </Button>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {pendingOrders.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Pending Orders ({pendingOrders.length})</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {pendingOrders.map((order) => (
                <Card
                  key={order.id}
                  className="hover-elevate cursor-pointer"
                  onClick={() => setSelectedOrder(order)}
                  data-testid={`card-order-${order.id}`}
                >
                  <CardHeader className="pb-3">
                    <div className="flex items-center justify-between">
                      <CardTitle className="text-lg">Table {order.table.number}</CardTitle>
                      <Badge>Pending</Badge>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-2">
                      <p className="text-sm text-muted-foreground">
                        {order.orderItems.length} item{order.orderItems.length !== 1 ? "s" : ""}
                      </p>
                      <p className="text-sm text-muted-foreground">
                        {formatDistanceToNow(new Date(order.createdAt), { addSuffix: true })}
                      </p>
                      <p className="font-semibold">${parseFloat(order.total).toFixed(2)}</p>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
        {tables.map((table) => {
          const config = TABLE_STATUS_CONFIG[table.status];
          return (
            <Card
              key={table.id}
              className="hover-elevate"
              data-testid={`card-table-${table.id}`}
            >
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle className="text-3xl font-bold">
                    {table.number}
                  </CardTitle>
                  <Badge variant={config.variant}>{config.label}</Badge>
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Users className="h-4 w-4" />
                  <span>Capacity: {table.capacity}</span>
                </div>
                <div className="flex gap-2">
                  <Button
                    variant={table.status === "free" ? "default" : "outline"}
                    size="sm"
                    className="flex-1"
                    onClick={() => updateTableMutation.mutate({ id: table.id, status: "free" })}
                    disabled={updateTableMutation.isPending}
                    data-testid={`button-table-${table.id}-free`}
                  >
                    Free
                  </Button>
                  <Button
                    variant={table.status === "occupied" ? "default" : "outline"}
                    size="sm"
                    className="flex-1"
                    onClick={() => updateTableMutation.mutate({ id: table.id, status: "occupied" })}
                    disabled={updateTableMutation.isPending}
                    data-testid={`button-table-${table.id}-occupied`}
                  >
                    Occupied
                  </Button>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <Dialog open={!!selectedOrder} onOpenChange={() => setSelectedOrder(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>
              Order #{selectedOrder?.id} - Table {selectedOrder?.table.number}
            </DialogTitle>
            <DialogDescription>
              Review and confirm this order to send to the kitchen
            </DialogDescription>
          </DialogHeader>
          {selectedOrder && (
            <ScrollArea className="max-h-96">
              <div className="space-y-3">
                {selectedOrder.orderItems.map((item) => (
                  <Card key={item.id}>
                    <CardContent className="p-4">
                      <div className="flex justify-between items-start">
                        <div className="flex-1">
                          <h4 className="font-semibold">{item.menuItem.name}</h4>
                          <p className="text-sm text-muted-foreground">
                            Quantity: {item.quantity} × ${item.price}
                          </p>
                          {item.notes && (
                            <p className="text-sm text-muted-foreground mt-1">
                              Note: {item.notes}
                            </p>
                          )}
                        </div>
                        <div className="flex items-center gap-2">
                          <Badge>{item.status}</Badge>
                          {item.status === "queued" && (
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() =>
                                setCancelOrderItem({
                                  orderId: selectedOrder.id,
                                  itemId: item.id,
                                })
                              }
                              data-testid={`button-cancel-item-${item.id}`}
                            >
                              <XCircle className="h-4 w-4" />
                            </Button>
                          )}
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </ScrollArea>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setSelectedOrder(null)}>
              Close
            </Button>
            <Button
              onClick={() => selectedOrder && confirmOrderMutation.mutate(selectedOrder.id)}
              disabled={confirmOrderMutation.isPending}
              data-testid="button-confirm-order"
            >
              <CheckCircle className="h-4 w-4 mr-2" />
              Confirm Order
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog
        open={!!cancelOrderItem}
        onOpenChange={() => setCancelOrderItem(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Cancel Order Item?</AlertDialogTitle>
            <AlertDialogDescription>
              This will remove the item from the order. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() =>
                cancelOrderItem && cancelOrderItemMutation.mutate(cancelOrderItem)
              }
              data-testid="button-confirm-cancel-item"
            >
              Confirm Cancellation
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
