import { sql } from "drizzle-orm";
import { pgTable, text, varchar, integer, decimal, timestamp, pgEnum, boolean, uniqueIndex } from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// ==================== MULTI-TENANT & SUBSCRIPTION ENUMS ====================
export const organizationTypeEnum = pgEnum("organization_type", ["restaurant", "queue_business"]);
export const subscriptionStatusEnum = pgEnum("subscription_status", ["active", "expired", "cancelled", "pending"]);
export const globalUserRoleEnum = pgEnum("global_user_role", ["super_admin", "org_admin", "org_staff"]);

// ==================== ORGANIZATIONS (Multi-tenant) ====================
export const organizations = pgTable("organizations", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(),
  type: organizationTypeEnum("type").notNull().default("restaurant"),
  email: text("email").notNull(),
  phone: text("phone"),
  address: text("address"),
  logoUrl: text("logo_url"),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const organizationsRelations = relations(organizations, ({ many, one }) => ({
  subscriptions: many(subscriptions),
  users: many(users),
  tables: many(tables),
  menuItems: many(menuItems),
  queues: many(queues),
}));

// ==================== SUBSCRIPTION PLANS ====================
export const subscriptionPlans = pgTable("subscription_plans", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  name: text("name").notNull(),
  description: text("description"),
  durationMonths: integer("duration_months").notNull(),
  price: decimal("price", { precision: 10, scale: 2 }).notNull(),
  features: text("features"), // JSON string of features
  organizationType: organizationTypeEnum("organization_type").notNull().default("restaurant"),
  isActive: boolean("is_active").notNull().default(true),
  stripePriceId: text("stripe_price_id"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// ==================== SUBSCRIPTIONS ====================
export const subscriptions = pgTable("subscriptions", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  organizationId: integer("organization_id").notNull().references(() => organizations.id),
  planId: integer("plan_id").notNull().references(() => subscriptionPlans.id),
  status: subscriptionStatusEnum("status").notNull().default("pending"),
  startDate: timestamp("start_date").notNull(),
  endDate: timestamp("end_date").notNull(),
  autoRenew: boolean("auto_renew").notNull().default(false),
  stripeSubscriptionId: text("stripe_subscription_id"),
  stripeCustomerId: text("stripe_customer_id"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const subscriptionsRelations = relations(subscriptions, ({ one }) => ({
  organization: one(organizations, {
    fields: [subscriptions.organizationId],
    references: [organizations.id],
  }),
  plan: one(subscriptionPlans, {
    fields: [subscriptions.planId],
    references: [subscriptionPlans.id],
  }),
}));

// ==================== QUEUE MANAGEMENT SYSTEM ====================
export const queueStatusEnum = pgEnum("queue_status", ["active", "paused", "closed"]);
export const ticketStatusEnum = pgEnum("ticket_status", ["waiting", "called", "serving", "completed", "cancelled", "no_show"]);

export const queues = pgTable("queues", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  organizationId: integer("organization_id").notNull().references(() => organizations.id),
  name: text("name").notNull(),
  description: text("description"),
  status: queueStatusEnum("status").notNull().default("active"),
  currentTicket: integer("current_ticket").notNull().default(0),
  nextTicket: integer("next_ticket").notNull().default(1),
  avgServiceTime: integer("avg_service_time_minutes").notNull().default(5),
  qrCode: text("qr_code").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const queuesRelations = relations(queues, ({ one, many }) => ({
  organization: one(organizations, {
    fields: [queues.organizationId],
    references: [organizations.id],
  }),
  tickets: many(queueTickets),
}));

export const queueTickets = pgTable("queue_tickets", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  queueId: integer("queue_id").notNull().references(() => queues.id),
  ticketNumber: integer("ticket_number").notNull(),
  customerName: text("customer_name"),
  customerPhone: text("customer_phone"),
  partySize: integer("party_size").notNull().default(1),
  status: ticketStatusEnum("status").notNull().default("waiting"),
  estimatedWaitMinutes: integer("estimated_wait_minutes"),
  calledAt: timestamp("called_at"),
  servedAt: timestamp("served_at"),
  completedAt: timestamp("completed_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const queueTicketsRelations = relations(queueTickets, ({ one }) => ({
  queue: one(queues, {
    fields: [queueTickets.queueId],
    references: [queues.id],
  }),
}));

// ==================== RESTAURANT MANAGEMENT ENUMS ====================
export const tableStatusEnum = pgEnum("table_status", ["free", "occupied", "reserved"]);
export const orderStatusEnum = pgEnum("order_status", ["pending", "confirmed", "completed", "cancelled"]);
export const orderItemStatusEnum = pgEnum("order_item_status", ["queued", "preparing", "almost_ready", "ready", "delivered", "cancelled"]);
export const menuCategoryEnum = pgEnum("menu_category", ["appetizers", "mains", "drinks", "desserts", "specials"]);
export const userRoleEnum = pgEnum("user_role", ["admin", "waiter", "kitchen", "cashier"]);
export const paymentMethodEnum = pgEnum("payment_method", ["cash", "card"]);
export const reservationStatusEnum = pgEnum("reservation_status", ["confirmed", "cancelled", "completed"]);

// Tables (Restaurant tables - scoped to organization)
export const tables = pgTable("tables", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  organizationId: integer("organization_id").references(() => organizations.id),
  number: integer("number").notNull(),
  capacity: integer("capacity").notNull().default(4),
  status: tableStatusEnum("status").notNull().default("free"),
  qrCode: text("qr_code").notNull().unique(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const tablesRelations = relations(tables, ({ one, many }) => ({
  organization: one(organizations, {
    fields: [tables.organizationId],
    references: [organizations.id],
  }),
  orders: many(orders),
  payments: many(payments),
}));

// Menu Items (scoped to organization)
export const menuItems = pgTable("menu_items", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  organizationId: integer("organization_id").references(() => organizations.id),
  name: text("name").notNull(),
  category: menuCategoryEnum("category").notNull(),
  price: decimal("price", { precision: 10, scale: 2 }).notNull(),
  description: text("description").notNull(),
  imageUrl: text("image_url").notNull(),
  available: boolean("available").notNull().default(true),
  preparationTimeMinutes: integer("preparation_time_minutes").notNull().default(15),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const menuItemsRelations = relations(menuItems, ({ one, many }) => ({
  organization: one(organizations, {
    fields: [menuItems.organizationId],
    references: [organizations.id],
  }),
  orderItems: many(orderItems),
}));

// Orders
export const orders = pgTable("orders", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  tableId: integer("table_id").notNull().references(() => tables.id),
  status: orderStatusEnum("status").notNull().default("pending"),
  total: decimal("total", { precision: 10, scale: 2 }).notNull().default("0.00"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const ordersRelations = relations(orders, ({ one, many }) => ({
  table: one(tables, {
    fields: [orders.tableId],
    references: [tables.id],
  }),
  orderItems: many(orderItems),
  payment: one(payments),
}));

// Order Items
export const orderItems = pgTable("order_items", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  orderId: integer("order_id").notNull().references(() => orders.id),
  menuItemId: integer("menu_item_id").notNull().references(() => menuItems.id),
  quantity: integer("quantity").notNull().default(1),
  notes: text("notes"),
  status: orderItemStatusEnum("status").notNull().default("queued"),
  price: decimal("price", { precision: 10, scale: 2 }).notNull(),
  startedPreparingAt: timestamp("started_preparing_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const orderItemsRelations = relations(orderItems, ({ one }) => ({
  order: one(orders, {
    fields: [orderItems.orderId],
    references: [orders.id],
  }),
  menuItem: one(menuItems, {
    fields: [orderItems.menuItemId],
    references: [menuItems.id],
  }),
}));

// Users (with organization scope and global role)
export const users = pgTable("users", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  organizationId: integer("organization_id").references(() => organizations.id),
  username: text("username").notNull().unique(),
  email: text("email"),
  password: text("password").notNull(),
  globalRole: globalUserRoleEnum("global_role").notNull().default("org_staff"),
  role: userRoleEnum("role").notNull(),
  name: text("name").notNull(),
  isActive: boolean("is_active").notNull().default(true),
  lastLoginAt: timestamp("last_login_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const usersRelations = relations(users, ({ one }) => ({
  organization: one(organizations, {
    fields: [users.organizationId],
    references: [organizations.id],
  }),
}));

// Payments
export const payments = pgTable("payments", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  orderId: integer("order_id").notNull().references(() => orders.id).unique(),
  tableId: integer("table_id").notNull().references(() => tables.id),
  amount: decimal("amount", { precision: 10, scale: 2 }).notNull(),
  method: paymentMethodEnum("method").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const paymentsRelations = relations(payments, ({ one }) => ({
  order: one(orders, {
    fields: [payments.orderId],
    references: [orders.id],
  }),
  table: one(tables, {
    fields: [payments.tableId],
    references: [tables.id],
  }),
}));

// Waiter Call Notifications
export const waiterCalls = pgTable("waiter_calls", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  tableId: integer("table_id").notNull().references(() => tables.id),
  reason: text("reason"),
  resolved: boolean("resolved").notNull().default(false),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// Bill Shares for split bills
export const billShares = pgTable("bill_shares", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  paymentId: integer("payment_id").notNull().references(() => payments.id),
  customerName: text("customer_name").notNull(),
  amount: decimal("amount", { precision: 10, scale: 2 }).notNull(),
  paid: boolean("paid").notNull().default(false),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// Reservations
export const reservations = pgTable("reservations", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  tableId: integer("table_id").notNull().references(() => tables.id),
  customerName: text("customer_name").notNull(),
  customerPhone: text("customer_phone"),
  guestCount: integer("guest_count").notNull(),
  reservationTime: timestamp("reservation_time").notNull(),
  status: reservationStatusEnum("status").notNull().default("confirmed"),
  notes: text("notes"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// Dish Reviews/Ratings
export const dishReviews = pgTable("dish_reviews", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  menuItemId: integer("menu_item_id").notNull().references(() => menuItems.id),
  rating: integer("rating").notNull(), // 1-5
  comment: text("comment"),
  customerName: text("customer_name"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// ==================== INSERT SCHEMAS ====================

// Organization & Subscription Insert Schemas
export const insertOrganizationSchema = createInsertSchema(organizations).omit({
  id: true as any,
  createdAt: true as any,
  updatedAt: true as any,
});

export const insertSubscriptionPlanSchema = createInsertSchema(subscriptionPlans).omit({
  id: true as any,
  createdAt: true as any,
});

export const insertSubscriptionSchema = createInsertSchema(subscriptions).omit({
  id: true as any,
  createdAt: true as any,
  updatedAt: true as any,
});

// Queue Management Insert Schemas
export const insertQueueSchema = createInsertSchema(queues).omit({
  id: true as any,
  createdAt: true as any,
  updatedAt: true as any,
});

export const insertQueueTicketSchema = createInsertSchema(queueTickets).omit({
  id: true as any,
  createdAt: true as any,
});

// Restaurant Insert Schemas
export const insertTableSchema = createInsertSchema(tables).omit({
  id: true as any,
  createdAt: true as any,
});

export const insertMenuItemSchema = createInsertSchema(menuItems).omit({
  id: true as any,
  createdAt: true as any,
}).extend({
  preparationTimeMinutes: z.number().int().positive().optional(),
});

export const insertOrderSchema = createInsertSchema(orders).omit({
  id: true as any,
  createdAt: true as any,
  updatedAt: true as any,
});

export const insertOrderItemSchema = createInsertSchema(orderItems).omit({
  id: true as any,
  createdAt: true as any,
});

export const insertUserSchema = createInsertSchema(users).omit({
  id: true as any,
  createdAt: true as any,
});

export const insertPaymentSchema = createInsertSchema(payments).omit({
  id: true as any,
  createdAt: true as any,
});

export const insertWaiterCallSchema = createInsertSchema(waiterCalls).omit({
  id: true as any,
  createdAt: true as any,
});

export const insertBillShareSchema = createInsertSchema(billShares).omit({
  id: true as any,
  createdAt: true as any,
});

export const insertReservationSchema = createInsertSchema(reservations).omit({
  id: true as any,
  createdAt: true as any,
});

export const insertDishReviewSchema = createInsertSchema(dishReviews).omit({
  id: true as any,
  createdAt: true as any,
});

// Types
export type Table = typeof tables.$inferSelect;
export type InsertTable = z.infer<typeof insertTableSchema>;

export type MenuItem = typeof menuItems.$inferSelect;
export type InsertMenuItem = z.infer<typeof insertMenuItemSchema>;

export type Order = typeof orders.$inferSelect;
export type InsertOrder = z.infer<typeof insertOrderSchema>;

export type OrderItem = typeof orderItems.$inferSelect;
export type InsertOrderItem = z.infer<typeof insertOrderItemSchema>;

export type User = typeof users.$inferSelect;
export type InsertUser = z.infer<typeof insertUserSchema>;

export type Payment = typeof payments.$inferSelect;
export type InsertPayment = z.infer<typeof insertPaymentSchema>;

export type WaiterCall = typeof waiterCalls.$inferSelect;
export type InsertWaiterCall = z.infer<typeof insertWaiterCallSchema>;

export type BillShare = typeof billShares.$inferSelect;
export type InsertBillShare = z.infer<typeof insertBillShareSchema>;

export type Reservation = typeof reservations.$inferSelect;
export type InsertReservation = z.infer<typeof insertReservationSchema>;

export type DishReview = typeof dishReviews.$inferSelect;
export type InsertDishReview = z.infer<typeof insertDishReviewSchema>;

// Organization & Subscription Types
export type Organization = typeof organizations.$inferSelect;
export type InsertOrganization = z.infer<typeof insertOrganizationSchema>;

export type SubscriptionPlan = typeof subscriptionPlans.$inferSelect;
export type InsertSubscriptionPlan = z.infer<typeof insertSubscriptionPlanSchema>;

export type Subscription = typeof subscriptions.$inferSelect;
export type InsertSubscription = z.infer<typeof insertSubscriptionSchema>;

// Queue Management Types
export type Queue = typeof queues.$inferSelect;
export type InsertQueue = z.infer<typeof insertQueueSchema>;

export type QueueTicket = typeof queueTickets.$inferSelect;
export type InsertQueueTicket = z.infer<typeof insertQueueTicketSchema>;

// Extended types with relations
export type OrderWithItems = Order & {
  orderItems: (OrderItem & {
    menuItem: MenuItem;
  })[];
  table: Table;
};

export type TableWithOrders = Table & {
  orders: OrderWithItems[];
};

export type OrganizationWithSubscription = Organization & {
  subscriptions: (Subscription & {
    plan: SubscriptionPlan;
  })[];
};

export type QueueWithTickets = Queue & {
  tickets: QueueTicket[];
  organization: Organization;
};
