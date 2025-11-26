import { useEffect, useRef } from "react";
import { queryClient } from "@/lib/queryClient";

export function useWebSocket() {
  const ws = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const shouldReconnect = useRef(true);

  useEffect(() => {
    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const wsUrl = `${protocol}//${window.location.host}/ws`;

    const handleMessage = (event: MessageEvent) => {
      try {
        const message = JSON.parse(event.data);
        
        // Invalidate relevant queries based on message type
        switch (message.type) {
          case "order_created":
          case "order_confirmed":
          case "order_item_status_updated":
          case "order_item_cancelled":
            // Invalidate all order-related queries explicitly
            queryClient.invalidateQueries({ queryKey: ["/api/orders"] });
            queryClient.invalidateQueries({ queryKey: ["/api/orders", "pending"] });
            queryClient.invalidateQueries({ queryKey: ["/api/orders", "confirmed"] });
            // Invalidate all table-related queries
            queryClient.invalidateQueries({ queryKey: ["/api/tables"] });
            queryClient.invalidateQueries({ queryKey: ["/api/tables/occupied"] });
            break;
          
          case "table_created":
          case "table_updated":
          case "table_deleted":
            // Invalidate all table-related queries
            queryClient.invalidateQueries({ queryKey: ["/api/tables"] });
            queryClient.invalidateQueries({ queryKey: ["/api/tables/occupied"] });
            break;
          
          case "menu_item_created":
          case "menu_item_updated":
          case "menu_item_deleted":
            queryClient.invalidateQueries({ queryKey: ["/api/menu"] });
            break;
          
          case "payment_processed":
            // Invalidate all payment, order, and table queries
            queryClient.invalidateQueries({ queryKey: ["/api/orders"] });
            queryClient.invalidateQueries({ queryKey: ["/api/orders", "pending"] });
            queryClient.invalidateQueries({ queryKey: ["/api/orders", "confirmed"] });
            queryClient.invalidateQueries({ queryKey: ["/api/tables"] });
            queryClient.invalidateQueries({ queryKey: ["/api/tables/occupied"] });
            queryClient.invalidateQueries({ queryKey: ["/api/payments/history"] });
            break;
          
          case "waiter_called":
          case "waiter_call_resolved":
            queryClient.invalidateQueries({ queryKey: ["/api/waiter-calls"] });
            break;

          case "order_ready":
            queryClient.invalidateQueries({ queryKey: ["/api/orders"] });
            queryClient.invalidateQueries({ queryKey: ["/api/orders", "pending"] });
            queryClient.invalidateQueries({ queryKey: ["/api/orders", "confirmed"] });
            queryClient.invalidateQueries({ queryKey: ["/api/tables"] });
            queryClient.invalidateQueries({ queryKey: ["/api/tables/occupied"] });
            break;
        }
      } catch (error) {
        console.error("Failed to parse WebSocket message:", error);
      }
    };

    const connect = () => {
      // Clean up any existing connection
      if (ws.current) {
        ws.current.onclose = null;
        ws.current.close();
      }

      const socket = new WebSocket(wsUrl);
      ws.current = socket;

      socket.onopen = () => {
        console.log("WebSocket connected");
      };

      socket.onmessage = handleMessage;

      socket.onerror = (error) => {
        console.error("WebSocket error:", error);
      };

      socket.onclose = () => {
        console.log("WebSocket disconnected");
        
        // Attempt to reconnect if not intentionally closed
        if (shouldReconnect.current) {
          console.log("Scheduling WebSocket reconnection in 3 seconds...");
          reconnectTimeoutRef.current = setTimeout(() => {
            console.log("Attempting to reconnect WebSocket...");
            connect();
          }, 3000);
        }
      };
    };

    // Initial connection
    connect();

    // Cleanup function
    return () => {
      shouldReconnect.current = false;
      
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
      
      if (ws.current) {
        ws.current.onclose = null;
        ws.current.close();
      }
    };
  }, []);

  return ws.current;
}
