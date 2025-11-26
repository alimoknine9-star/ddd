// API routes and WebSocket server from javascript_websocket blueprint
import type { Express } from "express";
import express from "express";
import { createServer, type Server } from "http";
import { WebSocketServer, WebSocket } from "ws";
import multer from "multer";
import path from "path";
import { storage } from "./storage";
import { db } from "./db";
import { 
  insertMenuItemSchema, insertTableSchema, insertUserSchema, insertOrderSchema, 
  insertOrderItemSchema, insertPaymentSchema, insertWaiterCallSchema, insertBillShareSchema, 
  insertReservationSchema, insertDishReviewSchema, insertOrganizationSchema, 
  insertSubscriptionPlanSchema, insertSubscriptionSchema, insertQueueSchema, insertQueueTicketSchema,
  payments, billShares, orders, tables, users, organizations, subscriptions, subscriptionPlans,
  queues, queueTickets
} from "@shared/schema";
import { eq, and, gte, desc, sql } from "drizzle-orm";
import { 
  hashPassword, verifyPassword, authenticateUser, 
  requireAuth, requireSuperAdmin, requireOrgAdmin, requireActiveSubscription,
  getActiveSubscription, checkSubscriptionActive
} from "./auth";
import { z } from "zod";

// Configure multer for file uploads
const upload = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => {
      cb(null, path.join(process.cwd(), "client/public/uploads"));
    },
    filename: (req, file, cb) => {
      const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
      cb(null, file.fieldname + '-' + uniqueSuffix + path.extname(file.originalname));
    }
  }),
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB limit
  fileFilter: (req, file, cb) => {
    const allowedTypes = /jpeg|jpg|png|gif|webp/;
    const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
    const mimetype = allowedTypes.test(file.mimetype);
    if (mimetype && extname) {
      return cb(null, true);
    } else {
      cb(new Error('Only image files are allowed!'));
    }
  }
});

// WebSocket clients tracking
const clients = new Set<WebSocket>();

// Broadcast to all connected clients
function broadcast(message: any) {
  const data = JSON.stringify(message);
  clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(data);
    }
  });
}

