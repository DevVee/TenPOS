# TenPOS — Full Development Plan
> **Last updated:** 2026-05-20  
> **Author:** DevVee  
> **Stack:** React + Vite (Web) · React Native + Expo (Mobile APK) · Supabase (Backend + Sync) · Vercel (Web Hosting)

---

## 🎯 Product Vision

TenPOS is a **Point of Sale system** built for retail use on:
- **Web** — manager dashboard, reports, product/staff management (Vercel hosted)
- **Android Tablet APK** — cashier POS terminal, offline-first, syncs to cloud

The system must work **without internet on mobile** and sync all transactions to the cloud when connectivity is restored.

---

## 🏗️ Final Architecture (Target)

```
TenPOS/
├── web/              → React + Vite → deployed on Vercel
├── mobile/           → React Native + Expo → builds to Android APK
├── shared/           → Shared types, hooks, utils, stores (npm workspace)
├── backend/          → Node.js API (reserved, not needed in early phases)
├── DEVPLAN.md        → This file
└── package.json      → npm workspaces root config
```

### Data Flow
```
[Mobile Tablet]  ──(offline)──→  [Local SQLite]
                                       │
                          (sync when online)
                                       ↓
                              [Supabase Cloud DB]
                                       │
                              (real-time / fetch)
                                       ↓
                               [Web Dashboard]  ──→  [Vercel]
```

### Tech Choices Explained
| Layer          | Choice         | Why |
|----------------|----------------|-----|
| Web frontend   | React + Vite   | Already built, fast, Vercel-ready |
| Mobile         | React Native + Expo | APK output, shares business logic with web |
| Shared logic   | npm workspace  | One source of truth for types, hooks, utils |
| Database       | Supabase (PostgreSQL) | Auth + DB + Realtime + Storage in one |
| Web hosting    | Vercel         | Free tier, auto-deploy from GitHub |
| Offline DB     | expo-sqlite    | Native SQLite on Android, no server needed |
| Sync strategy  | Custom queue + Supabase | Simple, no extra dependency |
| State mgmt     | Zustand        | Already in use, works in RN too |

---

## 📦 Monorepo: npm Workspaces

The root `package.json` defines three packages:

```json
{
  "workspaces": ["web", "mobile", "shared"]
}
```

Each folder has its own `package.json`. The `shared` package is:
```json
{
  "name": "@tenpos/shared",
  "version": "1.0.0"
}
```

Web and mobile both declare: `"@tenpos/shared": "*"` in their dependencies.

---

## 🗃️ Database Schema (Supabase / PostgreSQL)

### Core Tables

```sql
-- Branches (for multi-store support)
branches          id, name, address, is_active

-- Products & Inventory
products          id, branch_id, name, sku, category_id, price, cost, image_url, is_active
categories        id, name, color
stock_levels      id, product_id, branch_id, quantity, low_stock_threshold
stock_adjustments id, product_id, branch_id, delta, reason, staff_id, created_at

-- Staff & Auth
staff             id, branch_id, name, role (owner|manager|cashier), pin_hash, email, is_active
-- Auth handled by Supabase Auth, staff table links to auth.users

-- Transactions (Sales)
transactions      id, branch_id, staff_id, total, discount, tax, payment_method, status, 
                  receipt_no, created_at, synced_at
transaction_items id, transaction_id, product_id, qty, unit_price, subtotal

-- Returns
returns           id, transaction_id, staff_id, reason, total, created_at
return_items      id, return_id, transaction_item_id, qty, refund_amount

-- Shifts
shifts            id, branch_id, staff_id, opened_at, closed_at, opening_cash, 
                  closing_cash, total_sales, status

-- Vouchers / Discounts
vouchers          id, branch_id, code, type (percent|fixed), value, min_purchase, 
                  expiry, is_active, used_count, max_uses
```

### Supabase RLS (Row Level Security)
- Each row scoped to `branch_id`
- Managers can read/write their branch
- Cashiers can only write transactions, read products
- Owner can read/write all branches

---

## 🔄 Sync Strategy (Offline-First Mobile)

### How it works:
1. **All POS actions on mobile write to local SQLite first** (never blocked by network)
2. A sync queue tracks every change with a `status`: `pending | syncing | synced | failed`
3. When internet is detected, the sync worker runs:
   - Uploads all `pending` transactions in order
   - Downloads product/price updates from Supabase
   - Marks rows as `synced`
