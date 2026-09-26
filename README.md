# StockSense

StockSense is a modular Inventory Management System (IMS) that digitizes and streamlines stock-related operations within a business, replacing manual registers, spreadsheets, and scattered tracking methods with a centralized, real-time app.

## Target Users

- **Inventory Managers** — manage incoming and outgoing stock
- **Warehouse Staff** — perform transfers, picking, shelving, and counting

## Authentication

- Sign up / log in
- OTP-based password reset
- Redirect to Inventory Dashboard after login

## Dashboard

Landing page showing a real-time snapshot of inventory operations.

**KPIs**
- Total Products in Stock
- Low Stock / Out of Stock Items
- Pending Receipts
- Pending Deliveries
- Internal Transfers Scheduled

**Dynamic Filters**
- By document type: Receipts / Delivery / Internal / Adjustments
- By status: Draft, Waiting, Ready, Done, Canceled
- By warehouse or location
- By product category

## Navigation

1. **Products** — create/update products, stock availability per location, categories, reordering rules
2. **Operations**
   - Receipts (Incoming Stock)
   - Delivery Orders (Outgoing Stock)
   - Inventory Adjustment
   - Move History
3. **Dashboard**
4. **Settings** — Warehouse
5. **Profile Menu** (left sidebar) — My Profile, Logout

## Core Features

### 1. Product Management
Create products with Name, SKU/Code, Category, Unit of Measure, and optional initial stock.

### 2. Receipts (Incoming Goods)
Used when items arrive from vendors.
1. Create a new receipt
2. Add supplier and products
3. Input quantities received
4. Validate → stock increases automatically

*Example: Receive 50 units of "Steel Rods" → stock +50*

### 3. Delivery Orders (Outgoing Goods)
Used when stock leaves the warehouse for customer shipment.
1. Pick items
2. Pack items
3. Validate → stock decreases automatically

*Example: Sales order for 10 chairs → Delivery order reduces chairs by 10*

### 4. Internal Transfers
Move stock inside the company (e.g. Main Warehouse → Production Floor, Rack A → Rack B, Warehouse 1 → Warehouse 2). Every movement is logged in the ledger.

### 5. Stock Adjustments
Fix mismatches between recorded stock and physical count.
- Select product/location
- Enter counted quantity
- System auto-updates and logs the adjustment

## Additional Features

- Alerts for low stock
- Multi-warehouse support
- SKU search and smart filters

## Inventory Flow Example

1. Receive 100 kg Steel → Stock: +100
2. Internal transfer: Main Store → Production Rack → Stock unchanged in total, location updated
3. Deliver 20 steel → Stock: -20
4. Adjust 3 kg damaged steel → Stock: -3

Everything is logged in the Stock Ledger.

## Tech Stack

### Frontend
- React 18
- Vite
- TypeScript

### Backend
- FastAPI (Python 3.11)
- PostgreSQL 16
- SQLAlchemy 2.0 (async) + Alembic
- Redis (cache, rate limiting, OTP)

## Project Structure

```text
stocksense/
├── backend/      FastAPI application
├── frontend/     React + Vite application
└── README.md
```

## Getting Started

### Prerequisites

- Node.js 18+
- Python 3.11+
- PostgreSQL 16
- Redis

### Backend Setup

```bash
cd backend
python -m venv venv
source venv/bin/activate
pip install -r requirements.txt
cp .env.example .env
alembic upgrade head
uvicorn app.main:app --reload
```

### Frontend Setup

```bash
cd frontend
npm install
npm run dev
```

## Environment Variables

See `backend/.env.example` for required backend configuration, including database connection, Redis, JWT settings, and email provider credentials.

## Deployment

- **Frontend:** Deployed on Vercel
- **Backend:** Deployed on Render (FastAPI service, managed PostgreSQL, managed Key Value store)

## Design Reference

Mockup: https://link.excalidraw.com/l/65VNwvy7c4X/3ENvQFu9o8R

## License

This project is currently unlicensed.
