# StockSense

Inventory management for warehouse teams: products, receipts, deliveries, internal transfers, stock adjustments, an append-only stock ledger, low-stock alerts, and a live operations dashboard. It supports multiple warehouses.

```
/
├── backend/    FastAPI · PostgreSQL 16 · SQLAlchemy 2 (async) · Alembic · Redis · pytest
└── frontend/   React 18 · TypeScript · Vite · Tailwind · TanStack Query · React Hook Form · Zod · Framer Motion
```

The two apps run and deploy independently. The frontend talks to the backend only over the HTTP API (`/api/v1`).

---

## Architecture

### Backend (`backend/`)

```
app/
├── main.py            FastAPI app: CORS, security headers, request logging, error normalisation, /health*
├── api/v1/            Routers (auth, dashboard, products, categories, warehouses, locations, operations, ledger, users)
├── core/              config (Pydantic Settings), security (JWT/bcrypt/OTP), exceptions, logging (structlog),
│                      cache (Redis helpers with graceful fallback), rate_limit (slowapi)
├── db/                SQLAlchemy Base/engine/session + models
├── schemas/           Pydantic request/response models (separate from ORM models)
├── repositories/      SQLAlchemy queries only + UnitOfWork (transaction boundary)
├── services/          Business rules, framework-agnostic (no FastAPI / SQLAlchemy imports)
├── dependencies.py    get_db, get_current_user, require_role, email service
└── seed.py            Development data seeder
```

**How the stock logic works**

- `Product` never stores a quantity. The `stock` table (one row per product and location, `CHECK quantity >= 0`) is the only source of truth.
- `ledger_entries` is append-only. A database trigger rejects every `UPDATE` and `DELETE` on it.
- Validating an operation (`POST /operations/{id}/validate`) happens in **one transaction**:
  1. `SELECT … FOR UPDATE` on the operation row. The status check (`ALREADY_VALIDATED` → 409) happens *after* the lock is taken, so the same operation can never be validated twice.
  2. `SELECT … FOR UPDATE` on every stock row the operation touches, always in the same order, so two validations can't deadlock.
  3. Availability is checked inside the lock (`INSUFFICIENT_STOCK` → 422, listing every short line).
  4. Stock is changed and the ledger rows are written in the same transaction. The operation becomes `done`.
  5. Any failure rolls back everything, so no line is ever partly applied.
- Adjustments: `delta = counted − on_hand`. Stock is set to the counted quantity, and the signed delta goes to the ledger. Only managers can validate them.
- Transfers write two ledger entries: −qty at the source and +qty at the destination.
- Initial stock given when a product is created is recorded as a completed adjustment (`WH/ADJ/…`), so every unit can be traced.
- Reference numbers are generated on the server: `{WAREHOUSE}/{IN|OUT|INT|ADJ}/{YEAR}/{0001}`. They run in sequence per type and year, and an advisory lock prevents duplicates.

**Status model:** `draft → (waiting) → ready → done`, plus `canceled`.
Draft, Waiting and Ready are the editable, pre-validation states. The server works them out itself: an operation with no lines is `draft`. A receipt or adjustment with lines is `ready`. A delivery or transfer is `ready` when its source location has enough stock, and `waiting` when it doesn't. After each validation, the server re-checks open deliveries and transfers that share a product (in a separate short transaction that skips locked rows). Only these open states can be edited or validated. Cancelling requires a manager and only works on open operations.

**Redis** is used for login rate limiting (slowapi, 10 per 15 min per IP), OTP request limiting (3 reset codes and 10 sign-in / sign-up / password-change codes per hour per email), the reset-token `jti` blacklist, and caches for `warehouses:all` (10 min), `locations:warehouse:{id}` (10 min), `categories:all` (30 min) and `dashboard:summary:*` (2 min, cleared on every change). Stock, operations, users and OTP records are never cached. If Redis is down, every call falls back to PostgreSQL:

- rate limiters switch to in-memory counters
- the OTP counter falls back to counting `otp_records`
- a reset token stays single-use because it is bound to a fingerprint of the password hash it replaces