4. **Conflicts**: Last-write-wins for product updates; transactions are append-only (no conflict)

### Local SQLite Tables (mobile only)
```
local_transactions      → mirrors transactions + transaction_items
sync_queue              id, table_name, record_id, action (insert/update/delete), 
                        payload (JSON), status, attempts, created_at
products_cache          → local copy of products, updated from server
settings_cache          → branch settings, tax rate, etc.
```

---

---

# 📅 PHASES

---

## ✅ Phase 0 — Monorepo Foundation
**Goal:** Restructure the repo into web/mobile/shared. Nothing breaks, no UI change.  
**Time estimate:** 1–2 days  
**Status:** 🔲 Not started

### Tasks:
- [ ] Create root `package.json` with `"workspaces": ["web","mobile","shared"]`
- [ ] Move current root frontend → `web/`
- [ ] Create `shared/` package scaffold:
  - `shared/package.json` (name: `@tenpos/shared`)
  - `shared/src/types/index.ts` → empty, types will be extracted here
  - `shared/src/utils/index.ts`
  - `shared/src/hooks/index.ts`
  - `shared/src/store/index.ts`
  - `shared/tsconfig.json`
- [ ] Create `mobile/` scaffold (copy of web for now, Vite still)
- [ ] Add `@tenpos/shared` as dependency in `web/package.json` and `mobile/package.json`
- [ ] Configure TypeScript path alias `@tenpos/shared` in web and mobile tsconfigs
- [ ] Run `npm install` at root to link workspaces
- [ ] Verify `web/` still runs (`npm run dev` from `web/`)

### Deliverable:
```
TenPOS/
├── web/        ← working React Vite app
├── mobile/     ← copy of web (placeholder)
├── shared/     ← empty package, linked
└── package.json ← workspaces config
```

---

## ✅ Phase 1 — Extract Shared Logic
**Goal:** Move all business logic that both web and mobile will use into `shared/`.  
**Time estimate:** 2–3 days  
**Status:** 🔲 Not started  
**Depends on:** Phase 0

### What to move to `shared/`:
- [ ] **Types** — all TypeScript interfaces from `web/src/types/index.ts` → `shared/src/types/`
- [ ] **Zustand stores** — cart store, settings store, auth store → `shared/src/store/`
- [ ] **Utils** — price formatting, tax calculation, receipt number generator → `shared/src/utils/`
- [ ] **Business hooks** — `useCart`, `useProducts`, `useTransaction` → `shared/src/hooks/`
- [ ] **Constants** — tax rate, payment methods, roles, status codes → `shared/src/constants/`

### What stays in `web/` only:
- All UI components (they use HTML + Tailwind, unusable in React Native)
- React Router setup
- Vite config
- `web/src/lib/api.ts` (Supabase client — will be in shared later, but only after Phase 3)

### After extraction:
- [ ] Update all `web/` imports to use `@tenpos/shared`
- [ ] Ensure `web/` builds without errors
- [ ] Ensure `mobile/` (still Vite) also builds using shared

### Deliverable:
- `web/` imports from `@tenpos/shared` for types, stores, utils
- Both apps build cleanly

---

## ✅ Phase 2 — Supabase Backend Setup
**Goal:** Set up the Supabase project, schema, auth, and RLS policies.  
**Time estimate:** 2–3 days  
**Status:** 🔲 Not started  
**Depends on:** Phase 0 (can run in parallel with Phase 1)

### Tasks:
- [ ] Create Supabase project at supabase.com
- [ ] Set up environment variables:
  - `SUPABASE_URL`
  - `SUPABASE_ANON_KEY`
  - `SUPABASE_SERVICE_ROLE_KEY` (backend/admin use only, never in frontend)
- [ ] Write and run SQL migrations for all core tables (see schema above)
- [ ] Enable Row Level Security on all tables
- [ ] Write RLS policies per role (owner, manager, cashier)
- [ ] Set up Supabase Auth:
  - Email/password for managers and owners (web login)
  - PIN login for cashiers (custom — PIN stored as hashed in staff table, not Supabase Auth)
