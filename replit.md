# Restaurant Management System

## Overview

A full-stack restaurant management system enabling QR code-based customer ordering and real-time updates across distinct interfaces for customers, waiters, kitchen staff, cashiers, and administrators. The system is designed to streamline restaurant operations from order placement to payment processing, featuring real-time synchronization via WebSockets.

## Recent Changes

**November 24, 2025**: Successfully imported and configured project for Replit environment
- Installed all npm dependencies
- Set up PostgreSQL database using Replit's built-in database
- Pushed database schema using Drizzle Kit
- Fixed TypeScript errors in schema validation (drizzle-zod compatibility)
- Configured development workflow to run on port 5000
- Set up deployment configuration for production (autoscale)
- Verified application is running correctly with login screen showing all four roles

## User Preferences

Preferred communication style: Simple, everyday language.

## System Architecture

### Frontend Architecture
- **Frameworks**: React 18 with TypeScript, Vite, Wouter for routing, TanStack Query for server state.
- **UI/UX**: Hybrid approach combining utility-first for staff (Material Design principles, Inter font) and experience-focused for customers (food delivery app inspiration, Poppins font, image-rich design). Utilizes Tailwind CSS and shadcn/ui (New York style).
- **State Management**: TanStack Query for server state and caching, React hooks for local UI state.
- **Real-Time Communication**: WebSocket connection at `/ws` broadcasting updates like `order_created`, `order_item_status_updated`, `payment_processed`, etc., triggering query invalidations.
- **Key Features**: Kitchen timer system (countdown, color-coded warnings, notifications), Waiter notification system (audio alerts, toast notifications, sound toggle), Order history for customers, interactive split bill feature.

### Backend Architecture
- **Framework**: Express.js with Node.js for HTTP API and WebSocket server.
- **API Design**: RESTful endpoints under `/api/*`, with a storage abstraction layer and Zod for request validation.
- **WebSocket**: Single WebSocket server at `/ws` for server-to-client push notifications, supporting graceful connections.
- **Database Layer**: Drizzle ORM with PostgreSQL dialect, Neon serverless PostgreSQL, schema-first approach with `shared/schema.ts`, and Drizzle-Zod for validation.

### Data Storage Solutions
- **Database Schema**: Includes `tables`, `menuItems`, `orders`, `orderItems` (with granular status), `users` (role-based), `payments`, and `waiterCalls`.
- **Relational Design**: One-to-many relationships (e.g., Table → Orders, Order → OrderItems) with Drizzle relations.
- **Key Architectural Decisions**: Separation of order status and order item status for kitchen workflow, QR codes for tables, decimal type for monetary values, timestamps for audit.

### Authentication and Authorization
- **Current Implementation**: Role selection at login, client-side role-based routing and UI rendering. No password authentication or session management in the current simplified internal-use setup.

## External Dependencies

- **Database**: Neon Database (`@neondatabase/serverless`) for serverless PostgreSQL.
- **UI Components**: shadcn/ui for Radix UI primitives with Tailwind styling.
- **Third-Party Services**: `qrcode` library for server-side QR code generation, `date-fns` for date formatting.
- **Development Tools**: Drizzle Kit for migrations, TypeScript with strict mode.