**Email** goes through `EmailService` and is sent with FastAPI `BackgroundTasks`: SMTP (Mailhog) in development and SendGrid in production. There are two templates: the one-time-code email (sign-in, sign-up confirmation, password change and password reset each get their own wording) and the low-stock alert, which goes to all active managers after any validation that leaves a product at or below its reorder point.

### Security

| Concern | Implementation |
|---|---|
| Passwords / OTP | bcrypt, work factor 12. OTPs are 6 digits from `secrets.randbelow`, stored hashed, expire in 10 min, allow 5 verification attempts. |
| Access token | JWT HS256, 30 min. The frontend keeps it **in memory only**, never in localStorage, sessionStorage, IndexedDB, cookies or the URL. |
| Refresh token | Opaque UUID. Only its SHA-256 hash is stored in the database (7 days). It's sent as an `httpOnly; Secure; SameSite=Strict; Path=/api/v1/auth` cookie. |
| CSRF | SameSite=Strict plus an explicit `Origin` check on `/auth/refresh` and `/auth/logout`. |
| Password reset | `forgot-password` always returns 200 and has equal timing, so it can't reveal which emails exist. The reset token is single-use (Redis `jti` blacklist plus password fingerprint). All refresh tokens are revoked after a reset. |
| CORS | Explicit `FRONTEND_ORIGIN` list with credentials. A wildcard is rejected in production. |
| Headers | `X-Content-Type-Options`, `X-Frame-Options: DENY`, `Referrer-Policy`, `Permissions-Policy`, CSP on API responses, and HSTS in production. |
| Docs | `/api/docs` and `/api/redoc` are disabled when `APP_ENV=production`. |