- [ ] Set up Supabase Storage bucket for product images (`products` bucket, public read)
- [ ] Seed initial data:
  - 1 branch
  - 1 owner account
  - Sample categories and products
- [ ] Test all queries from Supabase SQL editor

### Deliverable:
- Supabase project live with schema, auth, and seed data
- `.env.example` updated with all required keys

---

## ✅ Phase 3 — Web → Supabase Integration
**Goal:** Connect the web app to Supabase. Replace local-only data with real DB.  
**Time estimate:** 3–5 days  
**Status:** 🔲 Not started  
**Depends on:** Phase 1, Phase 2

### Tasks:
- [ ] Install `@supabase/supabase-js` in `web/`
- [ ] Create `web/src/lib/supabase.ts` (Supabase client)
- [ ] Move Supabase client to `shared/src/lib/supabase.ts` so mobile can reuse
- [ ] Implement auth:
  - [ ] Login page (email/password via Supabase Auth)
  - [ ] PIN login for cashiers (lookup staff table, compare hash)
  - [ ] Auth state in Zustand (`shared/src/store/authStore.ts`)
  - [ ] Protected routes in web
- [ ] Products: replace mock/Dexie data with Supabase CRUD
  - [ ] List products (with search, filter by category)
  - [ ] Create / edit / delete product
  - [ ] Upload product image to Supabase Storage
- [ ] Transactions: save to Supabase on checkout
- [ ] Staff management CRUD
- [ ] Inventory: stock levels, adjustments
- [ ] Reports: query transactions by date range
- [ ] Real-time: subscribe to stock updates (Supabase Realtime)
- [ ] Deploy to Vercel:
  - [ ] Connect GitHub repo to Vercel
  - [ ] Set root directory to `web/`
  - [ ] Add environment variables in Vercel dashboard
  - [ ] Test production build

### Deliverable:
- Web app fully connected to Supabase, deployed on Vercel
- Auth, products, transactions, reports all working

---

## ✅ Phase 4 — React Native + Expo Setup
**Goal:** Convert `mobile/` from Vite/React to React Native + Expo. Scaffold all screens.  
**Time estimate:** 3–5 days  
**Status:** 🔲 Not started  
**Depends on:** Phase 1

> ⚠️ This phase converts the placeholder mobile app to actual React Native.  
> UI components must be rebuilt using RN primitives (View, Text, TouchableOpacity, etc.)  
> Business logic is reused from `@tenpos/shared` — only UI changes.

### Tasks:
- [ ] Initialize Expo project inside `mobile/`:
  - `npx create-expo-app@latest mobile --template blank-typescript`
- [ ] Install dependencies:
  - `@react-navigation/native` + `@react-navigation/stack`
  - `expo-sqlite` (offline DB)
  - `@supabase/supabase-js` (sync)
  - `zustand` (from shared)
  - `expo-network` (detect online/offline)
  - `expo-secure-store` (store auth tokens)
  - `expo-barcode-scanner` (optional, for product scan)
  - `react-native-paper` OR custom UI components
- [ ] Configure `@tenpos/shared` import in Expo (Metro bundler needs special config)
- [ ] Set up React Navigation with these screens:
  - `LoginScreen` — PIN or email login
  - `POSScreen` — main cashier terminal
  - `PaymentScreen` — checkout / payment
  - `ReceiptScreen` — post-sale receipt
  - `ProductsScreen` — browse/search products
  - `ShiftScreen` — open/close shift
  - `SyncStatusScreen` — show pending syncs
- [ ] Build POS UI optimized for **10-inch Android tablet** (landscape mode):
  - Left panel: product grid
  - Right panel: cart
  - Bottom bar: total + payment button
- [ ] Configure `app.json`:
  - App name: TenPOS
  - Android package: `com.tenpos.app`
  - Orientation: landscape
  - Tablet optimized
- [ ] Test on Android emulator

### Deliverable:
- Expo app runs in Expo Go on tablet
- All screens navigable, UI complete (using shared business logic)

---

## ✅ Phase 5 — Offline-First Mobile Data Layer
**Goal:** All POS operations on mobile work 100% without internet using SQLite.  
**Time estimate:** 3–4 days  
**Status:** 🔲 Not started  
**Depends on:** Phase 4

