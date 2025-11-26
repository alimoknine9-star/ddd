// Updated storage interface based on javascript_database blueprint
import {
  tables,
  menuItems,
  orders,
  orderItems,
  users,
  payments,
  waiterCalls,
  billShares,
  reservations,
  dishReviews,
  type Table,
  type InsertTable,
  type MenuItem,
  type InsertMenuItem,
  type Order,
  type InsertOrder,
  type OrderItem,
  type InsertOrderItem,
  type User,
  type InsertUser,
  type Payment,
  type InsertPayment,
  type WaiterCall,
  type InsertWaiterCall,
  type BillShare,
  type InsertBillShare,
  type Reservation,
  type InsertReservation,
  type DishReview,
  type InsertDishReview,
  type OrderWithItems,
  type TableWithOrders,
} from "@shared/schema";
import { db } from "./db";
import { eq, and, desc, sql } from "drizzle-orm";

export interface IStorage {
  // Tables
  getTables(): Promise<Table[]>;
  getTableById(id: number): Promise<Table | undefined>;
  getOccupiedTablesWithOrders(): Promise<TableWithOrders[]>;
  createTable(table: InsertTable): Promise<Table>;
  updateTableStatus(id: number, status: string): Promise<Table | undefined>;
  deleteTable(id: number): Promise<void>;

  // Menu Items
  getMenuItems(): Promise<MenuItem[]>;
  getMenuItemById(id: number): Promise<MenuItem | undefined>;
  createMenuItem(item: InsertMenuItem): Promise<MenuItem>;
  updateMenuItem(id: number, data: Partial<MenuItem>): Promise<MenuItem | undefined>;
  deleteMenuItem(id: number): Promise<void>;

  // Orders
  getOrders(): Promise<OrderWithItems[]>;
  getOrderById(id: number): Promise<OrderWithItems | undefined>;
  getOrdersByStatus(status: string): Promise<OrderWithItems[]>;
  getOrdersByTableId(tableId: number, options?: { limit?: number; offset?: number }): Promise<OrderWithItems[]>;
  createOrder(order: InsertOrder): Promise<Order>;
  updateOrderStatus(id: number, status: string): Promise<Order | undefined>;
  updateOrderTotal(id: number, total: string): Promise<void>;

  // Order Items
  createOrderItem(item: InsertOrderItem): Promise<OrderItem>;
  updateOrderItemStatus(id: number, status: string): Promise<OrderItem | undefined>;
  getOrderItemById(id: number): Promise<OrderItem | undefined>;

  // Users
  getUsers(): Promise<User[]>;
  getUserById(id: number): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;

  // Payments
  createPayment(payment: InsertPayment): Promise<Payment>;
  getPaymentHistory(): Promise<Payment[]>;

  // Waiter Calls
  getWaiterCalls(): Promise<WaiterCall[]>;
  createWaiterCall(call: InsertWaiterCall): Promise<WaiterCall>;
  resolveWaiterCall(id: number): Promise<void>;

  // Bill Shares
  createBillShare(share: InsertBillShare): Promise<BillShare>;
  getBillSharesByPaymentId(paymentId: number): Promise<BillShare[]>;
  updateBillSharePaid(id: number, paid: boolean): Promise<BillShare | undefined>;

  // Reservations
  createReservation(reservation: InsertReservation): Promise<Reservation>;
  getReservations(): Promise<Reservation[]>;
  getReservationsByDate(date: Date): Promise<Reservation[]>;
  updateReservationStatus(id: number, status: string): Promise<Reservation | undefined>;
  deleteReservation(id: number): Promise<void>;

  // Dish Reviews
  createDishReview(review: InsertDishReview): Promise<DishReview>;
  getDishReviewsByMenuItemId(menuItemId: number): Promise<DishReview[]>;
  getAverageRating(menuItemId: number): Promise<number>;

  // Analytics
  getSalesAnalytics(startDate: Date, endDate: Date): Promise<any>;
  getPopularItems(limit: number): Promise<any[]>;
  getCancellationRate(): Promise<number>;
}

export class DatabaseStorage implements IStorage {
  // Tables
  async getTables(): Promise<Table[]> {
    return await db.select().from(tables).orderBy(tables.number);
  }

  async getTableById(id: number): Promise<Table | undefined> {
    const [table] = await db.select().from(tables).where(eq(tables.id, id));
    return table;
  }

  async getOccupiedTablesWithOrders(): Promise<TableWithOrders[]> {
    const occupiedTables = await db.query.tables.findMany({
      where: eq(tables.status, "occupied"),
      with: {
        orders: {
          where: eq(orders.status, "confirmed"),
          with: {
            orderItems: {
              with: {
                menuItem: true,
              },
            },
            table: true,
          },
        },
      },
    });
    return occupiedTables as TableWithOrders[];
  }