**Roles** (checked on the server; the UI only hides what a role can't do):

| Action | Manager | Staff |
|---|---|---|
| Create/edit products | ✅ | ✅ |
| Archive (delete) products | ✅ | ❌ |
| Manage warehouses and locations | ✅ | ❌ |
| Create/validate receipts, deliveries, transfers | ✅ | ✅ |
| Validate adjustments | ✅ | ❌ |
| Cancel operations | ✅ | ❌ |
| Settings (warehouses, locations, team) | ✅ | ❌ |

**Every sign-in, sign-up and password change ends with a 6-digit code sent by email.**

- *Sign up:* `POST /auth/register` creates the account unconfirmed and emails a code. `POST /auth/otp/verify` with the returned `challenge_token` and the code confirms the address and starts the session. An unconfirmed sign-up doesn't block the address: whoever proves they own it can register again.
- *Sign in:* `POST /auth/login` checks the password and emails a code (no session yet). `POST /auth/otp/verify` exchanges it for the access token and refresh cookie. An account that never confirmed its email finishes sign-up here instead.
- *Change password:* `POST /users/me/password/otp` checks the current password and emails a code. `POST /users/me/password` with the code and the new password makes the change, signs out every other session and keeps this one.
- `POST /auth/otp/resend` sends a fresh code (30 s cooldown). Challenge tokens are signed, expire after 30 minutes, are tied to one purpose and die when the password changes. Codes of one purpose can't be used for another.

The **first account to confirm its email becomes the manager**. Everyone after that joins as staff, and a manager can promote them under *Settings → Team*.

Codes are only ever delivered by email: no API response contains them. In development, read them in Mailhog (or the local inbox below).

### Error format

Every error, including request validation errors, has this shape:

```json
{ "detail": "Insufficient stock for DESK001: 4 available, 6 requested", "code": "INSUFFICIENT_STOCK", "field": "lines[1].quantity" }
```

Validation errors also include `errors: [{field, detail}]`. `INSUFFICIENT_STOCK` also includes `shortages: [{line_index, sku, requested, available, …}]`. The main codes are `VALIDATION_ERROR`, `NOT_AUTHENTICATED`, `FORBIDDEN`, `MANAGER_REQUIRED`, `NOT_FOUND`, `DUPLICATE_SKU`, `ALREADY_VALIDATED`, `OPERATION_LOCKED`, `INSUFFICIENT_STOCK`, `NO_LINES`, `OTP_INVALID`, `OTP_EXPIRED`, `OTP_MAX_ATTEMPTS`, `OTP_COOLDOWN`, `CHALLENGE_INVALID`, `RATE_LIMITED` and `INTERNAL_ERROR`.

---

## Local development

### Prerequisites

- Python 3.11
- Node 20+ (22 recommended)
- PostgreSQL 16
- Redis 7+
- Mailhog (optional, to see emails)

### 1. PostgreSQL

```bash
psql -U postgres -c "CREATE USER stocksense WITH PASSWORD 'stocksense' CREATEDB;"
psql -U postgres -c "CREATE DATABASE stocksense OWNER stocksense;"
psql -U postgres -c "CREATE DATABASE stocksense_test OWNER stocksense;"   # for the test suite
```

### 2. Redis

```bash
redis-server            # or: brew services start redis / sudo systemctl start redis
```

No Redis on Windows? `devtools/fake_redis.py` runs an in-memory stand-in (`pip install "fakeredis[lua]"` in the backend venv, then `python devtools/fake_redis.py`). It listens on `127.0.0.1:6379`, so set `REDIS_URL=redis://127.0.0.1:6379/0` (`localhost` may resolve to IPv6 first and time out).

### 3. Mailhog (development email)

```bash
mailhog                 # SMTP on :1025, web inbox on http://localhost:8025
```

No Mailhog? `devtools/mail_inbox.py` does the same job with no install beyond `pip install aiosmtpd` in the backend venv: run `python devtools/mail_inbox.py`, set `SMTP_HOST=127.0.0.1` and `SMTP_PORT=1025`, and open <http://localhost:8025>.

Sign-in, sign-up, password-change and password-reset codes and low-stock alerts show up in the inbox.

**Real email through Gmail** (no extra service needed): turn on 2-Step Verification for the Google account, create an app password (Google Account → Security → 2-Step Verification → App passwords), then set in `backend/.env`:

```
EMAIL_FROM=StockSense <you@gmail.com>
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_SECURITY=starttls
SMTP_USERNAME=you@gmail.com
SMTP_PASSWORD=<the 16-character app password>
```

Restart the API, then check it with `python -m app.send_test_email someone@example.com`, which prints the mail server's error if anything is wrong. Gmail allows about 500 messages a day from a personal account. If Mailhog isn't running, sending fails quietly and is logged (`email.failed`). The API itself keeps working.

### 4. Backend

```bash
cd backend
python3.11 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env                  # then set SECRET_KEY
alembic upgrade head                  # schema + seed categories + default warehouse WH/STOCK
python -m app.seed                    # optional: development users + sample data
uvicorn app.main:app --reload --port 8000
```

- API: <http://localhost:8000/api/v1>
- Docs: <http://localhost:8000/api/docs>
- Health: <http://localhost:8000/health>

**Migrations**

```bash
alembic upgrade head                        # apply
alembic revision --autogenerate -m "..."    # create after changing models
alembic downgrade -1                        # roll back one step
```

`0001_initial_schema` creates every table, constraint and index, plus the ledger immutability trigger. `0002_seed_reference_data` adds the reference data. It is idempotent and adds five product categories plus the default warehouse **Main Warehouse (WH)** with the location **WH/STOCK**.

**Development data** (`python -m app.seed`) refuses to run when `APP_ENV=production` and is safe to run again. It creates:

| Email | Password | Role |
|---|---|---|
| `manager@stocksense.dev` | `Manager123` | manager |
| `staff@stocksense.dev` | `Staff12345` | staff |

It also creates a second warehouse (EDC), locations (WH/DOCK, WH/PROD, EDC/DISP), six products with initial stock and reorder points, and a mix of receipts, deliveries (one waiting on stock), a transfer and an adjustment. These accounts are for local development only. Never run the seeder against production. `python -m app.seed --users` creates only the two accounts.

### 5. Frontend

```bash
cd frontend
npm install                           # creates package-lock.json — commit it (Render uses npm ci)
cp .env.example .env                  # VITE_API_BASE_URL=http://localhost:8000
npm run dev                           # http://localhost:5173
```

`VITE_API_BASE_URL` is the backend's origin, with no trailing slash and no `/api/v1`. The app calls `${VITE_API_BASE_URL}/api/v1/...`. Keep `FRONTEND_ORIGIN` in the backend `.env` equal to the dev server origin (`http://localhost:5173`).

**How login works in development.** Signing in (password, then the emailed code) returns an access token, which the app keeps in memory, and sets the refresh cookie. When you reload the page, the app calls `POST /auth/refresh` with that cookie and gets a new access token without asking you to sign in again. When an API call returns 401, the client refreshes once, sharing a single refresh request between all waiting calls, and retries the call. If the refresh fails, you're taken back to the sign-in page. Browsers accept `Secure` cookies on `http://localhost`, and `localhost:5173` and `localhost:8000` count as the same site, so the strict cookie works locally. Use `localhost` consistently rather than mixing it with `127.0.0.1`.

**Password reset flow.** Go to *Forgot password*, enter your email, and read the 6-digit code in Mailhog (or the local inbox). Enter the code, then choose a new password.

---

## Testing

### Backend

The backend tests need PostgreSQL and Redis running. They use the `stocksense_test` database and Redis database 15.

```bash
cd backend && source .venv/bin/activate
pytest -q
# override targets if needed:
TEST_DATABASE_URL=postgresql+asyncpg://user:pass@localhost:5432/stocksense_test TEST_REDIS_URL=redis://localhost:6379/15 pytest
```

Each test runs inside a transaction that is rolled back afterwards; the app's own commits become savepoints. `test_concurrency.py` is the exception: it uses real parallel connections to check the row locking. The suite covers:

- **Auth:** register and login both need the emailed code; the first *confirmed* user becomes manager; unconfirmed sign-ups can't squat an address; challenge tokens are tamper-proof and purpose-bound; resend cooldown; codes never appear in API responses; OTP-confirmed password change; rate limits, refresh (including the Origin check), logout, OTP success, OTP expired (400), OTP max attempts (429), forgot-password not revealing emails, single-use reset tokens.
- **Products:** create, read, update, archive; SKU search; duplicate SKU (409); initial stock plus its ledger entry; warehouse and location permissions.
- **Operations:** receipts increase stock; double validation returns 409; insufficient stock returns 422 with a full rollback; deliveries decrease stock; transfers write two ledger entries; adjustments record the signed delta; staff can't cancel or validate adjustments; draft-only editing; a waiting delivery becomes ready after a receipt; a database-level test that the ledger rejects updates; low-stock emails.
- **Concurrency:** four simultaneous validations of one operation apply exactly once; three simultaneous deliveries against the same stock never oversell.
- **Dashboard:** KPI numbers, filters, cache clearing after a change, health endpoint.

### Frontend

```bash
cd frontend
npm test            # vitest + Testing Library
npm run typecheck   # tsc strict
npm run build       # production bundle in dist/
```

Tests cover the API client's auth handling (in-memory token, refreshing once on 401 and retrying, sharing one refresh, expiry signal, nothing written to web storage), error messages, the operation form (payload, validation, mapping server field errors to form rows) and the login page.

---

## Environment variables

### Backend (`backend/.env`)

| Variable | Example | Notes |
|---|---|---|
| `APP_ENV` | `development` \| `staging` \| `production` | Production disables docs, enables HSTS, requires a strong secret |
| `SECRET_KEY` | 48+ random chars | JWT signing key and reset-token fingerprint key |
| `FRONTEND_ORIGIN` | `https://app.example.com` | Exact origin(s), comma-separated; used for CORS and the refresh Origin check |
| `DATABASE_URL` | `postgresql+asyncpg://…` | `postgres://` URLs are converted to asyncpg automatically |
| `REDIS_URL` | `redis://…` | Render Key Value connection string in production |
| `ACCESS_TOKEN_EXPIRE_MINUTES` | `30` | |
| `REFRESH_TOKEN_EXPIRE_DAYS` | `7` | |
| `EMAIL_PROVIDER` | `smtp` \| `sendgrid` | |
| `SENDGRID_API_KEY` | | Required when using SendGrid |
| `EMAIL_FROM` | `StockSense <no-reply@example.com>` | Must be a verified SendGrid sender in production |
| `SMTP_HOST` / `SMTP_PORT` | `localhost` / `1025` | Mailhog in development |
| `SMTP_SECURITY` | `none` \| `starttls` \| `ssl` | `starttls` for Gmail (port 587) |
| `SMTP_USERNAME` / `SMTP_PASSWORD` | `you@gmail.com` / app password | Leave empty for Mailhog; required together, never sent unencrypted |
| `OTP_REQUEST_RATE_PER_HOUR` | `3` | Password-reset codes per email per hour |
| `OTP_AUTH_RATE_PER_HOUR` | `10` | Sign-in / sign-up / password-change codes per email per hour |
| `LOGIN_RATE_PER_15_MIN` | `10` | |

### Frontend (`frontend/.env`)

| Variable | Example |
|---|---|
| `VITE_API_BASE_URL` | `http://localhost:8000` (dev) · `https://api.example.com` (prod) |

Never commit `.env` files. Both `.gitignore` files exclude them.

---

## Deploying on Render

There's no Dockerfile, Gunicorn or Nginx.

1. **Create the managed services:** Render PostgreSQL (16) and Render Key Value.
2. **Create a Web Service** with root directory `backend/`:
   - Runtime: Python 3.11. Set `PYTHON_VERSION=3.11.9`, or add a `.python-version` file.
   - Build command: `pip install -r requirements.txt`
   - Pre-deploy command: `alembic upgrade head`. Alternatively, run it once from the Render Shell on the first deploy.
   - Start command: `uvicorn app.main:app --host 0.0.0.0 --port $PORT`
   - Health check path: `/health`
3. **Environment variables** (Render dashboard): everything in the backend table above, plus:
   - `APP_ENV=production`
   - `DATABASE_URL` = the Render Postgres internal URL
   - `REDIS_URL` = the Key Value internal URL
   - `EMAIL_PROVIDER=sendgrid`, `SENDGRID_API_KEY`, `EMAIL_FROM`
   - `FRONTEND_ORIGIN` = your frontend's exact origin
   - `FORWARDED_ALLOW_IPS=*`. Uvicorn reads this so rate limits use the real client IP behind Render's proxy.
4. **Deploy**, then check that `GET /health` returns `{"status":"ok","db":"ok","redis":"ok"}`.
5. **Frontend:** create a Render Static Site with root directory `frontend/`:
   - Build command: `npm ci && npm run build`
   - Publish directory: `dist`
   - Environment: `VITE_API_BASE_URL=https://<your-api-domain>`
   - Rewrite rule: `/*` → `/index.html` (SPA routing)

**Cookie note for production.** The refresh cookie is `SameSite=Strict`, so the browser only sends it when the frontend and API are on the **same site** (the same registrable domain). `*.onrender.com` is on the Public Suffix List, so `app-x.onrender.com` and `api-x.onrender.com` count as different sites and the cookie will not be sent. Pick one of these:

- use custom domains on one domain, e.g. `app.example.com` and `api.example.com` (recommended), or
- serve the API under the frontend's domain with a Render rewrite: `/api/*` → `https://<api-service>.onrender.com/api/*`. Then set `VITE_API_BASE_URL` to the frontend origin.

Production checklist:

- [ ] `APP_ENV=production`
- [ ] strong `SECRET_KEY`
- [ ] explicit `FRONTEND_ORIGIN` (no `*`)
- [ ] HTTPS only
- [ ] docs disabled (automatic)
- [ ] SendGrid sender verified
- [ ] seeder not run
- [ ] `pip-audit` clean
