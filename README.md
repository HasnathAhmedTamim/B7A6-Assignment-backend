# Housing & Roommate Management Platform

**Backend API** · Level-2 Batch-7 Assignment (B7A6) · Student ID ends in **6**

A production-oriented REST API that lets landlords publish housing inventory, tenants request rooms and complete real payments, and admins oversee users and platform activity.

| | |
|---|---|
| **Repository** | [HasnathAhmedTamim/B7A6-Assignment-backend](https://github.com/HasnathAhmedTamim/B7A6-Assignment-backend) |
| **API base** | `/api/v1` |
| **Docs / testing** | Postman collection · no frontend required |
| **Live** | Deploy on Render (see [Deployment](#deployment-render)) |

---

## Table of contents

1. [What is implemented](#what-is-implemented)
2. [Tech stack](#tech-stack)
3. [How it works](#how-it-works)
4. [Business workflow](#business-workflow)
5. [API response format](#api-response-format)
6. [API reference](#api-reference)
7. [Project structure](#project-structure)
8. [Getting started](#getting-started)
9. [Payments](#payments)
10. [Deployment (Render)](#deployment-render)
11. [Demo credentials](#demo-credentials)

---

## What is implemented

### Authentication & users
- Email/password register & login with bcrypt password hashing
- Google OAuth (ID token verification via Google Auth Library)
- JWT **access** + **refresh** tokens; logout invalidates refresh tokens
- Forgot / reset password with **6-digit OTP** (Redis TTL) emailed via **Nodemailer + EJS**
- Profile read/update and **Cloudinary** profile image upload (Multer)

### Roles & security (RBAC)
- Three fixed roles: `ADMIN`, `LANDLORD`, `TENANT`
- Bearer JWT auth + role middleware on every protected route
- Helmet security headers, CORS, express-rate-limit
- Zod validation on bodies, params, and queries
- Soft deletes (`deletedAt`) instead of hard deletes for core entities
- Audit logs for critical admin / payment / booking actions

### Housing domain
- Properties & rooms CRUD (landlord-owned)
- Public listing with **search**, **filter**, **sort**, and **pagination**
- Tenant rental requests → landlord approve / reject → tenant cancel
- Approve runs inside a **Prisma interactive transaction**: marks room unavailable and creates a booking (`PENDING_PAYMENT`) to avoid double-booking

### Payments (mandatory)
- **Stripe** Checkout Session + signed webhook → `PAID` / booking `CONFIRMED`
- **bKash** Tokenized Checkout (sandbox) + execute callback
- Gateway abstraction (`StripeGateway` | `BkashGateway`) behind one initiate API
- Payment history for tenants; status tracking for all roles with access

### Admin
- List users, update status (`ACTIVE` / `BLOCKED`) and role
- Dashboard aggregate stats
- Paginated audit logs

---

## Tech stack

| Layer | Technology | Purpose |
|-------|------------|---------|
| Runtime | Node.js, TypeScript | Typed server runtime |
| Framework | Express 5 | HTTP routing & middleware |
| Database | PostgreSQL (Neon) + Prisma | Relational data, migrations, transactions |
| Validation | Zod | Request schema validation |
| Auth | JWT, bcrypt, Google Auth Library | Credentials + social login |
| Cache / OTP | Redis | Temporary forgot-password codes |
| Email | Nodemailer + EJS | Transactional OTP emails |
| Files | Multer + Cloudinary | Profile image storage |
| Payments | Stripe, bKash | Real checkout + status callbacks |
| Security | Helmet, CORS, express-rate-limit | Hardening & abuse protection |
| Quality | Biome | Lint / format |
| Docs | Postman | Interactive API collection |
| Deploy | Render | Hosted Node web service |

---

## How it works

Request pipeline:

```text
Client (Postman)
  → Helmet / CORS / Rate limit
  → JSON body (except Stripe raw webhook)
  → Route (/api/v1/...)
  → Zod validation
  → authenticate (JWT) + authorize (role)
  → Controller
  → Service (business rules + Prisma transactions)
  → PostgreSQL
  → sendResponse / globalErrorHandler
```

Payment path:

```text
POST /payments/initiate { bookingId, gateway }
  → create PENDING Payment row
  → StripeCheckout URL  or  bKash bkashURL
  → user pays on provider UI
  → Stripe webhook  or  bKash callback
  → Payment PAID + Booking CONFIRMED (+ audit log)
```

Architecture style: **modular monolith** — each domain owns `route` → `controller` → `service` → `schema`, with shared middlewares, libs, and utils.

---

## Business workflow

```text
1. ADMIN seeds / manages users
2. LANDLORD registers → creates Property (PUBLISHED) → adds Room(s)
3. TENANT browses GET /properties (?search&city&minRent&page…)
4. TENANT POST /rental-requests for a room
5. LANDLORD PATCH .../approve
      └─ transaction: request APPROVED, room available=false, booking PENDING_PAYMENT
6. TENANT POST /payments/initiate { gateway: "STRIPE" | "BKASH" }
7. Completes provider checkout
8. Webhook/callback confirms → booking CONFIRMED
9. ADMIN reviews dashboard, users, audit logs
```

### Status transitions

| Entity | Typical path |
|--------|----------------|
| Rental request | `PENDING` → `APPROVED` / `REJECTED` / `CANCELLED` |
| Room | `available: true` → `false` on approve |
| Booking | `PENDING_PAYMENT` → `CONFIRMED` (after pay) or `CANCELLED` |
| Payment | `PENDING` → `PAID` / `FAILED` / `CANCELLED` |

---

## API response format

All versioned APIs use a consistent JSON envelope.

### Success

```json
{
  "success": true,
  "message": "Operation successful",
  "meta": {
    "page": 1,
    "limit": 10,
    "total": 42,
    "totalPages": 5
  },
  "data": {}
}
```

- `meta` is present on paginated list endpoints.
- `data` holds the payload (object, array, or `null`).

### Error

```json
{
  "success": false,
  "message": "Validation failed",
  "errors": [
    { "path": "email", "message": "Invalid email" }
  ]
}
```

| Case | HTTP | Notes |
|------|------|--------|
| Validation (Zod) | `400` | `errors[]` with field paths |
| Unauthorized | `401` | Missing/invalid token |
| Forbidden | `403` | Wrong role or ownership |
| Not found | `404` | Resource missing / soft-deleted |
| Conflict | `409` | Invalid state (e.g. already approved) |
| Server error | `500` | Generic message in production |

### Auth header

```http
Authorization: Bearer <accessToken>
```

---

## API reference

Base URL: `http://localhost:5000/api/v1`  
Helpers: `GET /health`, `GET /`, `GET /google-signin` (dev Google ID token page)

### Auth

| Method | Path | Access | Description |
|--------|------|--------|-------------|
| `POST` | `/auth/register` | Public | Register (`TENANT` / `LANDLORD`) |
| `POST` | `/auth/login` | Public | Email/password login |
| `POST` | `/auth/google` | Public | Google ID token login |
| `POST` | `/auth/refresh-token` | Public | Rotate access token |
| `POST` | `/auth/logout` | Auth | Invalidate refresh token |
| `POST` | `/auth/forgot-password` | Public | Send OTP email |
| `POST` | `/auth/reset-password` | Public | Reset with OTP |

### Users

| Method | Path | Access | Description |
|--------|------|--------|-------------|
| `GET` | `/users/me` | Auth | Current profile |
| `PATCH` | `/users/me` | Auth | Update profile fields |
| `PATCH` | `/users/profile-image` | Auth | Multipart `profileImage` → Cloudinary |

### Properties & rooms

| Method | Path | Access | Description |
|--------|------|--------|-------------|
| `GET` | `/properties` | Public | List + search/filter/sort/pagination |
| `GET` | `/properties/:id` | Public | Property detail |
| `POST` | `/properties` | Landlord/Admin | Create property |
| `PATCH` | `/properties/:id` | Owner/Admin | Update |
| `DELETE` | `/properties/:id` | Owner/Admin | Soft delete |
| `POST` | `/properties/:propertyId/rooms` | Owner/Admin | Add room |
| `GET` | `/properties/:propertyId/rooms` | Public | List rooms |
| `PATCH` | `/rooms/:id` | Owner/Admin | Update room |
| `DELETE` | `/rooms/:id` | Owner/Admin | Soft delete room |

**List query examples:** `?page=1&limit=10&search=gulshan&city=Dhaka&minRent=5000&maxRent=20000&propertyType=APARTMENT&available=true&sortBy=monthlyRent&sortOrder=asc`

### Rental requests

| Method | Path | Access | Description |
|--------|------|--------|-------------|
| `POST` | `/rental-requests` | Tenant | Create request |
| `GET` | `/rental-requests/my` | Tenant/Admin | My requests |
| `GET` | `/rental-requests/received` | Landlord/Admin | Incoming requests |
| `PATCH` | `/rental-requests/:id/approve` | Landlord/Admin | Approve → booking |
| `PATCH` | `/rental-requests/:id/reject` | Landlord/Admin | Reject |
| `PATCH` | `/rental-requests/:id/cancel` | Tenant/Admin | Cancel pending |

### Bookings

| Method | Path | Access | Description |
|--------|------|--------|-------------|
| `GET` | `/bookings/my` | Auth (roles) | My bookings |
| `GET` | `/bookings/:id` | Auth (roles) | Booking detail |
| `PATCH` | `/bookings/:id/cancel` | Auth (roles) | Cancel booking |

### Payments

| Method | Path | Access | Description |
|--------|------|--------|-------------|
| `POST` | `/payments/initiate` | Tenant/Admin | Start Stripe or bKash checkout |
| `POST` | `/payments/webhook` | Stripe | Signed webhook (raw body) |
| `GET` | `/payments/bkash/callback` | bKash | Execute + finalize payment |
| `GET` | `/payments/my` | Tenant/Admin | My payments |
| `GET` | `/payments/:id` | Auth (roles) | Payment detail |

Initiate body:

```json
{
  "bookingId": "uuid",
  "gateway": "STRIPE"
}
```

`gateway` may be `"STRIPE"` (default) or `"BKASH"`. Response includes `checkoutUrl`.

### Admin

| Method | Path | Access | Description |
|--------|------|--------|-------------|
| `GET` | `/admin/users` | Admin | List users |
| `PATCH` | `/admin/users/:id/status` | Admin | Block / activate |
| `PATCH` | `/admin/users/:id/role` | Admin | Change role |
| `GET` | `/admin/dashboard-stats` | Admin | Platform counters |
| `GET` | `/admin/audit-logs` | Admin | Activity trail |

---

## Project structure

```text
backend/
├── prisma/
│   ├── schema.prisma          # Models, enums, indexes, soft-delete fields
│   ├── migrations/            # SQL migrations for deploy
│   ├── seed.ts                # Demo ADMIN from ADMIN_EMAIL / ADMIN_PASSWORD
│   └── tsconfig.json          # Editor types for seed scripts
├── postman/
│   └── housing-platform.json  # Full workflow collection
├── public/
│   └── google-signin.html     # Dev helper to obtain Google idToken
├── scripts/
│   └── set-bkash-test-amount.ts
├── src/
│   ├── app.ts                 # Express app: security, routes, errors
│   ├── server.ts              # Boot: Prisma, Redis, SMTP, listen
│   ├── config/index.ts        # Zod-validated env → typed config
│   ├── routes/index.ts        # Mounts all /api/v1 modules
│   ├── middlewares/
│   │   ├── auth.middleware.ts       # JWT Bearer authentication
│   │   ├── rbac.middleware.ts       # Role authorization
│   │   ├── validation.middleware.ts # Zod request validation
│   │   ├── error.middleware.ts      # Global error → JSON envelope
│   │   └── notFound.middleware.ts
│   ├── modules/               # Feature modules (route/controller/service/schema)
│   │   ├── auth/
│   │   ├── user/
│   │   ├── property/          # properties + rooms
│   │   ├── rentalRequest/
│   │   ├── booking/
│   │   ├── payment/
│   │   │   └── gateways/      # stripe.gateway.ts, bkash.gateway.ts, interface
│   │   └── admin/
│   ├── lib/                   # prisma, redis, nodemailer, cloudinary, multer, bkash
│   ├── templates/             # EJS email templates
│   ├── types/                 # AuthUser, Express augmentations
│   └── utils/                 # AppError, catchAsync, jwt, sendResponse, audit
├── .env.example
├── package.json
└── README.md
```

### Module file roles

| File | Responsibility |
|------|----------------|
| `*.route.ts` | Paths, HTTP methods, middleware chain |
| `*.controller.ts` | Parse HTTP → call service → `sendResponse` |
| `*.service.ts` | Business rules, Prisma queries/transactions |
| `*.schema.ts` | Zod schemas for body / params / query |
| `gateways/*` | Payment provider adapters (same interface) |

---

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

Configure at least:

```env
DATABASE_URL="postgresql://..."
DIRECT_URL="postgresql://..."          # Neon non-pooler URL (transactions)
JWT_ACCESS_SECRET=...
JWT_REFRESH_SECRET=...
ADMIN_EMAIL=admin@housing.com
ADMIN_PASSWORD=ChangeMeAdmin123!
STRIPE_SECRET_KEY=sk_test_...
STRIPE_WEBHOOK_SECRET=whsec_...
```

Optional (enable related features): Google, Redis, SMTP, Cloudinary, bKash — see `.env.example`.

### 3. Database

```bash
npx prisma migrate dev
npm run db:seed
```

### 4. Run

```bash
npm run dev
```

- Health: `http://localhost:5000/health`
- Google helper: `http://localhost:5000/google-signin`

### Scripts

| Command | Purpose |
|---------|---------|
| `npm run dev` | Dev server (tsx watch) |
| `npm run build` | `prisma generate` + `tsc` |
| `npm start` | Run `dist/server.js` |
| `npm run db:seed` | Seed demo admin |
| `npm run lint` | Biome lint |
| `npx prisma studio` | Database GUI |

### Postman

Import `postman/housing-platform.json`. Set `baseUrl` to `http://localhost:5000/api/v1`, then follow folders **0 → 7** (Auth → Property → Rental → Payment → Admin).

---

## Payments

### Stripe

1. `POST /payments/initiate` with `"gateway": "STRIPE"`
2. Open `checkoutUrl`; pay with test card `4242 4242 4242 4242`
3. Forward webhooks locally:

```bash
stripe listen --forward-to localhost:5000/api/v1/payments/webhook
```

4. Webhook verifies signature → payment `PAID`, booking `CONFIRMED`

### bKash (sandbox)

1. `POST /payments/initiate` with `"gateway": "BKASH"`
2. Open `checkoutUrl`
3. Typical sandbox wallet: `01770618575` · OTP `123456` · PIN `12121`
4. Callback: `GET /api/v1/payments/bkash/callback`

Notes:
- Prefer small sandbox amounts; some wallets return “Insufficient balance” due to sandbox limits.
- For real callbacks against localhost, expose the API with **ngrok** (or deploy) and set `BKASH_CALLBACK_URL=https://YOUR_PUBLIC_HOST/api/v1`.

---

## Deployment (Render)

1. Push `main` to GitHub.
2. **New → Web Service**, connect this repository.
3. Commands:

| Field | Value |
|-------|--------|
| Build | `npm install --include=dev && npm run build` |
| Pre-Deploy | `npx prisma migrate deploy` |
| Start | `npm start` |

4. Set production env vars (`DATABASE_URL`, `DIRECT_URL`, JWT, Stripe, Redis, SMTP, Cloudinary, bKash, etc.).
5. After deploy:
   - `BACKEND_URL=https://YOUR-SERVICE.onrender.com`
   - `BKASH_CALLBACK_URL=https://YOUR-SERVICE.onrender.com/api/v1`
   - Stripe Dashboard webhook → `https://YOUR-SERVICE.onrender.com/api/v1/payments/webhook`
6. Seed once: `npx prisma db seed` (with production DB URL).
7. Verify: `GET https://YOUR-SERVICE.onrender.com/health`

Free Render instances may cold-start in ~30–60s after idle.

---

## Demo credentials

After seed (from `.env`):

| Field | Default |
|-------|---------|
| Email | `admin@housing.com` |
| Password | `ChangeMeAdmin123!` |

Register additional `LANDLORD` / `TENANT` users via `POST /auth/register` for the full rental + payment demo.

---

## License

ISC · Assignment / educational use.