### Tasks:
- [ ] Set up `expo-sqlite` database in `mobile/src/lib/localDb.ts`
- [ ] Create local tables:
  - `transactions`, `transaction_items`
  - `products_cache`
  - `sync_queue`
  - `shifts`
  - `settings_cache`
- [ ] Write local DB service layer:
  - `localDb.saveTransaction(tx)`
  - `localDb.getProducts()`
  - `localDb.getPendingSync()`
- [ ] Implement sync queue:
  - On every write → add to `sync_queue` with status `pending`
  - `syncWorker.ts` → runs every 30 seconds when online
  - Reads all `pending` items → uploads to Supabase → marks `synced`
  - Handles retry on failure (max 3 attempts, then `failed`)
- [ ] Network detection:
  - Use `expo-network` to watch connectivity
  - Show sync status badge in UI (🔴 offline / 🟡 syncing / 🟢 synced)
- [ ] Product cache sync:
  - On app start (if online): download latest products from Supabase → store in SQLite
  - On app start (if offline): use cached products
  - Show "Last synced: X mins ago" in UI

### Deliverable:
- App works fully offline (POS, cart, checkout all work)
- Sync queue visible in SyncStatusScreen
- Transactions queued and sent when online

---

## ✅ Phase 6 — Mobile ↔ Supabase Sync
**Goal:** Actually sync queued mobile transactions to Supabase and pull updates.  
**Time estimate:** 2–3 days  
**Status:** 🔲 Not started  
**Depends on:** Phase 3, Phase 5

### Tasks:
- [ ] Implement `syncWorker.ts`:
  - Read all `pending` from `sync_queue`
  - `INSERT` transactions into Supabase
  - `INSERT` transaction_items
  - Update stock levels in Supabase
  - Mark local row as `synced`
  - Pull product updates (new prices, deactivated items) from Supabase
- [ ] Handle auth on mobile:
  - Cashier PIN → fetch staff record from cache
  - Store Supabase session token in `expo-secure-store`
  - Refresh token silently in background
- [ ] Conflict resolution rules:
  - Transactions are **append-only** — no conflict possible
  - Product prices: server wins (mobile always pulls latest)
  - Stock: reconcile via adjustments log
- [ ] Real-time push (optional, Phase 6+):
  - Supabase Realtime subscription for product price changes
  - So a manager can update a price on web and it appears on tablet immediately (if online)
- [ ] Test end-to-end:
  - [ ] Make 5 sales offline
  - [ ] Go online
  - [ ] Verify all 5 appear in Supabase
  - [ ] Verify stock levels updated on web dashboard

### Deliverable:
- Full offline → online sync working
- Web dashboard shows real-time tablet sales

---

## ✅ Phase 7 — APK Build & Tablet Deployment
**Goal:** Generate a signed Android APK that installs on any Android tablet.  
**Time estimate:** 1–2 days  
**Status:** 🔲 Not started  
**Depends on:** Phase 5, Phase 6

### Tasks:
- [ ] Set up Expo EAS (Expo Application Services):
  - `npm install -g eas-cli`
  - `eas login`
  - `eas build:configure`
- [ ] Configure `eas.json`:
  ```json
  {
    "build": {
      "production": {
        "android": { "buildType": "apk" }
      }
    }
  }
  ```
- [ ] Set up EAS environment variables (Supabase keys)
- [ ] Generate Android keystore (for signing APK)
- [ ] Build APK:
  - `eas build --platform android --profile production`
  - Build runs on Expo cloud servers (~10-15 min)
  - Download signed `.apk` file
- [ ] Test APK on physical Android tablet:
  - Enable "Install unknown apps" on tablet
  - Transfer APK via USB or download link
  - Install and test all offline/sync scenarios
- [ ] Set up OTA (Over-the-Air) updates:
  - `eas update` — push JS bundle updates without rebuilding APK
  - Future bugfixes can be deployed without reinstalling APK

### Deliverable:
- Signed `.apk` file that installs and runs on any Android tablet
- OTA update pipeline ready

---

## ✅ Phase 8 — Polish, Hardware & Production
**Goal:** Production-ready system with receipt printing, barcode scanning, and monitoring.  
**Time estimate:** 1–2 weeks  
**Status:** 🔲 Not started  
**Depends on:** Phase 7