  async createTable(insertTable: InsertTable): Promise<Table> {
    const [table] = await db.insert(tables).values(insertTable).returning();
    return table;
  }

  async updateTableStatus(id: number, status: string): Promise<Table | undefined> {
    const [table] = await db
      .update(tables)
      .set({ status: status as any })
      .where(eq(tables.id, id))
      .returning();
    return table;
  }

  async deleteTable(id: number): Promise<void> {
    await db.delete(tables).where(eq(tables.id, id));
  }

  // Menu Items
  async getMenuItems(): Promise<MenuItem[]> {
    return await db.select().from(menuItems).orderBy(menuItems.category, menuItems.name);
  }

  async getMenuItemById(id: number): Promise<MenuItem | undefined> {
    const [item] = await db.select().from(menuItems).where(eq(menuItems.id, id));
    return item;
  }

  async createMenuItem(item: InsertMenuItem): Promise<MenuItem> {
    const [menuItem] = await db.insert(menuItems).values(item).returning();
    return menuItem;
  }

  async updateMenuItem(id: number, data: Partial<MenuItem>): Promise<MenuItem | undefined> {
    const [item] = await db
      .update(menuItems)
      .set(data)
      .where(eq(menuItems.id, id))
      .returning();
    return item;
  }

  async deleteMenuItem(id: number): Promise<void> {
    await db.delete(menuItems).where(eq(menuItems.id, id));
  }

  // Orders
  async getOrders(): Promise<OrderWithItems[]> {
    const allOrders = await db.query.orders.findMany({
      with: {
        orderItems: {
          with: {
            menuItem: true,
          },
        },
        table: true,
      },
      orderBy: [desc(orders.createdAt)],
    });
    return allOrders as OrderWithItems[];
  }

  async getOrderById(id: number): Promise<OrderWithItems | undefined> {
    const order = await db.query.orders.findFirst({
      where: eq(orders.id, id),
      with: {
        orderItems: {
          with: {
            menuItem: true,
          },
        },
        table: true,
      },
    });
    return order as OrderWithItems | undefined;
  }

  async getOrdersByStatus(status: string): Promise<OrderWithItems[]> {
    const statusOrders = await db.query.orders.findMany({
      where: eq(orders.status, status as any),
      with: {
        orderItems: {
          with: {
            menuItem: true,
          },
        },
        table: true,
      },
      orderBy: [desc(orders.createdAt)],
    });
    return statusOrders as OrderWithItems[];
  }

  async getOrdersByTableId(tableId: number, options?: { limit?: number; offset?: number }): Promise<OrderWithItems[]> {
    const tableOrders = await db.query.orders.findMany({
      where: eq(orders.tableId, tableId),
      with: {
        orderItems: {
          with: {
            menuItem: true,
          },
        },
        table: true,
      },
      orderBy: [desc(orders.createdAt)],
      limit: options?.limit,
      offset: options?.offset,
    });
    return tableOrders as OrderWithItems[];
  }

  async createOrder(insertOrder: InsertOrder): Promise<Order> {
    const [order] = await db.insert(orders).values(insertOrder).returning();
    return order;
  }

  async updateOrderStatus(id: number, status: string): Promise<Order | undefined> {
    const [order] = await db
      .update(orders)
      .set({ status: status as any, updatedAt: new Date() })
      .where(eq(orders.id, id))
      .returning();
    return order;
  }

  async updateOrderTotal(id: number, total: string): Promise<void> {
    await db.update(orders).set({ total, updatedAt: new Date() }).where(eq(orders.id, id));
  }

  // Order Items
  async createOrderItem(item: InsertOrderItem): Promise<OrderItem> {
    const [orderItem] = await db.insert(orderItems).values(item).returning();
    return orderItem;
  }

  async updateOrderItemStatus(id: number, status: string): Promise<OrderItem | undefined> {
    const updateData: any = { status: status as any };
    
    if (status === 'preparing') {
      const [existingItem] = await db.select().from(orderItems).where(eq(orderItems.id, id));
      if (existingItem && !existingItem.startedPreparingAt) {
        updateData.startedPreparingAt = new Date();
      }
    }
    
    const [item] = await db
      .update(orderItems)
      .set(updateData)
      .where(eq(orderItems.id, id))
      .returning();
    return item;
  }

  async getOrderItemById(id: number): Promise<OrderItem | undefined> {
    const [item] = await db.select().from(orderItems).where(eq(orderItems.id, id));
    return item;
  }

  // Users
  async getUsers(): Promise<User[]> {
    return await db.select().from(users).orderBy(users.name);
  }