export async function registerRoutes(app: Express): Promise<Server> {
  const httpServer = createServer(app);
  
  // Serve static files from attached_assets before Vite middleware
  app.use("/attached_assets", express.static(path.join(process.cwd(), "attached_assets")));

  // WebSocket server on a distinct path to avoid conflicts with Vite HMR
  const wss = new WebSocketServer({ server: httpServer, path: '/ws' });

  wss.on("connection", (ws) => {
    clients.add(ws);
    console.log("WebSocket client connected");

    ws.on("close", () => {
      clients.delete(ws);
      console.log("WebSocket client disconnected");
    });

    ws.on("error", (error) => {
      console.error("WebSocket error:", error);
      clients.delete(ws);
    });
  });

  // ========== AUTHENTICATION ENDPOINTS ==========
  
  // Login endpoint
  app.post("/api/auth/login", async (req, res) => {
    try {
      const { username, password } = req.body;
      
      if (!username || !password) {
        return res.status(400).json({ error: "Username and password are required" });
      }

      const user = await authenticateUser(username, password);
      if (!user) {
        return res.status(401).json({ error: "Invalid credentials" });
      }

      if (!user.isActive) {
        return res.status(403).json({ error: "Account is disabled" });
      }

      // Check subscription for org users
      if (user.globalRole !== "super_admin" && user.organizationId) {
        const hasSubscription = await checkSubscriptionActive(user.organizationId);
        if (!hasSubscription) {
          return res.status(403).json({ 
            error: "Subscription expired",
            code: "SUBSCRIPTION_EXPIRED",
            message: "Your organization's subscription has expired. Please contact the owner to renew."
          });
        }
      }

      // Get organization details if applicable
      let organization = null;
      if (user.organizationId) {
        organization = await db.query.organizations.findFirst({
          where: eq(organizations.id, user.organizationId),
        });
      }

      // Set session
      req.session.userId = user.id;
      req.session.username = user.username;
      req.session.globalRole = user.globalRole;
      req.session.role = user.role;
      req.session.organizationId = user.organizationId;
      req.session.organizationType = organization?.type || null;

      res.json({
        user: {
          id: user.id,
          username: user.username,
          name: user.name,
          globalRole: user.globalRole,
          role: user.role,
          email: user.email,
        },
        organization: organization ? {
          id: organization.id,
          name: organization.name,
          type: organization.type,
          logoUrl: organization.logoUrl,
        } : null,
      });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // Logout endpoint
  app.post("/api/auth/logout", (req, res) => {
    req.session.destroy((err) => {
      if (err) {
        return res.status(500).json({ error: "Failed to logout" });
      }
      res.json({ message: "Logged out successfully" });
    });
  });

  // Get current session
  app.get("/api/auth/session", async (req, res) => {
    if (!req.session?.userId) {
      return res.json({ authenticated: false });
    }

    const user = await db.query.users.findFirst({
      where: eq(users.id, req.session.userId),
    });

    if (!user) {
      return res.json({ authenticated: false });
    }

    let organization = null;
    if (user.organizationId) {
      organization = await db.query.organizations.findFirst({
        where: eq(organizations.id, user.organizationId),
      });
    }

    res.json({
      authenticated: true,
      user: {
        id: user.id,
        username: user.username,
        name: user.name,
        globalRole: user.globalRole,
        role: user.role,
        email: user.email,
      },
      organization: organization ? {
        id: organization.id,
        name: organization.name,
        type: organization.type,
        logoUrl: organization.logoUrl,
      } : null,
    });
  });

  // Register new organization (for new restaurant owners)
  app.post("/api/auth/register", async (req, res) => {
    try {
      const registerSchema = z.object({
        organizationName: z.string().min(2),
        organizationType: z.enum(["restaurant", "queue_business"]),
        email: z.string().email(),
        phone: z.string().optional(),
        username: z.string().min(3),
        password: z.string().min(6),
        name: z.string().min(2),
      });

      const data = registerSchema.parse(req.body);

      // Check if username exists
      const existingUser = await db.query.users.findFirst({
        where: eq(users.username, data.username),
      });
      if (existingUser) {
        return res.status(400).json({ error: "Username already taken" });
      }

      // Create organization
      const slug = data.organizationName.toLowerCase().replace(/[^a-z0-9]/g, "-").replace(/-+/g, "-");
      const [org] = await db.insert(organizations).values({
        name: data.organizationName,
        slug: slug + "-" + Date.now(),
        type: data.organizationType,
        email: data.email,
        phone: data.phone,
        isActive: true,
      }).returning();

      // Create admin user with hashed password
      const hashedPassword = await hashPassword(data.password);
      const [user] = await db.insert(users).values({
        organizationId: org.id,
        username: data.username,
        email: data.email,
        password: hashedPassword,
        globalRole: "org_admin",
        role: "admin",
        name: data.name,
        isActive: true,
      }).returning();

      res.status(201).json({
        message: "Organization registered successfully. Please purchase a subscription to activate your account.",
        organization: { id: org.id, name: org.name, type: org.type },
        user: { id: user.id, username: user.username, name: user.name },
      });
    } catch (error: any) {
      if (error.code === "23505") {
        return res.status(400).json({ error: "Organization or user already exists" });
      }
      res.status(400).json({ error: error.message });
    }
  });

  // ========== SUPER ADMIN ENDPOINTS ==========

  // Get all organizations (Super Admin only)
  app.get("/api/admin/organizations", requireSuperAdmin, async (req, res) => {
    try {
      const orgs = await db.query.organizations.findMany({
        with: {
          subscriptions: {
            with: { plan: true },
            orderBy: desc(subscriptions.endDate),
            limit: 1,
          },
        },
        orderBy: desc(organizations.createdAt),
      });

      const orgsWithStatus = orgs.map(org => {
        const latestSub = org.subscriptions[0];
        const now = new Date();
        const isActive = latestSub && 
          latestSub.status === "active" && 
          new Date(latestSub.endDate) > now;

        return {
          ...org,
          subscriptionStatus: isActive ? "active" : "expired",
          currentPlan: latestSub?.plan || null,
          expiresAt: latestSub?.endDate || null,
          daysRemaining: latestSub && isActive
            ? Math.ceil((new Date(latestSub.endDate).getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
            : 0,
        };
      });

      res.json(orgsWithStatus);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // Get subscription plans (Super Admin)
  app.get("/api/admin/plans", requireSuperAdmin, async (req, res) => {
    try {
      const plans = await db.query.subscriptionPlans.findMany({
        orderBy: [subscriptionPlans.organizationType, subscriptionPlans.durationMonths],
      });
      res.json(plans);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // Create subscription plan (Super Admin)
  app.post("/api/admin/plans", requireSuperAdmin, async (req, res) => {
    try {
      const data = insertSubscriptionPlanSchema.parse(req.body);
      const [plan] = await db.insert(subscriptionPlans).values(data).returning();
      res.status(201).json(plan);
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  // Manually add/extend subscription (Super Admin)
  app.post("/api/admin/subscriptions", requireSuperAdmin, async (req, res) => {
    try {
      const { organizationId, planId, startDate } = req.body;
      
      const plan = await db.query.subscriptionPlans.findFirst({
        where: eq(subscriptionPlans.id, planId),
      });
      
      if (!plan) {
        return res.status(404).json({ error: "Plan not found" });
      }

      const start = startDate ? new Date(startDate) : new Date();
      const end = new Date(start);
      end.setMonth(end.getMonth() + plan.durationMonths);

      const [subscription] = await db.insert(subscriptions).values({
        organizationId,
        planId,
        status: "active",
        startDate: start,
        endDate: end,
        autoRenew: false,
      }).returning();

      broadcast({ type: "subscription_updated", data: { organizationId } });
      res.status(201).json(subscription);
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  // Get all subscriptions (Super Admin)
  app.get("/api/admin/subscriptions", requireSuperAdmin, async (req, res) => {
    try {
      const subs = await db.query.subscriptions.findMany({
        with: {
          organization: true,
          plan: true,
        },
        orderBy: desc(subscriptions.createdAt),
      });
      res.json(subs);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // Get dashboard stats (Super Admin)
  app.get("/api/admin/stats", requireSuperAdmin, async (req, res) => {
    try {
      const now = new Date();
      
      const totalOrgs = await db.select({ count: sql<number>`count(*)` }).from(organizations);
      const activeSubscriptions = await db.select({ count: sql<number>`count(*)` })
        .from(subscriptions)
        .where(and(eq(subscriptions.status, "active"), gte(subscriptions.endDate, now)));
      
      const expiringSoon = await db.select({ count: sql<number>`count(*)` })
        .from(subscriptions)
        .where(and(
          eq(subscriptions.status, "active"),
          gte(subscriptions.endDate, now),
          sql`${subscriptions.endDate} <= ${new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000)}`
        ));

      res.json({
        totalOrganizations: Number(totalOrgs[0]?.count || 0),
        activeSubscriptions: Number(activeSubscriptions[0]?.count || 0),
        expiringSoon: Number(expiringSoon[0]?.count || 0),
      });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // ========== TABLES ENDPOINTS ==========
  app.get("/api/tables", async (req, res) => {
    try {
      const tables = await storage.getTables();
      res.json(tables);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.get("/api/tables/occupied", async (req, res) => {
    try {
      const tables = await storage.getOccupiedTablesWithOrders();
      res.json(tables);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.get("/api/tables/:id", async (req, res) => {
    try {
      const table = await storage.getTableById(parseInt(req.params.id));
      if (!table) {
        return res.status(404).json({ error: "Table not found" });
      }
      res.json(table);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.get("/api/tables/:id/orders", async (req, res) => {
    try {
      const limit = req.query.limit ? parseInt(req.query.limit as string) : undefined;
      const offset = req.query.offset ? parseInt(req.query.offset as string) : undefined;
      const orders = await storage.getOrdersByTableId(parseInt(req.params.id), { limit, offset });
      res.json(orders);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/tables", async (req, res) => {
    try {
      const data = insertTableSchema.parse(req.body);
      const table = await storage.createTable(data);
      broadcast({ type: "table_created", data: table });
      res.status(201).json(table);
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  app.patch("/api/tables/:id", async (req, res) => {
    try {
      const { status } = req.body;
      const table = await storage.updateTableStatus(parseInt(req.params.id), status);
      if (!table) {
        return res.status(404).json({ error: "Table not found" });
      }
      broadcast({ type: "table_updated", data: table });
      res.json(table);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.delete("/api/tables/:id", async (req, res) => {
    try {
      await storage.deleteTable(parseInt(req.params.id));
      broadcast({ type: "table_deleted", data: { id: parseInt(req.params.id) } });
      res.status(204).send();
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // ========== MENU ITEMS ENDPOINTS ==========
  app.get("/api/menu", async (req, res) => {
    try {
      const items = await storage.getMenuItems();
      res.json(items);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/menu", async (req, res) => {
    try {
      const data = insertMenuItemSchema.parse(req.body);
      const item = await storage.createMenuItem(data);
      broadcast({ type: "menu_item_created", data: item });
      res.status(201).json(item);
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  app.patch("/api/menu/:id", async (req, res) => {
    try {
      const item = await storage.updateMenuItem(parseInt(req.params.id), req.body);
      if (!item) {
        return res.status(404).json({ error: "Menu item not found" });
      }
      broadcast({ type: "menu_item_updated", data: item });
      res.json(item);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.delete("/api/menu/:id", async (req, res) => {
    try {
      await storage.deleteMenuItem(parseInt(req.params.id));
      broadcast({ type: "menu_item_deleted", data: { id: parseInt(req.params.id) } });
      res.status(204).send();
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // ========== ORDERS ENDPOINTS ==========
  app.get("/api/orders", async (req, res) => {
    try {
      const orders = await storage.getOrders();
      res.json(orders);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.get("/api/orders/:status", async (req, res) => {
    try {
      const orders = await storage.getOrdersByStatus(req.params.status);
      res.json(orders);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/orders", async (req, res) => {
    try {
      const { tableId, items } = req.body;

      // Create the order
      const order = await storage.createOrder({
        tableId,
        status: "pending",
        total: "0.00",
      });

      // Add order items
      let total = 0;
      for (const item of items) {
        const menuItem = await storage.getMenuItemById(item.menuItemId);
        if (!menuItem) continue;

        await storage.createOrderItem({
          orderId: order.id,
          menuItemId: item.menuItemId,
          quantity: item.quantity,
          notes: item.notes,
          status: "queued",
          price: menuItem.price,
        });

        total += parseFloat(menuItem.price) * item.quantity;
      }

      // Update order total
      await storage.updateOrderTotal(order.id, total.toFixed(2));

      // Update table status to occupied
      await storage.updateTableStatus(tableId, "occupied");

      // Get the complete order with items
      const completeOrder = await storage.getOrderById(order.id);

      broadcast({ type: "order_created", data: completeOrder });
      res.status(201).json(completeOrder);
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  app.patch("/api/orders/:id/confirm", async (req, res) => {
    try {
      const order = await storage.updateOrderStatus(parseInt(req.params.id), "confirmed");
      if (!order) {
        return res.status(404).json({ error: "Order not found" });
      }

      const completeOrder = await storage.getOrderById(order.id);
      broadcast({ type: "order_confirmed", data: completeOrder });
      res.json(completeOrder);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.patch("/api/orders/:orderId/items/:itemId/status", async (req, res) => {
    try {
      const { status } = req.body;
      const item = await storage.updateOrderItemStatus(parseInt(req.params.itemId), status);
      if (!item) {
        return res.status(404).json({ error: "Order item not found" });
      }

      const order = await storage.getOrderById(parseInt(req.params.orderId));
      broadcast({ type: "order_item_status_updated", data: { item, order } });

      if (order && status === "ready") {
        const allReady = order.orderItems.every(
          (i) => i.status === "ready" || i.status === "delivered" || i.status === "cancelled"
        );
        if (allReady) {
          broadcast({ type: "order_ready", data: order });
        }
      }

      res.json(item);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.patch("/api/orders/:orderId/items/:itemId/cancel", async (req, res) => {
    try {
      const item = await storage.getOrderItemById(parseInt(req.params.itemId));
      if (!item) {
        return res.status(404).json({ error: "Order item not found" });
      }

      // Only allow cancellation for queued or pending items
      if (!["queued", "pending"].includes(item.status)) {
        return res.status(400).json({
          error: "Cannot cancel item that is already being prepared or delivered",
        });
      }

      const updatedItem = await storage.updateOrderItemStatus(
        parseInt(req.params.itemId),
        "cancelled"
      );

      // Recalculate order total
      const order = await storage.getOrderById(parseInt(req.params.orderId));
      if (order) {
        const activeItems = order.orderItems.filter((i) => i.status !== "cancelled");
        const total = activeItems.reduce(
          (sum, i) => sum + parseFloat(i.price) * i.quantity,
          0
        );
        await storage.updateOrderTotal(order.id, total.toFixed(2));

        const updatedOrder = await storage.getOrderById(order.id);
        broadcast({ type: "order_item_cancelled", data: updatedOrder });
      }

      res.json(updatedItem);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // ========== PAYMENTS ENDPOINTS ==========
  app.post("/api/payments", async (req, res) => {
    try {
      // Extract split bill flag before schema validation
      const isSplitBill = req.body.isSplitBill === true;
      const { isSplitBill: _, ...paymentData } = req.body;
      
      const data = insertPaymentSchema.parse(paymentData);
      const payment = await storage.createPayment(data);

      // For split bills, don't complete order/free table yet
      // These will be done when all bill shares are marked paid
      if (!isSplitBill) {
        // Mark order as completed
        await storage.updateOrderStatus(data.orderId!, "completed");

        // Mark table as free
        await storage.updateTableStatus(data.tableId!, "free");
      }

      broadcast({
        type: "payment_processed",
        data: {
          payment,
          orderId: data.orderId!,
          tableId: data.tableId!,
          isSplitBill,
        },
      });

      res.status(201).json(payment);
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  app.get("/api/payments/history", async (req, res) => {
    try {
      const payments = await storage.getPaymentHistory();
      res.json(payments);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // ========== USERS ENDPOINTS ==========
  app.get("/api/users", async (req, res) => {
    try {
      const users = await storage.getUsers();
      res.json(users);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/users", async (req, res) => {
    try {
      const data = insertUserSchema.parse(req.body);
      const user = await storage.createUser(data);
      res.status(201).json(user);
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  // ========== WAITER CALLS ENDPOINTS ==========
  app.get("/api/waiter-calls", async (req, res) => {
    try {
      const calls = await storage.getWaiterCalls();
      res.json(calls);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/waiter-calls", async (req, res) => {
    try {
      const data = insertWaiterCallSchema.parse(req.body);
      const call = await storage.createWaiterCall(data);
      broadcast({ type: "waiter_called", data: call });
      res.status(201).json(call);
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  app.patch("/api/waiter-calls/:id/resolve", async (req, res) => {
    try {
      await storage.resolveWaiterCall(parseInt(req.params.id));
      broadcast({ type: "waiter_call_resolved", data: { id: parseInt(req.params.id) } });
      res.status(204).send();
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // ========== BILL SHARES ENDPOINTS ==========
  
  // Create split bill payment with shares atomically using database transaction
  app.post("/api/split-bill", async (req, res) => {
    try {
      const { orderId, tableId, method, shares } = req.body;
      
      // Validate shares array
      if (!Array.isArray(shares) || shares.length === 0) {
        return res.status(400).json({ error: "At least one bill share is required" });
      }
      
      // Use database transaction for atomicity
      const result = await db.transaction(async (tx) => {
        // Fetch the order to get authoritative total
        const [order] = await tx.select()
          .from(orders)
          .where(eq(orders.id, orderId))
          .limit(1);
        
        if (!order) {
          throw new Error("Order not found");
        }
        
        if (order.status !== "confirmed") {
          throw new Error("Order must be confirmed to create split bill");
        }
        
        const authoritativeTotal = parseFloat(order.total);
        
        // Validate each share and enforce business rules
        const validatedShares = shares.map((share: any, index: number) => {
          if (!share.customerName || !share.customerName.trim()) {
            throw new Error(`Share ${index + 1}: Customer name is required`);
          }
          const shareAmount = parseFloat(share.amount);
          if (isNaN(shareAmount) || shareAmount <= 0) {
            throw new Error(`Share ${index + 1}: Amount must be positive`);
          }
          return {
            customerName: share.customerName.trim(),
            amount: share.amount,
          };
        });
        
        // Validate shares sum equals authoritative order total
        const sharesTotal = validatedShares.reduce((sum, s) => sum + parseFloat(s.amount), 0);
        if (Math.abs(sharesTotal - authoritativeTotal) > 0.01) {
          throw new Error(`Shares total ($${sharesTotal.toFixed(2)}) must equal order total ($${authoritativeTotal.toFixed(2)})`);
        }
        
        // Validate payment data with schema using authoritative total
        const paymentData = insertPaymentSchema.parse({
          orderId,
          tableId,
          amount: order.total,
          method,
        });
        
        // Create payment (without completing order/freeing table)
        const [payment] = await tx.insert(payments).values(paymentData).returning();
        
        // Create all bill shares within the same transaction
        const createdShares = [];
        for (const share of validatedShares) {
          const [createdShare] = await tx.insert(billShares).values({
            paymentId: payment.id,
            customerName: share.customerName,
            amount: share.amount,
            paid: false,
          }).returning();
          createdShares.push(createdShare);
        }
        
        return { payment, shares: createdShares };
      });
      
      res.status(201).json(result);
    } catch (error: any) {
      console.error("Split bill transaction failed:", error);
      res.status(400).json({ 
        error: error.message || "Failed to create split bill",
      });
    }
  });
  
  app.post("/api/bill-shares", async (req, res) => {
    try {
      const data = insertBillShareSchema.parse(req.body);
      const share = await storage.createBillShare(data);
      res.status(201).json(share);
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  app.get("/api/bill-shares/payment/:paymentId", async (req, res) => {
    try {
      const shares = await storage.getBillSharesByPaymentId(parseInt(req.params.paymentId));
      res.json(shares);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.patch("/api/bill-shares/:id/paid", async (req, res) => {
    try {
      const shareId = parseInt(req.params.id);
      
      // Use transaction to mark share paid AND complete order/table if all paid
      await db.transaction(async (tx) => {
        // Mark share as paid within transaction
        const [updatedShare] = await tx.update(billShares)
          .set({ paid: true })
          .where(eq(billShares.id, shareId))
          .returning();
        
        if (!updatedShare || !updatedShare.paymentId) {
          throw new Error("Share not found");
        }
        
        // Check if all shares for this payment are now paid
        const allShares = await tx.select()
          .from(billShares)
          .where(eq(billShares.paymentId, updatedShare.paymentId));
        
        const allPaid = allShares.every(s => s.paid);
        
        if (allPaid) {
          // Query payment to get order and table IDs
          const [payment] = await tx.select()
            .from(payments)
            .where(eq(payments.id, updatedShare.paymentId))
            .limit(1);
          
          if (!payment || !payment.orderId || !payment.tableId) {
            throw new Error("Payment not found or missing order/table reference");
          }
          
          // Complete order and free table atomically in same transaction
          await tx.update(orders)
            .set({ status: "completed" })
            .where(eq(orders.id, payment.orderId));
          
          await tx.update(tables)
            .set({ status: "free" })
            .where(eq(tables.id, payment.tableId));
          
          // Broadcast completion event after transaction commits
          broadcast({
            type: "split_bill_completed",
            data: {
              paymentId: updatedShare.paymentId,
              orderId: payment.orderId,
              tableId: payment.tableId,
            },
          });
        }
      });
      
      res.status(200).json({ success: true });
    } catch (error: any) {
      console.error("Failed to update bill share:", error);
      res.status(500).json({
        error: error.message || "Failed to update bill share",
      });
    }
  });

  // ========== RESERVATIONS ENDPOINTS ==========
  app.post("/api/reservations", async (req, res) => {
    try {
      const data = insertReservationSchema.parse(req.body);
      const reservation = await storage.createReservation(data);
      broadcast({ type: "reservation_created", data: reservation });
      res.status(201).json(reservation);
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  app.get("/api/reservations", async (req, res) => {
    try {
      const reservations = await storage.getReservations();
      res.json(reservations);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.get("/api/reservations/date/:date", async (req, res) => {
    try {
      const date = new Date(req.params.date);
      const reservations = await storage.getReservationsByDate(date);
      res.json(reservations);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.patch("/api/reservations/:id/status", async (req, res) => {
    try {
      const { status } = req.body;
      const reservation = await storage.updateReservationStatus(parseInt(req.params.id), status);
      broadcast({ type: "reservation_updated", data: reservation });
      res.json(reservation);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.delete("/api/reservations/:id", async (req, res) => {
    try {
      await storage.deleteReservation(parseInt(req.params.id));
      broadcast({ type: "reservation_deleted", data: { id: parseInt(req.params.id) } });
      res.status(204).send();
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // ========== DISH REVIEWS ENDPOINTS ==========
  app.post("/api/reviews", async (req, res) => {
    try {
      const data = insertDishReviewSchema.parse(req.body);
      const review = await storage.createDishReview(data);
      broadcast({ type: "review_created", data: review });
      res.status(201).json(review);
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  app.get("/api/reviews/:menuItemId", async (req, res) => {
    try {
      const reviews = await storage.getDishReviewsByMenuItemId(parseInt(req.params.menuItemId));
      const avgRating = await storage.getAverageRating(parseInt(req.params.menuItemId));
      res.json({ reviews, averageRating: avgRating });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // ========== ANALYTICS ENDPOINTS ==========
  app.get("/api/analytics/sales", async (req, res) => {
    try {
      const startDate = new Date(req.query.start as string || new Date().setDate(new Date().getDate() - 30));
      const endDate = new Date(req.query.end as string || new Date());
      const analytics = await storage.getSalesAnalytics(startDate, endDate);
      res.json(analytics);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.get("/api/analytics/popular-items", async (req, res) => {
    try {
      const limit = parseInt(req.query.limit as string || "10");
      const items = await storage.getPopularItems(limit);
      res.json(items);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.get("/api/analytics/cancellation-rate", async (req, res) => {
    try {
      const rate = await storage.getCancellationRate();
      res.json({ cancellationRate: rate });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // ========== IMAGE UPLOAD ENDPOINT ==========
  app.post("/api/upload", upload.single('image'), async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ error: "No file uploaded" });
      }
      const imageUrl = `/uploads/${req.file.filename}`;
      res.json({ imageUrl });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  return httpServer;
}
