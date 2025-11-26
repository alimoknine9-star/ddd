import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Plus, Minus, ShoppingCart, Phone, X, Star, MessageSquare, ChevronDown, Clock } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { queryClient, apiRequest } from "@/lib/queryClient";
import type { MenuItem, DishReview, OrderWithItems } from "@shared/schema";
import { useLocation, useSearch } from "wouter";
import { formatDistanceToNow } from "date-fns";

type CartItem = {
  menuItem: MenuItem;
  quantity: number;
  notes?: string;
};

const CATEGORY_LABELS = {
  appetizers: "Appetizers",
  mains: "Mains",
  drinks: "Drinks",
  desserts: "Desserts",
  specials: "Chef's Specials",
};

export default function CustomerMenu() {
  const [, navigate] = useLocation();
  const searchParams = useSearch();
  const tableId = new URLSearchParams(searchParams).get("table");
  const { toast } = useToast();
  
  const [cart, setCart] = useState<CartItem[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [cartOpen, setCartOpen] = useState(false);
  const [itemNotes, setItemNotes] = useState<Record<number, string>>({});
  const [reviewDialogOpen, setReviewDialogOpen] = useState(false);
  const [selectedItemForReview, setSelectedItemForReview] = useState<MenuItem | null>(null);
  const [rating, setRating] = useState(0);
  const [reviewComment, setReviewComment] = useState("");
  const [customerName, setCustomerName] = useState("");

  const { data: menuItems = [], isLoading } = useQuery<MenuItem[]>({
    queryKey: ["/api/menu"],
  });

  const { data: tableData } = useQuery<{ number: number }>({
    queryKey: ["/api/tables", tableId],
    enabled: !!tableId,
  });

  const { data: orderHistory = [] } = useQuery<OrderWithItems[]>({
    queryKey: ["/api/tables", tableId, "orders"],
    queryFn: async () => {
      if (!tableId) return [];
      return apiRequest<OrderWithItems[]>("GET", `/api/tables/${tableId}/orders?limit=5`);
    },
    enabled: !!tableId,
  });

  const submitOrderMutation = useMutation({
    mutationFn: (data: { tableId: number; items: Array<{ menuItemId: number; quantity: number; notes?: string }> }) =>
      apiRequest("POST", "/api/orders", data),
    onSuccess: () => {
      toast({
        title: "Order Submitted",
        description: "Your order has been sent to the waiter for confirmation.",
      });
      setCart([]);
      setItemNotes({});
      setCartOpen(false);
      queryClient.invalidateQueries({ queryKey: ["/api/orders"] });
      queryClient.invalidateQueries({ queryKey: ["/api/orders", "pending"] });
      queryClient.invalidateQueries({ queryKey: ["/api/orders", "confirmed"] });
    },
  });

  const callWaiterMutation = useMutation({
    mutationFn: (data: { tableId: number; reason?: string }) =>
      apiRequest("POST", "/api/waiter-calls", data),
    onSuccess: () => {
      toast({
        title: "Waiter Called",
        description: "A waiter will be with you shortly.",
      });
    },
  });

  const submitReviewMutation = useMutation({
    mutationFn: (data: { menuItemId: number; rating: number; comment?: string; customerName?: string }) =>
      apiRequest("POST", "/api/reviews", data),
    onSuccess: () => {
      toast({
        title: "Review Submitted",
        description: "Thank you for your feedback!",
      });
      setReviewDialogOpen(false);
      setSelectedItemForReview(null);
      setRating(0);
      setReviewComment("");
      setCustomerName("");
      queryClient.invalidateQueries({ queryKey: ["/api/reviews"] });
    },
  });

  const handleSubmitReview = () => {
    if (!selectedItemForReview || rating === 0) {
      toast({
        title: "Rating Required",
        description: "Please select a rating",
        variant: "destructive",
      });
      return;
    }

    submitReviewMutation.mutate({
      menuItemId: selectedItemForReview.id,
      rating,
      comment: reviewComment || undefined,
      customerName: customerName || undefined,
    });
  };

  // Reviews feature disabled to fix React hooks violation
  // (useQuery was being called inside a map function)
  const getItemRating = (menuItemId: number) => {
    return { data: null };
  };

  const addToCart = (menuItem: MenuItem) => {
    setCart((prev) => {
      const existing = prev.find((item) => item.menuItem.id === menuItem.id);
      if (existing) {
        return prev.map((item) =>
          item.menuItem.id === menuItem.id
            ? { ...item, quantity: item.quantity + 1 }
            : item
        );
      }
      return [...prev, { menuItem, quantity: 1 }];
    });
  };

  const updateQuantity = (menuItemId: number, delta: number) => {
    setCart((prev) =>
      prev
        .map((item) =>
          item.menuItem.id === menuItemId
            ? { ...item, quantity: item.quantity + delta }
            : item
        )
        .filter((item) => item.quantity > 0)
    );
  };

  const removeFromCart = (menuItemId: number) => {
    setCart((prev) => prev.filter((item) => item.menuItem.id !== menuItemId));
    setItemNotes((prev) => {
      const { [menuItemId]: _, ...rest } = prev;
      return rest;
    });
  };

  const handleSubmitOrder = () => {
    if (!tableId) {
      toast({
        title: "Error",
        description: "Table information is missing.",
        variant: "destructive",
      });
      return;
    }

    submitOrderMutation.mutate({
      tableId: parseInt(tableId),
      items: cart.map((item) => ({
        menuItemId: item.menuItem.id,
        quantity: item.quantity,
        notes: itemNotes[item.menuItem.id],
      })),
    });
  };

  const cartTotal = cart.reduce(
    (sum, item) => sum + parseFloat(item.menuItem.price) * item.quantity,
    0
  );

  const cartItemCount = cart.reduce((sum, item) => sum + item.quantity, 0);

  const categories = Array.from(new Set(menuItems.map((item) => item.category)));
  const filteredItems = selectedCategory
    ? menuItems.filter((item) => item.category === selectedCategory)
    : menuItems;

  if (!tableId) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-6">
        <Card className="max-w-md w-full">
          <CardContent className="pt-6">
            <p className="text-center text-muted-foreground">
              Please scan a valid QR code from your table.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background font-serif">
      <div className="sticky top-0 z-50 bg-card border-b">
        <div className="flex items-center justify-between p-4">
          <div>
            <h1 className="text-xl font-bold" data-testid="text-restaurant-name">
              Restaurant Menu
            </h1>
            <p className="text-sm text-muted-foreground" data-testid="text-table-number">
              Table {tableData?.number || tableId}
            </p>
          </div>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="icon"
              onClick={() => callWaiterMutation.mutate({ tableId: parseInt(tableId) })}
              data-testid="button-call-waiter"
            >
              <Phone className="h-5 w-5" />
            </Button>
            <Sheet open={cartOpen} onOpenChange={setCartOpen}>
              <SheetTrigger asChild>
                <Button className="relative" data-testid="button-open-cart">
                  <ShoppingCart className="h-5 w-5 mr-2" />
                  Cart
                  {cartItemCount > 0 && (
                    <Badge
                      className="absolute -top-2 -right-2 h-6 w-6 flex items-center justify-center p-0"
                      data-testid="badge-cart-count"
                    >
                      {cartItemCount}
                    </Badge>
                  )}
                </Button>
              </SheetTrigger>
              <SheetContent className="w-full sm:max-w-lg flex flex-col h-full">
                <SheetHeader className="flex-shrink-0">
                  <SheetTitle>Your Order</SheetTitle>
                </SheetHeader>
                <div className="flex flex-col flex-1 mt-6 min-h-0">
                  {cart.length === 0 ? (
                    <div className="flex-1 flex items-center justify-center">
                      <p className="text-muted-foreground">Your cart is empty</p>
                    </div>
                  ) : (
                    <>
                      <ScrollArea className="flex-1 -mx-6 px-6 overflow-y-auto">
                        <div className="space-y-4">
                          {cart.map((item) => (
                            <Card key={item.menuItem.id}>
                              <CardContent className="p-4">
                                <div className="flex justify-between items-start gap-4">
                                  <div className="flex-1">
                                    <h4 className="font-semibold">{item.menuItem.name}</h4>
                                    <p className="text-sm text-muted-foreground">
                                      ${item.menuItem.price} each
                                    </p>
                                  </div>
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    onClick={() => removeFromCart(item.menuItem.id)}
                                    data-testid={`button-remove-${item.menuItem.id}`}
                                  >
                                    <X className="h-4 w-4" />
                                  </Button>
                                </div>
                                <div className="flex items-center gap-2 mt-3">
                                  <Button
                                    variant="outline"
                                    size="icon"
                                    onClick={() => updateQuantity(item.menuItem.id, -1)}
                                    data-testid={`button-decrease-${item.menuItem.id}`}
                                  >
                                    <Minus className="h-4 w-4" />
                                  </Button>
                                  <span
                                    className="w-12 text-center font-semibold"
                                    data-testid={`text-quantity-${item.menuItem.id}`}
                                  >
                                    {item.quantity}
                                  </span>
                                  <Button
                                    variant="outline"
                                    size="icon"
                                    onClick={() => updateQuantity(item.menuItem.id, 1)}
                                    data-testid={`button-increase-${item.menuItem.id}`}
                                  >
                                    <Plus className="h-4 w-4" />
                                  </Button>
                                </div>
                                <Textarea
                                  placeholder="Special instructions (optional)"
                                  value={itemNotes[item.menuItem.id] || ""}
                                  onChange={(e) =>
                                    setItemNotes((prev) => ({
                                      ...prev,
                                      [item.menuItem.id]: e.target.value,
                                    }))
                                  }
                                  className="mt-3"
                                  rows={2}
                                  data-testid={`input-notes-${item.menuItem.id}`}
                                />
                              </CardContent>
                            </Card>
                          ))}
                        </div>
                      </ScrollArea>
                      <div className="mt-6 space-y-4 flex-shrink-0">
                        <Separator />
                        <div className="flex justify-between items-center text-lg font-bold">
                          <span>Total</span>
                          <span data-testid="text-cart-total">${cartTotal.toFixed(2)}</span>
                        </div>
                        <Button
                          className="w-full"
                          size="lg"
                          onClick={handleSubmitOrder}
                          disabled={submitOrderMutation.isPending}
                          data-testid="button-submit-order"
                        >
                          Submit Order
                        </Button>
                        <Button
                          variant="outline"
                          className="w-full"
                          onClick={() => {
                            callWaiterMutation.mutate({ tableId: parseInt(tableId), reason: "Request for bill" });
                            setCartOpen(false);
                          }}
                          data-testid="button-request-bill"
                        >
                          Request Bill
                        </Button>
                      </div>
                    </>
                  )}
                </div>
              </SheetContent>
            </Sheet>
          </div>
        </div>

        <ScrollArea className="w-full whitespace-nowrap border-t">
          <div className="flex gap-2 p-4">
            <Button
              variant={selectedCategory === null ? "default" : "outline"}
              onClick={() => setSelectedCategory(null)}
              data-testid="button-category-all"
            >
              All
            </Button>
            {categories.map((category) => (
              <Button
                key={category}
                variant={selectedCategory === category ? "default" : "outline"}
                onClick={() => setSelectedCategory(category)}
                data-testid={`button-category-${category}`}
              >
                {CATEGORY_LABELS[category as keyof typeof CATEGORY_LABELS] || category}
              </Button>
            ))}
          </div>
        </ScrollArea>
      </div>

      <div className="p-4 space-y-6">
        {orderHistory.length > 0 && (
          <Collapsible>
            <CollapsibleTrigger asChild>
              <Button variant="outline" className="w-full flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Clock className="h-4 w-4" />
                  <span>Recent Orders ({orderHistory.length})</span>
                </div>
                <ChevronDown className="h-4 w-4" />
              </Button>
            </CollapsibleTrigger>
            <CollapsibleContent className="mt-4">
              <div className="space-y-3">
                {orderHistory.map((order) => (
                  <Card key={order.id}>
                    <CardHeader className="pb-3">
                      <div className="flex items-center justify-between">
                        <CardTitle className="text-sm">
                          {formatDistanceToNow(new Date(order.createdAt), { addSuffix: true })}
                        </CardTitle>
                        <Badge variant={order.status === "completed" ? "default" : "secondary"}>
                          {order.status}
                        </Badge>
                      </div>
                    </CardHeader>
                    <CardContent className="space-y-2">
                      {order.orderItems.map((item) => (
                        <div key={item.id} className="flex justify-between text-sm">
                          <span className="text-muted-foreground">
                            {item.quantity}× {item.menuItem.name}
                          </span>
                          <span className="font-medium">
                            ${(parseFloat(item.price) * item.quantity).toFixed(2)}
                          </span>
                        </div>
                      ))}
                      <Separator />
                      <div className="flex justify-between font-semibold">
                        <span>Total</span>
                        <span>${parseFloat(order.total).toFixed(2)}</span>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </CollapsibleContent>
          </Collapsible>
        )}

        {isLoading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {[...Array(6)].map((_, i) => (
              <Card key={i} className="overflow-hidden">
                <div className="aspect-[4/3] bg-muted animate-pulse" />
                <CardContent className="p-4">
                  <div className="h-6 bg-muted rounded animate-pulse mb-2" />
                  <div className="h-4 bg-muted rounded animate-pulse w-2/3" />
                </CardContent>
              </Card>
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {filteredItems.map((item) => {
              const { data: reviewData } = getItemRating(item.id);
              
              return (
                <Card
                  key={item.id}
                  className="overflow-hidden hover-elevate"
                  data-testid={`card-menu-item-${item.id}`}
                >
                  <div className="aspect-[4/3] relative overflow-hidden">
                    <img
                      src={item.imageUrl}
                      alt={item.name}
                      className="w-full h-full object-cover"
                    />
                    {!item.available && (
                      <div className="absolute inset-0 bg-background/80 flex items-center justify-center">
                        <Badge variant="destructive">Out of Stock</Badge>
                      </div>
                    )}
                  </div>
                  <CardContent className="p-4">
                    <div className="flex justify-between items-start mb-2">
                      <h3 className="font-semibold text-lg">{item.name}</h3>
                      <Badge variant="secondary">${item.price}</Badge>
                    </div>
                    <p className="text-sm text-muted-foreground line-clamp-2">
                      {item.description}
                    </p>
                  </CardContent>
                  <CardFooter className="p-4 pt-0 flex gap-2">
                    <Button
                      className="flex-1"
                      onClick={() => addToCart(item)}
                      disabled={!item.available}
                      data-testid={`button-add-${item.id}`}
                    >
                      <Plus className="h-4 w-4 mr-2" />
                      Add to Cart
                    </Button>
                    <Button
                      variant="outline"
                      size="icon"
                      onClick={() => {
                        setSelectedItemForReview(item);
                        setReviewDialogOpen(true);
                      }}
                      data-testid={`button-review-${item.id}`}
                    >
                      <MessageSquare className="h-4 w-4" />
                    </Button>
                  </CardFooter>
                </Card>
              );
            })}
          </div>
        )}
      </div>

      <Dialog open={reviewDialogOpen} onOpenChange={setReviewDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Rate {selectedItemForReview?.name}</DialogTitle>
            <DialogDescription>Share your experience with this dish</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium mb-2 block">Rating</label>
              <div className="flex gap-2">
                {[1, 2, 3, 4, 5].map((star) => (
                  <button
                    key={star}
                    onClick={() => setRating(star)}
                    className="transition-colors"
                    data-testid={`star-${star}`}
                  >
                    <Star
                      className={`h-8 w-8 ${
                        star <= rating
                          ? "fill-yellow-400 text-yellow-400"
                          : "text-gray-300"
                      }`}
                    />
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label className="text-sm font-medium mb-2 block">Your Name (Optional)</label>
              <Input
                value={customerName}
                onChange={(e) => setCustomerName(e.target.value)}
                placeholder="Enter your name"
                data-testid="input-reviewer-name"
              />
            </div>
            <div>
              <label className="text-sm font-medium mb-2 block">Comment (Optional)</label>
              <Textarea
                value={reviewComment}
                onChange={(e) => setReviewComment(e.target.value)}
                placeholder="Tell us about your experience..."
                rows={4}
                data-testid="input-review-comment"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setReviewDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleSubmitReview}
              disabled={submitReviewMutation.isPending || rating === 0}
              data-testid="button-submit-review"
            >
              Submit Review
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
