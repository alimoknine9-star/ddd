import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Input } from "@/components/ui/input";
import { CreditCard, Banknote, CheckCircle, UserPlus, X } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { queryClient, apiRequest } from "@/lib/queryClient";
import type { TableWithOrders, Payment, BillShare, OrderItem } from "@shared/schema";
import { formatDistanceToNow } from "date-fns";

type BillShareForm = {
  customerName: string;
  selectedItems: number[]; // Array of OrderItem IDs claimed by this customer
};

export default function CashierInterface() {
  const { toast } = useToast();
  const [selectedTable, setSelectedTable] = useState<TableWithOrders | null>(null);
  const [paymentMethod, setPaymentMethod] = useState<"cash" | "card">("cash");
  const [splitBillMode, setSplitBillMode] = useState(false);
  const [billShares, setBillShares] = useState<BillShareForm[]>([{ customerName: "", selectedItems: [] }]);
  const [currentPaymentId, setCurrentPaymentId] = useState<number | null>(null);

  const { data: occupiedTables = [] } = useQuery<TableWithOrders[]>({
    queryKey: ["/api/tables/occupied"],
  });

  const { data: paymentHistory = [] } = useQuery<Payment[]>({
    queryKey: ["/api/payments/history"],
  });

  const processPaymentMutation = useMutation({
    mutationFn: (data: { orderId: number; tableId: number; amount: string; method: string; isSplitBill?: boolean }) =>
      apiRequest("POST", "/api/payments", data),
    onSuccess: (payment: Payment) => {
      if (!splitBillMode) {
        queryClient.invalidateQueries({ queryKey: ["/api/tables"] });
        queryClient.invalidateQueries({ queryKey: ["/api/tables/occupied"] });
        queryClient.invalidateQueries({ queryKey: ["/api/payments/history"] });
        setSelectedTable(null);
        toast({
          title: "Payment Processed",
          description: "Table has been marked as free.",
        });
      }
      // For split bill mode, handleProcessPayment will handle the rest
    },
  });

  const createBillShareMutation = useMutation({
    mutationFn: (data: { paymentId: number; customerName: string; amount: string }) =>
      apiRequest("POST", "/api/bill-shares", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/bill-shares"] });
    },
  });

  const { data: currentBillShares = [] } = useQuery<BillShare[]>({
    queryKey: ["/api/bill-shares/payment", currentPaymentId],
    queryFn: async () => {
      if (!currentPaymentId) return [];
      return apiRequest<BillShare[]>("GET", `/api/bill-shares/payment/${currentPaymentId}`);
    },
    enabled: !!currentPaymentId && splitBillMode,
    refetchInterval: 2000, // Poll every 2 seconds to detect paid shares
  });

  const markSharePaidMutation = useMutation({
    mutationFn: (shareId: number) =>
      apiRequest("PATCH", `/api/bill-shares/${shareId}/paid`, {}),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/bill-shares"] });
    },
  });

  // Check if all shares are paid and reset UI (server handles completion automatically)
  useEffect(() => {
    if (currentPaymentId && currentBillShares.length > 0) {
      const allPaid = currentBillShares.every(share => share.paid);
      if (allPaid) {
        // Server already completed order and freed table when last share was marked paid
        // Just clean up the UI
        queryClient.invalidateQueries({ queryKey: ["/api/tables"] });
        queryClient.invalidateQueries({ queryKey: ["/api/tables/occupied"] });
        queryClient.invalidateQueries({ queryKey: ["/api/payments/history"] });
        setSelectedTable(null);
        setSplitBillMode(false);
        setCurrentPaymentId(null);
        setBillShares([{ customerName: "", selectedItems: [] }]);
        toast({
          title: "All Shares Paid",
          description: "Table has been freed automatically.",
        });
      }
    }
  }, [currentBillShares, currentPaymentId, toast]);

  // Calculate amount for a customer based on their selected items
  const calculateCustomerAmount = (selectedItems: number[], activeOrder: any) => {
    if (!activeOrder) return 0;
    return selectedItems.reduce((sum, itemId) => {
      const item = activeOrder.orderItems.find((oi: OrderItem) => oi.id === itemId);
      if (item && item.status === "delivered") {
        return sum + (parseFloat(item.price) * item.quantity);
      }
      return sum;
    }, 0);
  };

  // Get all claimed item IDs
  const getAllClaimedItemIds = (shares: BillShareForm[]) => {
    const claimed = new Set<number>();
    shares.forEach(share => {
      share.selectedItems.forEach(itemId => claimed.add(itemId));
    });
    return claimed;
  };

  const handleProcessPayment = async () => {
    if (!selectedTable) return;

    const activeOrder = selectedTable.orders.find((o) => o.status === "confirmed");
    if (!activeOrder) {
      toast({
        title: "No Active Order",
        description: "This table has no order to process.",
        variant: "destructive",
      });
      return;
    }

    if (splitBillMode) {
      // Validate all customers have names
      if (billShares.some(share => !share.customerName.trim())) {
        toast({
          title: "Missing Names",
          description: "All customers must have names",
          variant: "destructive",
        });
        return;
      }

      // Get delivered items
      const deliveredItems = activeOrder.orderItems.filter((item: OrderItem) => item.status === "delivered");
      
      // Validate all delivered items are claimed
      const allClaimedItemIds = getAllClaimedItemIds(billShares);
      const unclaimedItems = deliveredItems.filter((item: OrderItem) => !allClaimedItemIds.has(item.id));
      
      if (unclaimedItems.length > 0) {
        toast({
          title: "Unclaimed Items",
          description: "All delivered items must be assigned to a customer",
          variant: "destructive",
        });
        return;
      }

      // Calculate shares with amounts
      const sharesSnapshot = billShares
        .filter(share => share.selectedItems.length > 0) // Only include customers with items
        .map(share => ({
          customerName: share.customerName,
          amount: calculateCustomerAmount(share.selectedItems, activeOrder).toFixed(2),
        }));

      if (sharesSnapshot.length === 0) {
        toast({
          title: "No Shares",
          description: "At least one customer must have items",
          variant: "destructive",
        });
        return;
      }

      // Validate totals match
      const totalShares = sharesSnapshot.reduce((sum, share) => sum + parseFloat(share.amount), 0);
      const orderTotal = parseFloat(activeOrder.total);
      
      if (Math.abs(totalShares - orderTotal) > 0.01) {
        toast({
          title: "Invalid Split",
          description: `Split amounts ($${totalShares.toFixed(2)}) must equal order total ($${orderTotal.toFixed(2)})`,
          variant: "destructive",
        });
        return;
      }

      try {
        // Use atomic server endpoint to create payment + shares together
        const response = await apiRequest<{ payment: Payment; shares: BillShare[] }>(
          "POST",
          "/api/split-bill",
          {
            orderId: activeOrder.id,
            tableId: selectedTable.id,
            amount: activeOrder.total,
            method: paymentMethod,
            shares: sharesSnapshot,
          }
        );

        // Set currentPaymentId to show tracking UI
        setCurrentPaymentId(response.payment.id);
        
        toast({
          title: "Split Bill Created",
          description: "Mark each share as paid. Table will free automatically when all paid.",
        });
      } catch (error) {
        // On any error, show message and keep dialog open for retry
        toast({
          title: "Split Bill Error",
          description: "Failed to process split bill. Please try again.",
          variant: "destructive",
        });
      }
    } else {
      // Non-split bill mode
      processPaymentMutation.mutate({
        orderId: activeOrder.id,
        tableId: selectedTable.id,
        amount: activeOrder.total,
        method: paymentMethod,
      });
    }
  };

  const addBillShare = () => {
    setBillShares([...billShares, { customerName: "", selectedItems: [] }]);
  };

  const removeBillShare = (index: number) => {
    if (billShares.length > 1) {
      setBillShares(billShares.filter((_, i) => i !== index));
    }
  };

  const updateCustomerName = (index: number, name: string) => {
    const updated = [...billShares];
    updated[index].customerName = name;
    setBillShares(updated);
  };

  const toggleItemForCustomer = (shareIndex: number, itemId: number) => {
    const updated = [...billShares];
    const itemIndex = updated[shareIndex].selectedItems.indexOf(itemId);
    
    if (itemIndex >= 0) {
      // Remove item
      updated[shareIndex].selectedItems.splice(itemIndex, 1);
    } else {
      // Add item (remove from other customers first)
      updated.forEach((share, idx) => {
        const idx2 = share.selectedItems.indexOf(itemId);
        if (idx2 >= 0) {
          share.selectedItems.splice(idx2, 1);
        }
      });
      updated[shareIndex].selectedItems.push(itemId);
    }
    
    setBillShares(updated);
  };

  const calculateTableTotal = (table: TableWithOrders) => {
    const activeOrder = table.orders.find((o) => o.status === "confirmed");
    return activeOrder ? parseFloat(activeOrder.total) : 0;
  };

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Payment Processing</h1>
        <p className="text-muted-foreground">Process payments and close tables</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Open Tables ({occupiedTables.length})</CardTitle>
            </CardHeader>
            <CardContent>
              {occupiedTables.length === 0 ? (
                <div className="py-12 text-center">
                  <p className="text-muted-foreground">No tables waiting for payment</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {occupiedTables.map((table) => {
                    const total = calculateTableTotal(table);
                    const activeOrder = table.orders.find((o) => o.status === "confirmed");

                    return (
                      <Card
                        key={table.id}
                        className="hover-elevate cursor-pointer"
                        onClick={() => setSelectedTable(table)}
                        data-testid={`card-table-${table.id}`}
                      >
                        <CardHeader className="pb-3">
                          <div className="flex items-center justify-between">
                            <CardTitle className="text-2xl">Table {table.number}</CardTitle>
                            <Badge>Occupied</Badge>
                          </div>
                        </CardHeader>
                        <CardContent>
                          {activeOrder ? (
                            <>
                              <p className="text-sm text-muted-foreground mb-2">
                                {activeOrder.orderItems.length} item{activeOrder.orderItems.length !== 1 ? "s" : ""}
                              </p>
                              <p className="text-2xl font-bold">${total.toFixed(2)}</p>
                              <p className="text-xs text-muted-foreground mt-1">
                                {formatDistanceToNow(new Date(activeOrder.createdAt), {
                                  addSuffix: true,
                                })}
                              </p>
                            </>
                          ) : (
                            <p className="text-sm text-muted-foreground">No active order</p>
                          )}
                        </CardContent>
                        <CardFooter>
                          <Button 
                            className="w-full" 
                            data-testid={`button-pay-${table.id}`}
                            onClick={() => setSelectedTable(table)}
                          >
                            Process Payment
                          </Button>
                        </CardFooter>
                      </Card>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        <div>
          <Card>
            <CardHeader>
              <CardTitle>Recent Payments</CardTitle>
            </CardHeader>
            <CardContent>
              <ScrollArea className="h-96">
                {paymentHistory.length === 0 ? (
                  <div className="py-12 text-center">
                    <p className="text-muted-foreground">No payment history</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {paymentHistory.slice(0, 20).map((payment) => (
                      <Card key={payment.id}>
                        <CardContent className="p-4">
                          <div className="flex items-start justify-between">
                            <div>
                              <p className="font-semibold">Table {payment.tableId}</p>
                              <p className="text-sm text-muted-foreground">
                                {payment.method === "cash" ? (
                                  <Banknote className="h-3 w-3 inline mr-1" />
                                ) : (
                                  <CreditCard className="h-3 w-3 inline mr-1" />
                                )}
                                {payment.method.toUpperCase()}
                              </p>
                              <p className="text-xs text-muted-foreground mt-1">
                                {formatDistanceToNow(new Date(payment.createdAt), {
                                  addSuffix: true,
                                })}
                              </p>
                            </div>
                            <p className="font-bold">${parseFloat(payment.amount).toFixed(2)}</p>
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                )}
              </ScrollArea>
            </CardContent>
          </Card>
        </div>
      </div>

      <Dialog open={!!selectedTable} onOpenChange={() => setSelectedTable(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Process Payment - Table {selectedTable?.number}</DialogTitle>
            <DialogDescription>Review order and complete payment</DialogDescription>
          </DialogHeader>

          {selectedTable && (() => {
            const activeOrder = selectedTable.orders.find((o) => o.status === "confirmed");
            if (!activeOrder) {
              return (
                <div className="py-12 text-center">
                  <p className="text-muted-foreground">No active order for this table</p>
                </div>
              );
            }

            const deliveredItems = activeOrder.orderItems.filter(
              (item) => item.status === "delivered"
            );
            const cancelledItems = activeOrder.orderItems.filter(
              (item) => item.status === "cancelled"
            );

            return (
              <>
                <ScrollArea className="max-h-96">
                  <div className="space-y-3">
                    <div>
                      <h4 className="font-semibold mb-2">Order Items</h4>
                      {deliveredItems.map((item) => (
                        <div
                          key={item.id}
                          className="flex justify-between items-center py-2"
                        >
                          <div className="flex-1">
                            <p className="font-medium">{item.menuItem.name}</p>
                            <p className="text-sm text-muted-foreground">
                              {item.quantity} × ${item.price}
                            </p>
                          </div>
                          <p className="font-semibold">
                            ${(parseFloat(item.price) * item.quantity).toFixed(2)}
                          </p>
                        </div>
                      ))}
                    </div>

                    {cancelledItems.length > 0 && (
                      <div>
                        <h4 className="font-semibold mb-2 text-muted-foreground">
                          Cancelled Items
                        </h4>
                        {cancelledItems.map((item) => (
                          <div
                            key={item.id}
                            className="flex justify-between items-center py-2 line-through text-muted-foreground"
                          >
                            <div className="flex-1">
                              <p>{item.menuItem.name}</p>
                              <p className="text-sm">
                                {item.quantity} × ${item.price}
                              </p>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}

                    <Separator />

                    <div className="space-y-2">
                      <div className="flex justify-between text-lg font-bold">
                        <span>Total</span>
                        <span data-testid="text-payment-total">
                          ${parseFloat(activeOrder.total).toFixed(2)}
                        </span>
                      </div>
                    </div>

                    <Separator />

                    {!splitBillMode && !currentPaymentId && (
                      <Button
                        variant="outline"
                        className="w-full"
                        onClick={() => setSplitBillMode(true)}
                        data-testid="button-split-bill"
                      >
                        <UserPlus className="h-4 w-4 mr-2" />
                        Split Bill
                      </Button>
                    )}

                    {splitBillMode && !currentPaymentId && (
                      <div className="space-y-3">
                        <div className="flex items-center justify-between">
                          <h4 className="font-semibold">Split Bill by Items</h4>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => {
                              setSplitBillMode(false);
                              setBillShares([{ customerName: "", selectedItems: [] }]);
                            }}
                          >
                            Cancel Split
                          </Button>
                        </div>

                        {/* Customer List */}
                        {billShares.map((share, shareIndex) => {
                          const customerAmount = calculateCustomerAmount(share.selectedItems, activeOrder);
                          return (
                            <div key={shareIndex} className="border rounded-md p-3 space-y-2">
                              <div className="flex gap-2 items-center">
                                <Input
                                  placeholder="Customer Name"
                                  value={share.customerName}
                                  onChange={(e) => updateCustomerName(shareIndex, e.target.value)}
                                  data-testid={`input-share-name-${shareIndex}`}
                                  className="flex-1"
                                />
                                {billShares.length > 1 && (
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    onClick={() => removeBillShare(shareIndex)}
                                    data-testid={`button-remove-share-${shareIndex}`}
                                  >
                                    <X className="h-4 w-4" />
                                  </Button>
                                )}
                              </div>
                              <div className="text-sm bg-muted p-2 rounded">
                                <p className="font-medium">Amount: ${customerAmount.toFixed(2)}</p>
                              </div>
                              <div className="space-y-1">
                                <p className="text-xs font-semibold text-muted-foreground">Click items to assign:</p>
                                {deliveredItems.map((item) => {
                                  const isSelected = share.selectedItems.includes(item.id);
                                  const isClaimed = billShares.some((s, idx) => idx !== shareIndex && s.selectedItems.includes(item.id));
                                  return (
                                    <button
                                      key={item.id}
                                      onClick={() => toggleItemForCustomer(shareIndex, item.id)}
                                      disabled={isClaimed && !isSelected}
                                      className={`w-full text-left p-2 rounded border text-sm transition ${
                                        isSelected
                                          ? "bg-blue-100 border-blue-300 text-blue-900"
                                          : isClaimed
                                          ? "bg-gray-100 border-gray-300 text-gray-500 cursor-not-allowed"
                                          : "hover:bg-gray-50 border-gray-200"
                                      }`}
                                      data-testid={`item-${item.id}-for-share-${shareIndex}`}
                                    >
                                      <div className="flex justify-between items-center">
                                        <span>{item.menuItem.name} ×{item.quantity}</span>
                                        <span className="font-semibold">${(parseFloat(item.price) * item.quantity).toFixed(2)}</span>
                                      </div>
                                    </button>
                                  );
                                })}
                              </div>
                            </div>
                          );
                        })}

                        <Button
                          variant="outline"
                          className="w-full"
                          onClick={addBillShare}
                          data-testid="button-add-share"
                        >
                          <UserPlus className="h-4 w-4 mr-2" />
                          Add Another Person
                        </Button>
                      </div>
                    )}

                    {currentPaymentId && currentBillShares.length > 0 && (
                      <div className="space-y-3">
                        <h4 className="font-semibold">Bill Shares</h4>
                        {currentBillShares.map((share) => (
                          <div
                            key={share.id}
                            className="flex items-center justify-between p-3 border rounded-md"
                            data-testid={`share-${share.id}`}
                          >
                            <div>
                              <p className="font-medium">{share.customerName}</p>
                              <p className="text-sm text-muted-foreground">${parseFloat(share.amount).toFixed(2)}</p>
                            </div>
                            {share.paid ? (
                              <Badge variant="default">Paid</Badge>
                            ) : (
                              <Button
                                size="sm"
                                onClick={() => markSharePaidMutation.mutate(share.id)}
                                data-testid={`button-mark-paid-${share.id}`}
                              >
                                Mark Paid
                              </Button>
                            )}
                          </div>
                        ))}
                      </div>
                    )}

                    {!currentPaymentId && (
                      <>
                        <Separator />
                        <div>
                          <h4 className="font-semibold mb-3">Payment Method</h4>
                          <RadioGroup value={paymentMethod} onValueChange={(v: any) => setPaymentMethod(v)}>
                            <div className="flex items-center space-x-2 p-4 border rounded-md hover-elevate">
                              <RadioGroupItem value="cash" id="cash" data-testid="radio-cash" />
                              <Label htmlFor="cash" className="flex items-center gap-2 flex-1 cursor-pointer">
                                <Banknote className="h-5 w-5" />
                                Cash
                              </Label>
                            </div>
                            <div className="flex items-center space-x-2 p-4 border rounded-md hover-elevate">
                              <RadioGroupItem value="card" id="card" data-testid="radio-card" />
                              <Label htmlFor="card" className="flex items-center gap-2 flex-1 cursor-pointer">
                                <CreditCard className="h-5 w-5" />
                                Card
                              </Label>
                            </div>
                          </RadioGroup>
                        </div>
                      </>
                    )}
                  </div>
                </ScrollArea>

                <DialogFooter>
                  <Button variant="outline" onClick={() => {
                    setSelectedTable(null);
                    setSplitBillMode(false);
                    setCurrentPaymentId(null);
                    setBillShares([{ customerName: "", selectedItems: [] }]);
                  }}>
                    {currentPaymentId ? "Close" : "Cancel"}
                  </Button>
                  {!currentPaymentId && (
                    <Button
                      onClick={handleProcessPayment}
                      disabled={processPaymentMutation.isPending}
                      data-testid="button-process-payment"
                    >
                      <CheckCircle className="h-4 w-4 mr-2" />
                      {splitBillMode ? "Create Split Bill" : "Process Payment"}
                    </Button>
                  )}
                </DialogFooter>
              </>
            );
          })()}
        </DialogContent>
      </Dialog>
    </div>
  );
}
