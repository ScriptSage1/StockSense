# StockSense

Inventory management for warehouse teams. Track products across multiple warehouses, move stock in, out and between locations, and see what needs attention on a live dashboard.

- **Products and stock:** per-location quantities, reorder points and low-stock email alerts
- **Operations:** receipts, deliveries, internal transfers and stock adjustments, each with a draft → ready → done workflow
- **Full history:** every stock change is written to a ledger that can never be edited or deleted
- **Dashboard:** stock health, 14-day stock movement, open work by stage, and a "needs you" list
- **Secure sign-in:** password plus a 6-digit code sent by email, for sign-up, sign-in and password changes
- **Roles:** managers and staff, with permissions enforced by the server

| Part | Built with |
|---|---|
| `backend/` | Python 3.11, FastAPI, PostgreSQL 16, SQLAlchemy 2 (async), Alembic, Redis, pytest |
| `frontend/` | React 18, TypeScript, Vite, Tailwind CSS, TanStack Query, Framer Motion, Vitest |

The two apps run separately. The frontend only talks to the backend through its HTTP API (`/api/v1`).

---

## Contents

1. [Quick start](#quick-start)
2. [Email and sign-in codes](#email-and-sign-in-codes)
3. [Project structure](#project-structure)
4. [How it works](#how-it-works)
5. [Configuration](#configuration)
6. [Running the tests](#running-the-tests)
7. [Deploying](#deploying)
8. [Troubleshooting](#troubleshooting)

---

## Quick start

### 1. Install the prerequisites

- **Python 3.11**
- **Node.js 20 or newer**
- **PostgreSQL 16**
- **Redis 7 or newer.** No Redis? See [running without Redis](#no-redis-or-no-admin-rights).

### 2. Create the databases

```bash
psql -U postgres -c "CREATE USER stocksense WITH PASSWORD 'stocksense' CREATEDB;"
psql -U postgres -c "CREATE DATABASE stocksense OWNER stocksense;"
psql -U postgres -c "CREATE DATABASE stocksense_test OWNER stocksense;"
```

The second database is only used by the test suite.

### 3. Start the backend

```bash
cd backend
python -m venv .venv
source .venv/bin/activate          # Windows: .venv\Scripts\activate
pip install -r requirements.txt
cp .env.example .env               # Windows: copy .env.example .env
```

Open `backend/.env` and set `SECRET_KEY` to a long random string. You can generate one with:

```bash
python -c "import secrets; print(secrets.token_urlsafe(48))"
```

Then create the tables, add sample data and start the server:

```bash
alembic upgrade head               # creates the tables, categories and a default warehouse
python -m app.seed                 # optional: sample products, operations and two demo accounts
uvicorn app.main:app --reload --port 8000
```

The API is now at http://localhost:8000, with interactive docs at http://localhost:8000/api/docs.

### 4. Start the frontend

In a second terminal:

```bash
cd frontend
npm install
cp .env.example .env               # Windows: copy .env.example .env
npm run dev
```

Open **http://localhost:5173**.

### 5. Sign in

Create an account from the sign-in page. **The first account to confirm its email becomes the manager.** Everyone after that joins as staff, and a manager can promote them under *Settings → Team*.

Signing in needs a code sent by email, so set up email first. See the next section.

The seeder also creates two demo accounts. Their addresses aren't real inboxes, so you can only sign in with them when you use the [local inbox](#option-a-local-inbox-for-development).

| Email | Password | Role |
|---|---|---|
| `manager@stocksense.dev` | `Manager123` | Manager |
| `staff@stocksense.dev` | `Staff12345` | Staff |

---

## Email and sign-in codes

Sign-up, sign-in, password changes and password resets all send a 6-digit code by email. Codes expire after 10 minutes, allow 5 attempts, and are never shown on screen or returned by the API. Pick one of these ways to deliver them.

### Option A: local inbox (for development)

Catches every email on your own computer and shows it in the browser. Nothing is actually sent.

```bash
cd backend
pip install aiosmtpd
python ../devtools/mail_inbox.py
```

In `backend/.env`, set:

```
SMTP_HOST=127.0.0.1
SMTP_PORT=1025
```

Restart the backend, then read codes at **http://localhost:8025**. (Mailhog works the same way if you already have it.)

### Option B: Gmail (real email, no extra service)

1. On the Google account you want to send from, turn on **2-Step Verification**.
2. Go to **Google Account → Security → 2-Step Verification → App passwords** and create one. Copy the 16-character password.
3. In `backend/.env`, set:

   ```
   EMAIL_FROM=StockSense <you@gmail.com>
   SMTP_HOST=smtp.gmail.com
   SMTP_PORT=587
   SMTP_SECURITY=starttls
   SMTP_USERNAME=you@gmail.com
   SMTP_PASSWORD=your-app-password
   ```

4. Restart the backend and send yourself a test email:

   ```bash
   python -m app.send_test_email you@gmail.com
   ```

   It prints Gmail's exact error if something is wrong. Gmail allows about 500 emails a day from a personal account.

> **Never commit `backend/.env`.** It holds your app password and is already listed in `.gitignore`.

### Option C: SendGrid (production)

Set `EMAIL_PROVIDER=sendgrid`, `SENDGRID_API_KEY` and an `EMAIL_FROM` address you have verified in SendGrid.

---

## Project structure

```
StockSense/
├── backend/
│   ├── app/
│   │   ├── api/v1/          HTTP routes (auth, products, operations, dashboard, …)
│   │   ├── core/            settings, security, caching, rate limits, logging
│   │   ├── db/models/       database tables
│   │   ├── schemas/         request and response shapes
│   │   ├── repositories/    database queries
│   │   ├── services/        business rules (stock, operations, sign-in, email)
│   │   ├── seed.py          sample data for development
│   │   └── main.py          app entry point
│   ├── alembic/             database migrations
│   └── tests/
├── frontend/
│   └── src/
│       ├── pages/           one file per screen
│       ├── features/        dashboard charts, sign-in steps, operation forms, …
│       ├── components/ui/   buttons, cards, dialogs and other building blocks
│       ├── api/             API client (tokens, automatic refresh)
│       └── styles/          theme colours
└── devtools/                local stand-ins for Redis and email
```

---

## How it works

### Stock and the ledger

- A product never stores a quantity. Stock lives in one row per product per location, and it can never go below zero.
- Every change to stock is written to the **ledger**, which the database refuses to update or delete. You can always trace where every unit came from.
- Stock only changes when an operation is **validated**. Validation happens in a single database transaction: it locks the rows involved, checks there's enough stock, applies every line and writes the ledger. If anything fails, nothing is applied.
- Initial stock entered when creating a product is recorded as an adjustment, so it appears in the ledger too.

### Operations

| Type | What it does | Reference |
|---|---|---|
| Receipt | Adds stock to a location | `WH/IN/2026/0001` |
| Delivery | Removes stock from a location | `WH/OUT/2026/0001` |
| Transfer | Moves stock between two locations | `WH/INT/2026/0001` |
| Adjustment | Sets stock to a counted quantity (a manager validates it) | `WH/ADJ/2026/0001` |

Each operation moves through **Draft → Waiting → Ready → Done**, or is **Canceled**. The server sets the status itself:

- **Draft:** no lines yet
- **Waiting:** a delivery or transfer whose source doesn't have enough stock yet
- **Ready:** can be validated
- **Done:** validated; stock and ledger updated

A waiting delivery becomes ready automatically once enough stock arrives.

### Signing in

1. The user enters their email and password (or their details, when signing up).
2. The server checks them and emails a 6-digit code. No session exists yet.
3. The user enters the code and is signed in.

Changing a password works the same way: current password, then the code, then the change. It signs out every other session. Codes for one purpose (for example a password reset) can't be used for another (for example signing in).

### Roles

| Action | Manager | Staff |
|---|:-:|:-:|
| Create and edit products | ✅ | ✅ |
| Archive products | ✅ | ❌ |
| Create and validate receipts, deliveries, transfers | ✅ | ✅ |
| Validate adjustments | ✅ | ❌ |
| Cancel operations | ✅ | ❌ |
| Manage warehouses, locations and the team | ✅ | ❌ |

Permissions are checked by the server. The interface only hides what a role can't do.

<details>
<summary><strong>Security details</strong></summary>

| Area | How it's handled |
|---|---|
| Passwords and codes | bcrypt (cost 12). Codes are random, stored hashed, expire after 10 minutes and allow 5 attempts. |
| Access token | JWT, valid 30 minutes. The browser keeps it in memory only, never in storage, cookies or the URL. |
| Refresh token | Random, stored as a SHA-256 hash, valid 7 days. Sent as an `httpOnly`, `Secure`, `SameSite=Strict` cookie. |
| Sign-in challenge | A signed token tied to one purpose. It expires after 30 minutes and stops working when the password changes. |
| Rate limits | 10 sign-in attempts per 15 minutes per IP; 10 sign-in codes and 3 reset codes per email per hour; 30 seconds between resends. |
| Password reset | "Forgot password" always gives the same answer, so it can't reveal which emails exist. Reset links work once, and every session is signed out afterwards. |
| CSRF and CORS | `SameSite=Strict` plus an `Origin` check; an explicit list of allowed origins (no wildcard in production). |
| Headers | `X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy`, `Permissions-Policy`, CSP, and HSTS in production. |
| API docs | Turned off when `APP_ENV=production`. |

</details>

<details>
<summary><strong>Redis, caching and fallbacks</strong></summary>

Redis holds rate-limit counters, the list of used reset tokens, and short-lived caches for warehouses, locations, categories and the dashboard (cleared on every change). Stock, operations and users are never cached.

If Redis goes down, the app keeps working: rate limits switch to in-memory counters, code limits are counted from the database, and reset tokens stay single-use because each one is tied to the password it replaces.

</details>

<details>
<summary><strong>API error format</strong></summary>

Every error has the same shape:

```json
{ "detail": "Insufficient stock for DESK001: 4 available, 6 requested", "code": "INSUFFICIENT_STOCK", "field": "lines[1].quantity" }
```

Validation errors add `errors: [{field, detail}]`, and `INSUFFICIENT_STOCK` adds `shortages`. The full list of endpoints is in the interactive docs at `/api/docs`.

Common codes: `VALIDATION_ERROR`, `NOT_AUTHENTICATED`, `FORBIDDEN`, `MANAGER_REQUIRED`, `NOT_FOUND`, `DUPLICATE_SKU`, `ALREADY_VALIDATED`, `OPERATION_LOCKED`, `INSUFFICIENT_STOCK`, `NO_LINES`, `OTP_INVALID`, `OTP_EXPIRED`, `OTP_MAX_ATTEMPTS`, `OTP_COOLDOWN`, `CHALLENGE_INVALID`, `RATE_LIMITED`, `INTERNAL_ERROR`.

</details>

---

## Configuration

Both apps read settings from a `.env` file. Start from the `.env.example` next to it.

### Backend (`backend/.env`)

| Variable | Default | What it's for |
|---|---|---|
| `APP_ENV` | `development` | `development`, `staging` or `production`. Production turns off the API docs, turns on HSTS and requires a strong secret key. |
| `SECRET_KEY` | *(unsafe dev placeholder)* | Signs tokens. Always set a long random string, at least 32 characters. |
| `FRONTEND_ORIGIN` | `http://localhost:5173` | Where the frontend runs. Comma-separate several. |
| `DATABASE_URL` | local `stocksense` database | PostgreSQL connection string. |
| `REDIS_URL` | `redis://localhost:6379/0` | Redis connection string. |
| `ACCESS_TOKEN_EXPIRE_MINUTES` | `30` | How long a sign-in lasts before a silent refresh. |
| `REFRESH_TOKEN_EXPIRE_DAYS` | `7` | How long "stay signed in" lasts. |
| `EMAIL_PROVIDER` | `smtp` | `smtp` (local inbox or Gmail) or `sendgrid`. |
| `EMAIL_FROM` | `StockSense <no-reply@stocksense.local>` | Sender shown on emails. |
| `SMTP_HOST`, `SMTP_PORT` | `localhost`, `1025` | Mail server. |
| `SMTP_SECURITY` | `none` | `none` for a local inbox, `starttls` for Gmail (port 587), `ssl` for port 465. |
| `SMTP_USERNAME`, `SMTP_PASSWORD` | *(empty)* | Mail server sign-in, e.g. your Gmail address and app password. |
| `SENDGRID_API_KEY` | *(empty)* | Needed when `EMAIL_PROVIDER=sendgrid`. |
| `LOGIN_RATE_PER_15_MIN` | `10` | Sign-in attempts per IP. |
| `OTP_AUTH_RATE_PER_HOUR` | `10` | Sign-in, sign-up and password-change codes per email. |
| `OTP_REQUEST_RATE_PER_HOUR` | `3` | Password-reset codes per email. |

### Frontend (`frontend/.env`)

| Variable | Default | What it's for |
|---|---|---|
| `VITE_API_BASE_URL` | `http://localhost:8000` | Where the backend runs. No trailing slash and no `/api/v1`. |

---

## Running the tests

**Backend** (needs PostgreSQL and Redis running; uses the `stocksense_test` database):

```bash
cd backend
pytest -q
```

Each test runs inside a transaction that's rolled back afterwards, so tests don't affect each other. The concurrency tests use real parallel connections to prove stock can't be double-counted or oversold.

**Frontend:**

```bash
cd frontend
npm test              # unit and component tests
npm run typecheck     # TypeScript checks
npm run build         # production build into dist/
```

<details>
<summary><strong>What the tests cover</strong></summary>

- **Sign-in:** codes required for sign-up and sign-in; first confirmed user becomes manager; unconfirmed sign-ups can't claim an address; challenge tokens can't be tampered with or reused for another purpose; resend cooldown; codes never appear in responses; password change and reset; rate limits; session refresh and sign-out.
- **Email:** Gmail settings sign in over an encrypted connection; credentials are never sent unencrypted.
- **Products:** create, update, archive, search, duplicate SKUs, initial stock and its ledger entry.
- **Operations:** each type changes stock correctly; double validation is rejected; insufficient stock rolls everything back; role restrictions; waiting deliveries become ready; the ledger can't be edited; low-stock emails.
- **Concurrency:** simultaneous validations apply exactly once and never oversell.
- **Dashboard:** totals, filters, the 14-day movement data, cache clearing and the health check.
- **Frontend:** the API client's token handling and refresh, error messages, the operation form and the sign-in page including the code step.

</details>

### Database migrations

```bash
alembic upgrade head                        # apply all migrations
alembic revision --autogenerate -m "..."    # create one after changing a model
alembic downgrade -1                        # undo the last one
```

---

## Deploying

These steps use [Render](https://render.com); any host that runs Python and serves static files works the same way.

**Backend** (Render Web Service, root directory `backend/`)

1. Create a **PostgreSQL 16** database and a **Key Value** (Redis) instance.
2. Create the web service:
   - Build: `pip install -r requirements.txt`
   - Pre-deploy: `alembic upgrade head`
   - Start: `uvicorn app.main:app --host 0.0.0.0 --port $PORT`
   - Health check path: `/health`
   - Set `PYTHON_VERSION=3.11.9`
3. Set the environment variables from the table above, plus:
   - `APP_ENV=production` and a strong `SECRET_KEY`
   - `DATABASE_URL` and `REDIS_URL` from the services you created
   - Email settings (Gmail or SendGrid)
   - `FRONTEND_ORIGIN` set to your frontend's exact address
   - `FORWARDED_ALLOW_IPS=*`, so rate limits see real visitor IPs
4. Deploy, then check that `/health` returns `{"status":"ok","db":"ok","redis":"ok"}`.

**Frontend** (Render Static Site, root directory `frontend/`)

- Build: `npm ci && npm run build`
- Publish directory: `dist`
- Environment: `VITE_API_BASE_URL=https://your-api-address`
- Rewrite rule: `/*` → `/index.html`

> **Put the frontend and backend on the same domain**, for example `app.example.com` and `api.example.com`. The sign-in cookie is only sent within one site, and two different `*.onrender.com` addresses count as different sites. Alternatively, rewrite `/api/*` on the frontend site to the backend and point `VITE_API_BASE_URL` at the frontend's own address.

**Before going live:** `APP_ENV=production`, a strong `SECRET_KEY`, an explicit `FRONTEND_ORIGIN`, HTTPS only, a working email provider, and never run the seeder against production.

---

## Troubleshooting

**The sign-in code never arrives.**
Check the backend console for `email.failed`. With the local inbox, make sure `devtools/mail_inbox.py` is running and `SMTP_HOST=127.0.0.1`. With Gmail, run `python -m app.send_test_email you@gmail.com` to see the exact error, and check the spam folder.

**The page asks me to sign in again after every reload.**
Use `localhost` everywhere (not a mix of `localhost` and `127.0.0.1`), and make sure `FRONTEND_ORIGIN` in `backend/.env` matches the address in your browser.

**`/health` says Redis is unavailable, or requests take a few seconds.**
The app still works without Redis, just more slowly. On Windows, write `127.0.0.1` instead of `localhost` in `REDIS_URL` and `SMTP_HOST`: `localhost` can resolve to IPv6 first and time out.

**New colours or styles don't appear after editing `tailwind.config.ts`.**
Restart `npm run dev`.

### No Redis, or no admin rights?

`devtools/fake_redis.py` runs an in-memory Redis stand-in with no install beyond pip:

```bash
cd backend
pip install "fakeredis[lua]"
python ../devtools/fake_redis.py
```

Then set `REDIS_URL=redis://127.0.0.1:6379/0` in `backend/.env`.

If you can't install PostgreSQL system-wide, the `pgserver` pip package ships real PostgreSQL binaries that run from your user folder. Use its `initdb` and `pg_ctl` to start a server on port 5432, then create the databases as in step 2.
