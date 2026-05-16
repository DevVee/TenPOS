# TenPOS Backend

Node.js + Express + PostgreSQL REST API for TenPOS — Ten Foundation Philippines Inc.

## Prerequisites

- Node.js 18+
- PostgreSQL 14+

## Setup

```bash
# 1. Install dependencies
npm install

# 2. Copy env and configure
cp .env.example .env
# Edit .env with your DB credentials and secrets

# 3. Create database
createdb tenpos

# 4. Run migration (creates all tables)
npm run migrate

# 5. Seed demo data
npm run seed

# 6. Start dev server
npm run dev
```

Server runs at `http://localhost:4000`

## API Endpoints

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | /api/auth/login | Public | Login |
| POST | /api/auth/refresh | Public | Refresh token |
| POST | /api/auth/logout | Bearer | Logout |
| GET | /api/auth/me | Bearer | Current user |
| POST | /api/auth/pin | Bearer | Set PIN |
| POST | /api/auth/pin/verify | Bearer | Verify PIN |
| GET | /api/products | Cashier+ | List products |
| POST | /api/products | Manager+ | Create product |
| GET | /api/products/:id | Cashier+ | Get product |
| PUT | /api/products/:id | Manager+ | Update product |
| DELETE | /api/products/:id | Manager+ | Deactivate product |
| GET | /api/products/barcode/:barcode | Cashier+ | Lookup by barcode |
| GET | /api/products/categories | Cashier+ | List categories |
| POST | /api/products/categories | Manager+ | Create category |
| GET | /api/inventory | Cashier+ | List inventory |
| GET | /api/inventory/low-stock | Cashier+ | Low stock items |
| PUT | /api/inventory/:productId | Manager+ | Set stock |
| GET | /api/inventory/adjustments | Manager+ | List adjustments |
| POST | /api/inventory/adjustments | Manager+ | Log adjustment |
| GET | /api/transactions | Cashier+ | List transactions |
| POST | /api/transactions | Cashier+ | Create sale |
| GET | /api/transactions/:id | Cashier+ | Get transaction |
| POST | /api/transactions/:id/void | Manager+ | Void transaction |
| POST | /api/transactions/:id/return | Manager+ | Process return |
| GET | /api/reports/sales | Manager+ | Sales analytics |
| GET | /api/reports/staff | Manager+ | Staff performance |
| GET | /api/reports/financial | Manager+ | Z-report / VAT |
| GET | /api/reports/inventory | Manager+ | Inventory analysis |
| GET | /api/staff | Manager+ | List staff |
| POST | /api/staff | Admin | Create staff |
| PUT | /api/staff/:id | Admin | Update staff |
| DELETE | /api/staff/:id | Admin | Deactivate staff |
| GET | /api/branches | Any | List branches |
| POST | /api/branches | Admin | Create branch |
| PUT | /api/branches/:id | Admin | Update branch |
| GET | /api/vouchers | Manager+ | List vouchers |
| POST | /api/vouchers | Manager+ | Create voucher |
| POST | /api/vouchers/validate | Cashier+ | Validate code |
| GET | /api/audit | Manager+ | Audit log |

## WebSocket Events

Connect with `{ auth: { token: '<access_token>' } }` to `ws://localhost:4000`.

| Event | Description |
|-------|-------------|
| `transaction:created` | New sale completed |
| `transaction:voided` | Transaction voided |
| `inventory:updated` | Stock changed |
| `inventory:low_stock` | Item below reorder point |
| `inventory:adjusted` | Manual stock adjustment |

## Demo Accounts

| Email | Password | Role |
|-------|----------|------|
| admin@tenpos.ph | password | Admin |
| manager@tenpos.ph | password | Manager |
| cashier@tenpos.ph | password | Cashier |
| viewer@tenpos.ph | password | Viewer |

PIN for all accounts: `1234`
