# Housing & Roommate Management Platform — Backend

B7A6 assignment backend (Student ID ends in **6**).

REST API for landlords to list properties/rooms, tenants to request rentals and pay via **Stripe** or **bKash**, and admins to manage the platform.

**No frontend** — use Postman / Thunder Client.

Repo: [HasnathAhmedTamim/B7A6-Assignment-backend](https://github.com/HasnathAhmedTamim/B7A6-Assignment-backend)

## Features

- Auth: register, login, Google login, JWT access + refresh, logout
- Forgot / reset password (Redis 6-digit OTP + Nodemailer + EJS email)
- Profile update + Cloudinary profile image upload (Multer)
- Roles: `ADMIN`, `LANDLORD`, `TENANT` (strict RBAC)
- Properties + rooms (search, filter, pagination, soft delete)
- Rental request workflow + transaction-safe booking (prevents double-booking)
- Payments: **Stripe** Checkout + webhook, **bKash** sandbox create + callback
- Admin users, roles/status, dashboard stats, audit logs
- Helmet, CORS, rate limiting, Zod validation

## Tech stack

Node.js · TypeScript · Express · PostgreSQL · Prisma · Zod · JWT · Redis · Nodemailer · Multer · Cloudinary · Stripe · bKash · Helmet · CORS · express-rate-limit · Biome

## Getting started

### 1. Install

```bash
cd backend
npm install
```

### 2. Environment

```bash
cp .env.example .env
```

Fill required values (see `.env.example` for the full list):

```env
DATABASE_URL="postgresql://..."
DIRECT_URL="postgresql://..."          # Neon: use non-pooler URL for Prisma transactions
JWT_ACCESS_SECRET=...
JWT_REFRESH_SECRET=...
ADMIN_EMAIL=admin@housing.com
ADMIN_PASSWORD=ChangeMeAdmin123!

# Payments
STRIPE_SECRET_KEY=sk_test_...
STRIPE_WEBHOOK_SECRET=whsec_...
BKASH_USERNAME=...
BKASH_PASSWORD=...
BKASH_APP_KEY=...
BKASH_APP_SECRET=...
BKASH_CALLBACK_URL=http://localhost:5000/api/v1

# Optional integrations
GOOGLE_CLIENT_ID=...
SMTP_USER=...
SMTP_PASSWORD=...
REDIS_HOST=...
REDIS_PASSWORD=...
CLOUDINARY_CLOUD_NAME=...
CLOUDINARY_API_KEY=...
CLOUDINARY_API_SECRET=...
```

Never commit real secrets.

### 3. Database

```bash
npx prisma migrate dev
npm run db:seed
```

### 4. Run

```bash
npm run dev
```

- Health: `GET http://localhost:5000/health`
- Google ID token helper (dev): `GET http://localhost:5000/google-signin`

## Scripts

| Command | Purpose |
|---------|---------|
| `npm run dev` | Dev server with reload |
| `npm run build` | TypeScript compile |
| `npm start` | Run compiled `dist` |
| `npm run db:seed` | Seed demo admin |
| `npm run lint` | Biome lint |
| `npx prisma studio` | DB GUI |

## Core API (all under `/api/v1`)

| Area | Endpoints |
|------|-----------|
| Auth | `POST /auth/register`, `/login`, `/google`, `/refresh-token`, `/logout`, `/forgot-password`, `/reset-password` |
| User | `GET/PATCH /users/me`, `PATCH /users/profile-image` (multipart `profileImage`) |
| Property | `POST/GET/PATCH/DELETE /properties`, `GET /properties/:id` |
| Room | `POST/GET /properties/:propertyId/rooms`, `PATCH/DELETE /rooms/:id` |
| Rental | `POST /rental-requests`, `GET .../my`, `.../received`, `PATCH .../approve\|reject\|cancel` |
| Booking | `GET /bookings/my`, `GET /bookings/:id`, `PATCH .../cancel` |
| Payment | `POST /payments/initiate`, `POST /payments/webhook` (Stripe), `GET /payments/bkash/callback`, `GET /payments/my`, `GET /payments/:id` |
| Admin | `GET /admin/users`, `PATCH .../status`, `.../role`, `GET /dashboard-stats`, `GET /audit-logs` |

Response shape:

```json
{ "success": true, "message": "...", "data": {} }
```

Errors:

```json
{ "success": false, "message": "...", "errors": [] }
```

## Typical tenant flow

1. Register / login as `TENANT`
2. Browse properties → create rental request for a room
3. Landlord approves → booking created (`PENDING_PAYMENT`)
4. Tenant initiates payment → open `checkoutUrl` → pay
5. Webhook / callback → payment `PAID`, booking `CONFIRMED`

## Stripe

1. `POST /payments/initiate` with:

```json
{ "bookingId": "...", "gateway": "STRIPE" }
```

(`gateway` defaults to `STRIPE` if omitted.)

2. Open returned `checkoutUrl`
3. Complete Checkout with test card `4242 4242 4242 4242`
4. Stripe webhook marks payment `PAID` and booking `CONFIRMED`

Local webhook forwarding:

```bash
stripe listen --forward-to localhost:5000/api/v1/payments/webhook
```

Copy the CLI `whsec_...` into `STRIPE_WEBHOOK_SECRET`.

## bKash (sandbox)

1. `POST /payments/initiate` with:

```json
{ "bookingId": "...", "gateway": "BKASH" }
```

2. Open returned `checkoutUrl`
3. Sandbox success wallet (typical): `01770618575` · OTP `123456` · PIN `12121`
4. Callback: `GET /api/v1/payments/bkash/callback` executes payment and updates status

Notes:

- Sandbox wallets are unreliable for larger amounts; small amounts work best for local tests.
- Localhost callbacks only work if bKash can reach your machine (use **ngrok** / deploy, or set `BKASH_CALLBACK_URL` to a public base ending at `/api/v1`).
- Sandbox may occasionally return “Insufficient balance” even with success wallets — that is a sandbox-side issue, not app logic.

## Forgot / reset password

1. `POST /auth/forgot-password` `{ "email": "..." }` → OTP emailed (stored in Redis, ~5–10 min TTL)
2. `POST /auth/reset-password` `{ "email", "otp", "newPassword" }`

Requires `SMTP_*` and `REDIS_*`. Google-only accounts (no password) cannot use this flow.

## Profile image

`PATCH /users/profile-image` with `multipart/form-data` field `profileImage` (Bearer token required). Uses Multer + Cloudinary.

## Deployment (Render)

### 1. Push code

```bash
git add .
git commit -m "chore: prepare for deploy"
git push origin main
```

### 2. Create Web Service

1. Go to [https://dashboard.render.com](https://dashboard.render.com) → **New** → **Web Service**
2. Connect `HasnathAhmedTamim/B7A6-Assignment-backend`
3. Settings:

| Field | Value |
|-------|--------|
| Runtime | Node |
| Root Directory | leave empty (repo root is the API) |
| Build Command | `npm install --include=dev && npm run build` |
| Pre-Deploy Command | `npx prisma migrate deploy` |
| Start Command | `npm start` |

### 3. Environment variables

Copy from local `.env` into Render **Environment**. Minimum:

- `NODE_ENV=production`
- `DATABASE_URL` + `DIRECT_URL` (your Neon URLs — keep using Neon)
- `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET`
- `ADMIN_EMAIL`, `ADMIN_PASSWORD`
- `BACKEND_URL=https://YOUR-SERVICE.onrender.com`
- `CORS_ORIGIN=*` (or your frontend URL)
- `FRONTEND_URL` (same as CORS if needed)
- Stripe: `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, success/cancel URLs
- Optional: Google, Redis, SMTP, Cloudinary, bKash vars

After first deploy, set:

- `BKASH_CALLBACK_URL=https://YOUR-SERVICE.onrender.com/api/v1`
- Stripe Dashboard webhook → `https://YOUR-SERVICE.onrender.com/api/v1/payments/webhook` (use the live `whsec_...`)

### 4. Seed admin (once)

From your machine (with production `DATABASE_URL`):

```bash
npx prisma db seed
```

Or use Render Shell if available.

### 5. Verify

```bash
curl https://YOUR-SERVICE.onrender.com/health
```

Free Render instances sleep after idle — first request can take ~30–60s.

## Demo admin

After seed (from `.env`):

- Email: `ADMIN_EMAIL` (default `admin@housing.com`)
- Password: `ADMIN_PASSWORD` (default `ChangeMeAdmin123!`)

## Postman

Import `postman/housing-platform.json` and set collection variables:

- `baseUrl` → `http://localhost:5000/api/v1`
- `accessToken` / role tokens after login

## Architecture

```
Routes → Validation → Auth → RBAC → Controller → Service → Prisma → PostgreSQL
Payments → StripeGateway | BkashGateway → webhook / callback → status update
```