### Tasks:
- [ ] **Receipt printing** (Bluetooth thermal printer — e.g., Epson TM-m30):
  - `react-native-bluetooth-escpos-printer`
  - Format receipt with logo, items, total, change
  - Test with physical printer
- [ ] **Barcode/QR scanning** (to find products faster):
  - `expo-barcode-scanner` or `expo-camera`
  - Scan product barcode → auto-search in POS
- [ ] **Error tracking**:
  - `Sentry` for both web and mobile
  - Capture crashes, failed syncs, API errors
- [ ] **Analytics** (optional):
  - Custom reports: top products, peak hours, staff performance
  - Charts using Recharts (web) / Victory Native (mobile)
- [ ] **Multi-branch**:
  - Branch selector at login
  - Each tablet locked to one branch
  - Web shows all branches (owner) or one branch (manager)
- [ ] **Security hardening**:
  - Auto-logout after inactivity (web + mobile)
  - Require PIN re-entry for refunds/discounts
  - Audit log for all sensitive actions
- [ ] **Performance**:
  - Paginate product lists (large catalogues)
  - Index database queries
  - Compress product images on upload
- [ ] **Backup**:
  - Supabase handles DB backups (daily on free tier, PITR on Pro)
  - Export to CSV from web dashboard

### Deliverable:
- Production-ready system
- Receipt printing works
- Barcode scanning works
- Error monitoring live

---

## 🚀 Deployment Summary

| Component | Platform | URL / Method |
|-----------|----------|--------------|
| Web app | Vercel | `https://tenpos.vercel.app` (or custom domain) |
| Database | Supabase | `https://your-project.supabase.co` |
| Mobile app | APK (sideload or Play Store) | Manual install on tablets |
| OTA updates | Expo EAS Update | Auto on app launch |

---

## ⚡ Environment Variables

```env
# Supabase (used by web + mobile)
VITE_SUPABASE_URL=https://xxxx.supabase.co
VITE_SUPABASE_ANON_KEY=eyJ...

# Web only (Vercel)
VITE_APP_URL=https://tenpos.vercel.app

# Mobile only (Expo)
EXPO_PUBLIC_SUPABASE_URL=https://xxxx.supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=eyJ...
```

> ⚠️ Never commit `.env` files. Use Vercel dashboard for web env vars, EAS Secrets for mobile.

---

## 📊 Phase Summary Table

| Phase | Name | Effort | Status |
|-------|------|--------|--------|
| 0 | Monorepo Foundation | 1–2 days | 🔲 |
| 1 | Extract Shared Logic | 2–3 days | 🔲 |
| 2 | Supabase Backend Setup | 2–3 days | 🔲 |
| 3 | Web → Supabase Integration | 3–5 days | 🔲 |
| 4 | React Native + Expo Setup | 3–5 days | 🔲 |
| 5 | Offline-First Mobile | 3–4 days | 🔲 |
| 6 | Mobile ↔ Supabase Sync | 2–3 days | 🔲 |
| 7 | APK Build & Deployment | 1–2 days | 🔲 |
| 8 | Polish & Production | 1–2 weeks | 🔲 |

**Total estimate:** ~3–6 weeks (solo dev, part-time)

---

## 🔑 Key Decisions Made

1. **Shared package via npm workspaces** — no Nx/Turborepo needed at this scale
2. **Supabase over custom Node backend** — auth, DB, realtime, storage all handled; no server to maintain
3. **expo-sqlite for offline** — native SQLite, no third-party sync library needed
4. **APK via EAS Build** — no need for Android Studio locally, Expo builds in the cloud
5. **No Play Store (for now)** — sideload APK directly to business tablets; Play Store in Phase 8+ if needed
6. **Zustand in shared** — works in both React and React Native, no context API mess
7. **Vercel for web** — free tier, zero-config deploy from GitHub, environment variables handled

---

## 📝 Notes

- The `/backend` folder in the repo is reserved for future custom API if Supabase limitations are hit
- `TenPayroll` (the HR/payroll system) is a separate future project, not part of TenPOS phases
- All phases are **additive** — each phase produces a working, deployable state
- Do NOT add Supabase to mobile until Phase 6 — offline-first must be solid first

---

*This document is the single source of truth for TenPOS development. Update phase statuses as work completes.*
