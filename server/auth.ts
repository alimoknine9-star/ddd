import bcrypt from "bcrypt";
import { db } from "./db";
import { users, organizations, subscriptions, subscriptionPlans } from "@shared/schema";
import { eq, and, gte } from "drizzle-orm";
import type { Request, Response, NextFunction } from "express";

const SALT_ROUNDS = 10;

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, SALT_ROUNDS);
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

export async function authenticateUser(username: string, password: string) {
  const user = await db.query.users.findFirst({
    where: eq(users.username, username),
  });

  if (!user) {
    return null;
  }

  const isValid = await verifyPassword(password, user.password);
  if (!isValid) {
    return null;
  }

  await db.update(users)
    .set({ lastLoginAt: new Date() })
    .where(eq(users.id, user.id));

  return user;
}

export async function getActiveSubscription(organizationId: number) {
  const now = new Date();
  const subscription = await db.query.subscriptions.findFirst({
    where: and(
      eq(subscriptions.organizationId, organizationId),
      eq(subscriptions.status, "active"),
      gte(subscriptions.endDate, now)
    ),
    with: {
      plan: true,
    },
  });
  return subscription;
}

export async function checkSubscriptionActive(organizationId: number): Promise<boolean> {
  const subscription = await getActiveSubscription(organizationId);
  return !!subscription;
}

export function requireAuth(req: Request, res: Response, next: NextFunction) {
  if (!req.session?.userId) {
    return res.status(401).json({ error: "Authentication required" });
  }
  next();
}

export function requireSuperAdmin(req: Request, res: Response, next: NextFunction) {
  if (!req.session?.userId) {
    return res.status(401).json({ error: "Authentication required" });
  }
  if (req.session.globalRole !== "super_admin") {
    return res.status(403).json({ error: "Super admin access required" });
  }
  next();
}

export function requireOrgAdmin(req: Request, res: Response, next: NextFunction) {
  if (!req.session?.userId) {
    return res.status(401).json({ error: "Authentication required" });
  }
  if (req.session.globalRole !== "super_admin" && req.session.globalRole !== "org_admin") {
    return res.status(403).json({ error: "Admin access required" });
  }
  next();
}

export async function requireActiveSubscription(req: Request, res: Response, next: NextFunction) {
  if (!req.session?.userId) {
    return res.status(401).json({ error: "Authentication required" });
  }
  
  if (req.session.globalRole === "super_admin") {
    return next();
  }

  if (!req.session.organizationId) {
    return res.status(403).json({ error: "No organization associated with this account" });
  }

  const hasActiveSubscription = await checkSubscriptionActive(req.session.organizationId);
  if (!hasActiveSubscription) {
    return res.status(403).json({ 
      error: "Subscription expired",
      code: "SUBSCRIPTION_EXPIRED",
      message: "Your subscription has expired. Please renew to continue using the application."
    });
  }

  next();
}

declare module "express-session" {
  interface SessionData {
    userId: number;
    username: string;
    globalRole: "super_admin" | "org_admin" | "org_staff";
    role: "admin" | "waiter" | "kitchen" | "cashier";
    organizationId: number | null;
    organizationType: "restaurant" | "queue_business" | null;
  }
}
