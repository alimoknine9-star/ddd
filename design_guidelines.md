# Restaurant Management System - Design Guidelines

## Design Approach

**Hybrid Strategy**: Utility-first design system for staff interfaces + Experience-focused customer interface

**Staff Interfaces** (Waiter/Kitchen/Cashier/Admin): Material Design principles - optimized for data density, quick scanning, and operational efficiency

**Customer Interface** (QR Menu): Inspired by modern food delivery apps (UberEats, DoorDash) - visually appealing, image-rich, appetite-driven design

## Typography

**System Fonts**:
- Primary: Inter (via Google Fonts) - all staff interfaces
- Customer: Poppins (via Google Fonts) - QR menu interface
  
**Hierarchy**:
- Hero/Page Titles: text-4xl to text-5xl, font-bold
- Section Headers: text-2xl to text-3xl, font-semibold
- Card Titles: text-lg, font-semibold
- Body Text: text-base, font-normal
- Labels/Meta: text-sm, font-medium
- Timestamps/Secondary: text-xs, font-normal

## Layout System

**Spacing Primitives**: Tailwind units of 2, 4, 6, 8, and 12
- Component padding: p-4 or p-6
- Card spacing: gap-4 or gap-6
- Section margins: mb-8 or mb-12
- Page padding: p-6 or p-8

**Grid System**:
- Staff dashboards: 12-column grid with sidebar navigation
- Customer menu: Single column mobile, 2-column tablet (md:grid-cols-2)
- Kitchen queue: 2-3 column card layout (lg:grid-cols-3)

## Component Library

### Navigation

**Staff Interfaces**:
- Persistent left sidebar (w-64) with role-specific menu items
- Top bar with user info, notifications bell, and logout
- Icons from Heroicons (solid variants)

**Customer Interface**:
- Sticky top bar with table number and cart icon
- Bottom floating cart summary (mobile-optimized)
- Category pills for menu filtering (horizontal scroll)

### Cards & Containers

**Order Cards** (Kitchen/Waiter):
- Border-left status indicator (4px width)
- Table number badge (top-right corner)
- Item list with quantities
- Timestamp and action buttons (bottom)
- Status tags with distinct backgrounds

**Menu Item Cards** (Customer):
- Large food image (aspect-ratio-square or 4:3)
- Title, description (2-line clamp), price
- Add to cart button overlaid on image (backdrop-blur-md)
- Special tags (vegetarian, spicy, popular) as small badges

**Table Status Cards** (Waiter):
- Large table number (text-3xl)
- Status chip (occupied/free/reserved)
- Current order count
- Time since seated
- Click to view details

### Forms & Inputs

**Consistent Treatment**:
- Full-width inputs with clear labels
- Border focus states (ring-2)
- Helper text below inputs
- Error states with red accent
- Placeholder text for guidance

**Payment Forms** (Cashier):
- Large number pad for cash entry
- Payment method toggle buttons
- Split bill calculator
- Receipt preview panel

### Data Displays

**Order Queue** (Kitchen):
- Time-sorted list view
- Expandable order details
- Large "Mark Ready" buttons
- Preparation timer indicators

**Tab/Bill Display** (Cashier):
- Line-item table with quantities
- Subtotal, tax, service charge rows
- Cancellations shown as strikethrough
- Total in large, bold typography

### Buttons & Actions

**Primary Actions**: 
- Solid backgrounds, rounded-lg, py-3 px-6, font-semibold
- Customer CTAs: Large touch targets (min-h-12)

**Secondary Actions**: 
- Outline style, same sizing as primary

**Danger Actions** (Cancel/Delete): 
- Red accent, require confirmation modal

**Status Update Buttons** (Kitchen):
- Icon + text, full-width on mobile
- Progress-based coloring

### Modals & Overlays

**Confirmation Dialogs**:
- Centered, max-w-md
- Clear title and explanation
- Two-button layout (Cancel + Confirm)

**Order Details Modal** (Waiter):
- Full-screen on mobile
- Sidebar on desktop
- Item list with modification options
- Customer notes prominently displayed

**Call Waiter Notification**:
- Toast notification (top-right)
- Table number + reason
- Quick action buttons

## Status & Feedback

**Status Colors** (Semantic, not specified but structure defined):
- Queued/Pending: Neutral indicator
- Preparing: Active indicator
- Almost Ready: Warning indicator
- Ready: Success indicator
- Delivered: Completed indicator
- Canceled: Error indicator

**Loading States**:
- Skeleton screens for data tables
- Spinner for button actions
- Shimmer effect for image loading

**Real-time Updates**:
- Subtle pulse animation on new orders
- Sound notification option for kitchen/waiter
- Badge counts on navigation items

## Images

**Customer QR Menu Interface**:
- Hero section: NO large hero image - jump straight to menu categories
- Menu item images: Required for every dish (aspect-ratio-4/3, rounded-lg, object-cover)
- Category headers: Small decorative images (h-32, w-full, subtle overlay)
- Empty states: Illustrated graphics for empty cart

**Staff Interfaces**:
- No hero images
- Icon-based navigation
- Optional: Small restaurant logo in sidebar header
- Empty states: Simple icon + text combinations

**Image Specifications**:
- Menu items: 400x300px minimum, optimized WebP format
- Icons: Heroicons library, 20px or 24px sizes
- Logos: SVG format, max height 40px

## Screen-Specific Layouts

**Customer (Mobile-First)**:
- Sticky category navigation at top
- Grid of menu cards (1 col mobile, 2 col tablet)
- Floating cart button (bottom-right, with backdrop-blur)
- Cart drawer slides from bottom

**Waiter Dashboard**:
- Sidebar + main content area
- Table grid view (3-4 columns desktop)
- Quick actions toolbar
- Order confirmation panel (right sidebar)

**Kitchen Screen**:
- Full-width order queue
- Timer display at top
- Filter by status tabs
- Audio alert controls

**Cashier**:
- Split view: Table list (left) + Bill details (right)
- Calculator-style payment input
- Receipt preview section
- Payment history below fold

**Admin**:
- Tabbed interface (Menu/Tables/QR/Users/Reports)
- Data tables with search and filters
- Form-heavy layouts for CRUD operations
- Dashboard with key metrics at top