  async getUserById(id: number): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.id, id));
    return user;
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.username, username));
    return user;
  }

  async createUser(insertUser: InsertUser): Promise<User> {
    const [user] = await db.insert(users).values(insertUser).returning();
    return user;
  }

  // Payments
  async createPayment(payment: InsertPayment): Promise<Payment> {
    const [newPayment] = await db.insert(payments).values(payment).returning();
    return newPayment;
  }

  async getPaymentHistory(): Promise<Payment[]> {
    return await db.select().from(payments).orderBy(desc(payments.createdAt)).limit(50);
  }

  // Waiter Calls
  async getWaiterCalls(): Promise<WaiterCall[]> {
    return await db.select().from(waiterCalls).orderBy(desc(waiterCalls.createdAt));
  }

  async createWaiterCall(call: InsertWaiterCall): Promise<WaiterCall> {
    const [waiterCall] = await db.insert(waiterCalls).values(call).returning();
    return waiterCall;
  }

  async resolveWaiterCall(id: number): Promise<void> {
    await db.update(waiterCalls).set({ resolved: true }).where(eq(waiterCalls.id, id));
  }

  // Bill Shares
  async createBillShare(share: InsertBillShare): Promise<BillShare> {
    const [billShare] = await db.insert(billShares).values(share).returning();
    return billShare;
  }

  async getBillSharesByPaymentId(paymentId: number): Promise<BillShare[]> {
    return await db.select().from(billShares).where(eq(billShares.paymentId, paymentId));
  }

  async updateBillSharePaid(id: number, paid: boolean): Promise<BillShare | undefined> {
    const [billShare] = await db.update(billShares).set({ paid }).where(eq(billShares.id, id)).returning();
    return billShare;
  }

  // Reservations
  async createReservation(reservation: InsertReservation): Promise<Reservation> {
    const [res] = await db.insert(reservations).values(reservation).returning();
    return res;
  }

  async getReservations(): Promise<Reservation[]> {
    return await db.select().from(reservations).orderBy(reservations.reservationTime);
  }

  async getReservationsByDate(date: Date): Promise<Reservation[]> {
    const startOfDay = new Date(date);
    startOfDay.setHours(0, 0, 0, 0);
    const endOfDay = new Date(date);
    endOfDay.setHours(23, 59, 59, 999);
    
    return await db.select().from(reservations)
      .where(and(
        sql`${reservations.reservationTime} >= ${startOfDay}`,
        sql`${reservations.reservationTime} <= ${endOfDay}`
      ));
  }

  async updateReservationStatus(id: number, status: string): Promise<Reservation | undefined> {
    const [res] = await db.update(reservations).set({ status: status as any }).where(eq(reservations.id, id)).returning();
    return res;
  }

  async deleteReservation(id: number): Promise<void> {
    await db.delete(reservations).where(eq(reservations.id, id));
  }

  // Dish Reviews
  async createDishReview(review: InsertDishReview): Promise<DishReview> {
    const [dishReview] = await db.insert(dishReviews).values(review).returning();
    return dishReview;
  }

  async getDishReviewsByMenuItemId(menuItemId: number): Promise<DishReview[]> {
    return await db.select().from(dishReviews)
      .where(eq(dishReviews.menuItemId, menuItemId))
      .orderBy(desc(dishReviews.createdAt));
  }

  async getAverageRating(menuItemId: number): Promise<number> {
    const result = await db.select({
      avg: sql<number>`AVG(${dishReviews.rating})`
    }).from(dishReviews).where(eq(dishReviews.menuItemId, menuItemId));
    
    return result[0]?.avg ? Math.round(result[0].avg * 10) / 10 : 0;
  }

  // Analytics
  async getSalesAnalytics(startDate: Date, endDate: Date): Promise<any> {
    return await db.select({
      date: sql<string>`DATE(${payments.createdAt})`,
      totalSales: sql<string>`SUM(${payments.amount})`,
      transactionCount: sql<number>`COUNT(${payments.id})`
    }).from(payments)
      .where(and(
        sql`${payments.createdAt} >= ${startDate}`,
        sql`${payments.createdAt} <= ${endDate}`
      ))
      .groupBy(sql`DATE(${payments.createdAt})`);
  }

  async getPopularItems(limit: number): Promise<any[]> {
    return await db.select({
      name: menuItems.name,
      quantity: sql<number>`SUM(${orderItems.quantity})`,
      totalRevenue: sql<string>`SUM(CAST(${orderItems.price} AS DECIMAL) * ${orderItems.quantity})`
    }).from(orderItems)
      .innerJoin(menuItems, eq(orderItems.menuItemId, menuItems.id))
      .groupBy(menuItems.id, menuItems.name)
      .orderBy(sql`SUM(${orderItems.quantity}) DESC`)
      .limit(limit);
  }

  async getCancellationRate(): Promise<number> {
    const result = await db.select({
      total: sql<number>`COUNT(*)`,
      cancelled: sql<number>`COUNT(CASE WHEN status = 'cancelled' THEN 1 END)`
    }).from(orderItems);

    if (!result[0]?.total) return 0;
    return Math.round((result[0].cancelled / result[0].total) * 100 * 10) / 10;
  }
}

export const storage = new DatabaseStorage();
