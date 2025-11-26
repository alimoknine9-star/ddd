import { db } from "./db";
import { tables, menuItems, users, organizations, subscriptionPlans, subscriptions } from "@shared/schema";
import { hashPassword } from "./auth";

async function seed() {
  console.log("Seeding database...");

  // Create Super Admin user (the app owner - you!)
  const superAdminPassword = await hashPassword("superadmin123");
  await db.insert(users).values({
    username: "superadmin",
    email: "admin@queueapp.com",
    password: superAdminPassword,
    globalRole: "super_admin",
    role: "admin",
    name: "Super Admin",
    isActive: true,
  });
  console.log("✓ Created Super Admin user (username: superadmin, password: superadmin123)");

  // Create Subscription Plans for Restaurants
  const restaurantPlans = [
    {
      name: "Restaurant Starter - 1 Month",
      description: "Basic plan for small restaurants",
      durationMonths: 1,
      price: "29.99",
      features: JSON.stringify(["Up to 10 tables", "Basic menu management", "Order tracking"]),
      organizationType: "restaurant" as const,
      isActive: true,
    },
    {
      name: "Restaurant Pro - 3 Months",
      description: "Professional plan with advanced features",
      durationMonths: 3,
      price: "79.99",
      features: JSON.stringify(["Up to 25 tables", "Full menu management", "Analytics", "Staff management"]),
      organizationType: "restaurant" as const,
      isActive: true,
    },
    {
      name: "Restaurant Pro - 6 Months",
      description: "Professional plan - 6 month commitment",
      durationMonths: 6,
      price: "149.99",
      features: JSON.stringify(["Up to 25 tables", "Full menu management", "Analytics", "Staff management", "Priority support"]),
      organizationType: "restaurant" as const,
      isActive: true,
    },
    {
      name: "Restaurant Enterprise - 1 Year",
      description: "Full-featured annual plan",
      durationMonths: 12,
      price: "249.99",
      features: JSON.stringify(["Unlimited tables", "Full menu management", "Advanced analytics", "Staff management", "Priority support", "Custom branding"]),
      organizationType: "restaurant" as const,
      isActive: true,
    },
  ];

  // Create Subscription Plans for Queue Businesses
  const queuePlans = [
    {
      name: "Queue Starter - 1 Month",
      description: "Basic queue management",
      durationMonths: 1,
      price: "19.99",
      features: JSON.stringify(["1 queue", "Basic notifications", "Simple dashboard"]),
      organizationType: "queue_business" as const,
      isActive: true,
    },
    {
      name: "Queue Pro - 3 Months",
      description: "Advanced queue management",
      durationMonths: 3,
      price: "49.99",
      features: JSON.stringify(["Up to 5 queues", "SMS notifications", "Analytics", "Custom branding"]),
      organizationType: "queue_business" as const,
      isActive: true,
    },
    {
      name: "Queue Pro - 6 Months",
      description: "Advanced queue management - 6 months",
      durationMonths: 6,
      price: "89.99",
      features: JSON.stringify(["Up to 5 queues", "SMS notifications", "Analytics", "Custom branding", "Priority support"]),
      organizationType: "queue_business" as const,
      isActive: true,
    },
    {
      name: "Queue Enterprise - 1 Year",
      description: "Full-featured queue management",
      durationMonths: 12,
      price: "149.99",
      features: JSON.stringify(["Unlimited queues", "SMS & email notifications", "Advanced analytics", "Custom branding", "API access", "Priority support"]),
      organizationType: "queue_business" as const,
      isActive: true,
    },
  ];

  await db.insert(subscriptionPlans).values([...restaurantPlans, ...queuePlans]);
  console.log("✓ Created subscription plans");

  // Create a demo restaurant organization with active subscription
  const [demoOrg] = await db.insert(organizations).values({
    name: "Demo Restaurant",
    slug: "demo-restaurant",
    type: "restaurant",
    email: "demo@restaurant.com",
    phone: "+1234567890",
    isActive: true,
  }).returning();
  console.log("✓ Created demo restaurant organization");

  // Get the 1-year plan for demo
  const plans = await db.query.subscriptionPlans.findMany();
  const yearlyPlan = plans.find(p => p.durationMonths === 12 && p.organizationType === "restaurant");

  if (yearlyPlan) {
    const now = new Date();
    const endDate = new Date(now);
    endDate.setMonth(endDate.getMonth() + 12);

    await db.insert(subscriptions).values({
      organizationId: demoOrg.id,
      planId: yearlyPlan.id,
      status: "active",
      startDate: now,
      endDate: endDate,
      autoRenew: false,
    });
    console.log("✓ Created demo subscription (1 year active)");
  }

  // Create restaurant admin user for demo org
  const demoAdminPassword = await hashPassword("demo123");
  await db.insert(users).values({
    organizationId: demoOrg.id,
    username: "demoadmin",
    email: "admin@demo-restaurant.com",
    password: demoAdminPassword,
    globalRole: "org_admin",
    role: "admin",
    name: "Demo Restaurant Admin",
    isActive: true,
  });
  console.log("✓ Created demo restaurant admin (username: demoadmin, password: demo123)");

  // Create restaurant staff users
  const staffPassword = await hashPassword("staff123");
  await db.insert(users).values([
    {
      organizationId: demoOrg.id,
      username: "waiter1",
      password: staffPassword,
      globalRole: "org_staff",
      role: "waiter",
      name: "John Waiter",
      isActive: true,
    },
    {
      organizationId: demoOrg.id,
      username: "kitchen1",
      password: staffPassword,
      globalRole: "org_staff",
      role: "kitchen",
      name: "Chef Mike",
      isActive: true,
    },
    {
      organizationId: demoOrg.id,
      username: "cashier1",
      password: staffPassword,
      globalRole: "org_staff",
      role: "cashier",
      name: "Sarah Cashier",
      isActive: true,
    },
  ]);
  console.log("✓ Created demo staff users (password: staff123)");

  // Create tables for demo restaurant
  const tablesToCreate = [
    { organizationId: demoOrg.id, number: 1, capacity: 2, status: "free" as const, qrCode: `table-${demoOrg.id}-1-qr` },
    { organizationId: demoOrg.id, number: 2, capacity: 4, status: "free" as const, qrCode: `table-${demoOrg.id}-2-qr` },
    { organizationId: demoOrg.id, number: 3, capacity: 4, status: "free" as const, qrCode: `table-${demoOrg.id}-3-qr` },
    { organizationId: demoOrg.id, number: 4, capacity: 6, status: "free" as const, qrCode: `table-${demoOrg.id}-4-qr` },
    { organizationId: demoOrg.id, number: 5, capacity: 2, status: "free" as const, qrCode: `table-${demoOrg.id}-5-qr` },
    { organizationId: demoOrg.id, number: 6, capacity: 4, status: "free" as const, qrCode: `table-${demoOrg.id}-6-qr` },
  ];

  await db.insert(tables).values(tablesToCreate);
  console.log("✓ Created restaurant tables");

  // Create menu items for demo restaurant
  const menuItemsToCreate = [
    {
      organizationId: demoOrg.id,
      name: "Crispy French Fries",
      category: "appetizers" as const,
      price: "6.99",
      description: "Golden crispy french fries seasoned to perfection, served with house sauce",
      imageUrl: "/attached_assets/generated_images/crispy_golden_french_fries.png",
      available: true,
      preparationTimeMinutes: 8,
    },
    {
      organizationId: demoOrg.id,
      name: "Bruschetta",
      category: "appetizers" as const,
      price: "8.99",
      description: "Fresh tomatoes, basil, and mozzarella on toasted artisan bread",
      imageUrl: "/attached_assets/generated_images/fresh_bruschetta_appetizer.png",
      available: true,
      preparationTimeMinutes: 10,
    },
    {
      organizationId: demoOrg.id,
      name: "Classic Burger",
      category: "mains" as const,
      price: "14.99",
      description: "Juicy beef patty with cheese, lettuce, tomato, and our special sauce on a sesame bun",
      imageUrl: "/attached_assets/generated_images/juicy_classic_burger.png",
      available: true,
      preparationTimeMinutes: 18,
    },
    {
      organizationId: demoOrg.id,
      name: "Pasta Carbonara",
      category: "mains" as const,
      price: "16.99",
      description: "Creamy carbonara with crispy bacon and fresh parmesan cheese",
      imageUrl: "/attached_assets/generated_images/creamy_pasta_carbonara.png",
      available: true,
      preparationTimeMinutes: 15,
    },
    {
      organizationId: demoOrg.id,
      name: "Grilled Salmon",
      category: "mains" as const,
      price: "22.99",
      description: "Fresh Atlantic salmon grilled to perfection, served with asparagus and lemon",
      imageUrl: "/attached_assets/generated_images/grilled_salmon_fillet.png",
      available: true,
      preparationTimeMinutes: 25,
    },
    {
      organizationId: demoOrg.id,
      name: "Margherita Pizza",
      category: "mains" as const,
      price: "13.99",
      description: "Wood-fired pizza with fresh mozzarella, basil, and tomato sauce",
      imageUrl: "/attached_assets/generated_images/margherita_pizza.png",
      available: true,
      preparationTimeMinutes: 20,
    },
    {
      organizationId: demoOrg.id,
      name: "Fresh Lemonade",
      category: "drinks" as const,
      price: "4.99",
      description: "Freshly squeezed lemonade with mint and ice",
      imageUrl: "/attached_assets/generated_images/fresh_lemonade_with_mint.png",
      available: true,
      preparationTimeMinutes: 5,
    },
    {
      organizationId: demoOrg.id,
      name: "Espresso",
      category: "drinks" as const,
      price: "3.99",
      description: "Rich Italian espresso made from premium beans",
      imageUrl: "/attached_assets/generated_images/rich_italian_espresso.png",
      available: true,
      preparationTimeMinutes: 3,
    },
    {
      organizationId: demoOrg.id,
      name: "Chocolate Cake",
      category: "desserts" as const,
      price: "7.99",
      description: "Decadent chocolate cake with layers of chocolate ganache",
      imageUrl: "/attached_assets/generated_images/decadent_chocolate_cake.png",
      available: true,
      preparationTimeMinutes: 5,
    },
    {
      organizationId: demoOrg.id,
      name: "Tiramisu",
      category: "desserts" as const,
      price: "8.99",
      description: "Classic Italian tiramisu with coffee-soaked ladyfingers and mascarpone",
      imageUrl: "/attached_assets/generated_images/classic_italian_tiramisu.png",
      available: true,
      preparationTimeMinutes: 5,
    },
  ];

  await db.insert(menuItems).values(menuItemsToCreate);
  console.log("✓ Created menu items");

  console.log("\n========================================");
  console.log("Database seeded successfully!");
  console.log("========================================");
  console.log("\nLogin Credentials:");
  console.log("----------------------------------------");
  console.log("Super Admin (App Owner):");
  console.log("  Username: superadmin");
  console.log("  Password: superadmin123");
  console.log("\nDemo Restaurant Admin:");
  console.log("  Username: demoadmin");
  console.log("  Password: demo123");
  console.log("\nDemo Staff (waiter1, kitchen1, cashier1):");
  console.log("  Password: staff123");
  console.log("----------------------------------------");
}

seed()
  .catch((error) => {
    console.error("Seed failed:", error);
    process.exit(1);
  })
  .then(() => {
    process.exit(0);
  });
