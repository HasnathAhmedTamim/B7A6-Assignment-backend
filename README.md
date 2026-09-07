# Housing & Roommate Management Platform

**Backend REST API** · Programming Hero Level-2 · Batch-7 · Assignment **B7A6**

A modular Express API for landlords to publish properties and rooms, tenants to search, apply, and pay online, and admins to manage users and audit activity.

---

## Submission

| Field | Link / value |
|-------|----------------|
| **Project** | Housing & Roommate Management Platform |
| **Repository** | [HasnathAhmedTamim/B7A6-Assignment-backend](https://github.com/HasnathAhmedTamim/B7A6-Assignment-backend) |
| **Live API** | [https://b7a6-assignment-backend.onrender.com](https://b7a6-assignment-backend.onrender.com) |
| **API base path** | `/api/v1` |
| **Health check** | [GET /health](https://b7a6-assignment-backend.onrender.com/health) |
| **API documentation** | [Postman Documenter](https://documenter.getpostman.com/view/31892953/2sBYAxP9Sg) |
| **Demo video** | [Google Drive (assignment6-backend.mp4)](https://drive.google.com/file/d/1r1RS6bkx_p_TJbu0j-YgWuVCGmfh-GA1/view?usp=sharing) |

> Free Render instances may take 30–60 seconds to wake after idle. Hit `/health` once before testing.

---

## Table of contents

1. [Features](#features)
2. [Tech stack](#tech-stack)
3. [Architecture](#architecture)
4. [Business workflow](#business-workflow)
5. [API response format](#api-response-format)
6. [API reference](#api-reference)
7. [Project structure](#project-structure)
8. [Getting started](#getting-started)
9. [Payments](#payments)
10. [Email & OTP](#email--otp)
11. [Deployment](#deployment)
12. [License](#license)

---

## Features

### Authentication & users
- Email/password registration and login (bcrypt)
- Google sign-in (ID token verification)
- JWT access + refresh tokens; logout invalidates refresh tokens
- Forgot / reset password with Redis OTP (5-minute TTL) and EJS email template
- Profile update and Cloudinary profile image upload (Multer)

### Security & quality
- Three roles: `ADMIN`, `LANDLORD`, `TENANT` with strict RBAC
- Bearer JWT on protected routes
- Helmet, CORS, and `express-rate-limit`
- Zod validation on request bodies, params, and queries
- Soft deletes (`deletedAt`) and audit logs for critical actions

### Housing domain
- Property and room CRUD (landlord-owned)
- Public listings with search, filter, sort, and pagination
- Rental requests: create → approve / reject / cancel
- Approve uses a Prisma interactive transaction (room locked + booking created) to prevent double-booking

### Payments
- **Stripe** Checkout Session + signed webhook
- **bKash** Tokenized Checkout (sandbox) + execute callback
- Shared gateway interface behind `POST /payments/initiate`
- Payment history and status tracking (`PENDING` → `PAID` / `FAILED` / `CANCELLED`)

### Admin
- User list, status (`ACTIVE` / `BLOCKED`), and role updates
- Dashboard aggregate statistics
- Paginated audit logs

---

## Tech stack

| Layer | Technology | Purpose |
|-------|------------|---------|
| Runtime | Node.js, TypeScript | Typed server |
| Framework | Express 5 | HTTP API |
| Database | PostgreSQL (Neon) + Prisma | Relations, migrations, transactions |
| Validation | Zod | Request schemas |
| Auth | JWT, bcrypt, Google Auth Library | Credentials + social login |
| Cache | Redis | OTP storage, bKash token cache |
| Email | Resend (production) / Gmail SMTP (local) + EJS | Transactional OTP |
| Files | Multer + Cloudinary | Profile images |
| Payments | Stripe, bKash | Real checkout + callbacks |
| Security | Helmet, CORS, express-rate-limit | Hardening |
| Quality | Biome | Lint / format |
| Docs | Postman | Collection + published docs |
| Hosting | Render | Production web service |

---

## Architecture

**Style:** modular monolith — each domain owns `route` → `controller` → `service` → `schema`.

```text
Client (Postman)
  → Helmet / CORS / Rate limit
  → JSON body (Stripe webhook uses raw body)
  → /api/v1/...
  → Zod validation
  → JWT authenticate + RBAC authorize
  → Controller
  → Service (business rules + Prisma)
  → PostgreSQL
  → sendResponse / globalErrorHandler
```

**Payment path:**

```text
POST /payments/initiate { bookingId, gateway }
  → Payment row (PENDING)
  → Stripe checkoutUrl  or  bKash checkoutUrl
  → User pays on provider UI
  → Stripe webhook  or  bKash callback
  → Payment PAID + Booking CONFIRMED (+ audit log)
```

---

## Business workflow

```text
1. ADMIN is seeded; manages users and audits
2. LANDLORD registers → creates Property → adds Room(s)
3. TENANT browses GET /properties (?search&city&minRent&page…)
4. TENANT submits POST /rental-requests
5. LANDLORD PATCH .../approve
      └─ transaction: APPROVED + room unavailable + booking PENDING_PAYMENT
6. TENANT POST /payments/initiate { gateway: "STRIPE" | "BKASH" }
7. Completes provider checkout
8. Webhook / callback → booking CONFIRMED
9. ADMIN reviews dashboard, users, audit logs
```

| Entity | Typical status path |
|--------|---------------------|
| Rental request | `PENDING` → `APPROVED` / `REJECTED` / `CANCELLED` |
| Room | `available: true` → `false` on approve |
| Booking | `PENDING_PAYMENT` → `CONFIRMED` or `CANCELLED` |
| Payment | `PENDING` → `PAID` / `FAILED` / `CANCELLED` |

---

## API response format

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

`meta` appears on paginated lists. `data` may be an object, array, or `null`.

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

| HTTP | Case |
|------|------|
| `400` | Validation (Zod) |
| `401` | Missing or invalid token |
| `403` | Wrong role or ownership |
| `404` | Missing or soft-deleted resource |
| `409` | Invalid state (e.g. already approved) |
| `500` | Unexpected server error |

```http
Authorization: Bearer <accessToken>
```

---

## API reference

| Environment | Base URL |
|-------------|----------|
| Local | `http://localhost:5000/api/v1` |
| Production | `https://b7a6-assignment-backend.onrender.com/api/v1` |

Helpers: `GET /health`, `GET /`, `GET /google-signin` (dev Google ID token helper).

### Auth

| Method | Path | Access | Description |
|--------|------|--------|-------------|
| `POST` | `/auth/register` | Public | Register (`TENANT` / `LANDLORD`) |
| `POST` | `/auth/login` | Public | Email/password login |
| `POST` | `/auth/google` | Public | Google ID token login |
| `POST` | `/auth/refresh-token` | Public | Rotate access token |
| `POST` | `/auth/logout` | Auth | Invalidate refresh token |
| `POST` | `/auth/forgot-password` | Public | Send OTP email |
| `POST` | `/auth/reset-password` | Public | Reset with OTP + new password |

### Users

| Method | Path | Access | Description |
|--------|------|--------|-------------|
| `GET` | `/users/me` | Auth | Current profile |
| `PATCH` | `/users/me` | Auth | Update profile |
| `PATCH` | `/users/profile-image` | Auth | Upload `profileImage` → Cloudinary |

### Properties & rooms

| Method | Path | Access | Description |
|--------|------|--------|-------------|
| `GET` | `/properties` | Public | List + search / filter / sort / pagination |
| `GET` | `/properties/:id` | Public | Property detail |
| `POST` | `/properties` | Landlord / Admin | Create |
| `PATCH` | `/properties/:id` | Owner / Admin | Update |
| `DELETE` | `/properties/:id` | Owner / Admin | Soft delete |
| `POST` | `/properties/:propertyId/rooms` | Owner / Admin | Add room |
| `GET` | `/properties/:propertyId/rooms` | Public | List rooms |
| `PATCH` | `/rooms/:id` | Owner / Admin | Update room |
| `DELETE` | `/rooms/:id` | Owner / Admin | Soft delete room |

Query example:  
`?page=1&limit=10&search=gulshan&city=Dhaka&minRent=5000&maxRent=20000&propertyType=APARTMENT&available=true&sortBy=monthlyRent&sortOrder=asc`

### Rental requests

| Method | Path | Access | Description |
|--------|------|--------|-------------|
| `POST` | `/rental-requests` | Tenant | Create request |
| `GET` | `/rental-requests/my` | Tenant / Admin | My requests |
| `GET` | `/rental-requests/received` | Landlord / Admin | Incoming requests |
| `PATCH` | `/rental-requests/:id/approve` | Landlord / Admin | Approve → booking |
| `PATCH` | `/rental-requests/:id/reject` | Landlord / Admin | Reject |
| `PATCH` | `/rental-requests/:id/cancel` | Tenant / Admin | Cancel pending |

### Bookings

| Method | Path | Access | Description |
|--------|------|--------|-------------|
| `GET` | `/bookings/my` | Auth | My bookings |
| `GET` | `/bookings/:id` | Auth | Booking detail |
| `PATCH` | `/bookings/:id/cancel` | Auth | Cancel booking |

### Payments

| Method | Path | Access | Description |
|--------|------|--------|-------------|
| `POST` | `/payments/initiate` | Tenant / Admin | Start Stripe or bKash |
| `POST` | `/payments/webhook` | Stripe | Signed webhook (raw body) |
| `GET` | `/payments/bkash/callback` | bKash | Execute + finalize |
| `GET` | `/payments/my` | Tenant / Admin | My payments |
| `GET` | `/payments/:id` | Auth | Payment detail |

```json
{
  "bookingId": "uuid",
  "gateway": "STRIPE"
}
```

`gateway`: `"STRIPE"` (default) or `"BKASH"`. Response includes `checkoutUrl`.

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
│   ├── schema.prisma              # Models, enums, indexes, soft deletes
│   ├── migrations/                # SQL migrations
│   └── seed.ts                    # Demo ADMIN
├── postman/
│   └── housing-platform.json      # Full API collection
├── public/
│   └── google-signin.html         # Dev Google idToken helper
├── scripts/
│   └── set-bkash-test-amount.ts
├── src/
│   ├── app.ts                     # Express: security, routes, errors
│   ├── server.ts                  # Boot: Prisma, Redis, email, listen
│   ├── config/index.ts            # Zod-validated env
│   ├── routes/index.ts            # /api/v1 module mount
│   ├── middlewares/               # auth, rbac, validation, errors
│   ├── modules/
│   │   ├── auth/
│   │   ├── user/
│   │   ├── property/              # properties + rooms
│   │   ├── rentalRequest/
│   │   ├── booking/
│   │   ├── payment/
│   │   │   └── gateways/          # Stripe, bKash, interface
│   │   └── admin/
│   ├── lib/                       # prisma, redis, email, cloudinary, multer, bkash
│   ├── templates/                 # EJS email templates
│   ├── types/
│   └── utils/                     # AppError, jwt, sendResponse, audit
├── .env.example
├── package.json
└── README.md
```

| File pattern | Responsibility |
|--------------|----------------|
| `*.route.ts` | Paths, methods, middleware |
| `*.controller.ts` | HTTP ↔ service ↔ `sendResponse` |
| `*.service.ts` | Business rules, Prisma, transactions |
| `*.schema.ts` | Zod body / params / query |
| `gateways/*` | Payment provider adapters |

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

Minimum required:

```env
DATABASE_URL="postgresql://..."
DIRECT_URL="postgresql://..."
JWT_ACCESS_SECRET=...
JWT_REFRESH_SECRET=...
ADMIN_EMAIL=admin@housing.com
ADMIN_PASSWORD=ChangeMeAdmin123!
STRIPE_SECRET_KEY=sk_test_...
STRIPE_WEBHOOK_SECRET=whsec_...
```

**Local email (Gmail App Password):**

```env
SMTP_USER=you@gmail.com
SMTP_PASSWORD=xxxx xxxx xxxx xxxx
SMTP_FROM=you@gmail.com
```

**Production email (Resend):** see [Email & OTP](#email--otp).  
Also configure Redis, Cloudinary, Google, and bKash as needed — see `.env.example`.

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

| Command | Purpose |
|---------|---------|
| `npm run dev` | Development server (tsx watch) |
| `npm run build` | `prisma generate` + `tsc` |
| `npm start` | Run `dist/server.js` |
| `npm run db:seed` | Seed demo admin |
| `npm run lint` | Biome lint |
| `npx prisma studio` | Database GUI |

### Postman

1. Import `postman/housing-platform.json`, or use the [published docs](https://documenter.getpostman.com/view/31892953/2sBYAxP9Sg).
2. Set `baseUrl` to local or `https://b7a6-assignment-backend.onrender.com/api/v1`.
3. Walk folders **0 → 7** (Auth → Property → Rental → Payment → Admin).

---

## Payments

### Stripe

1. `POST /payments/initiate` with `"gateway": "STRIPE"`.
2. Open `checkoutUrl`; pay with test card `4242 4242 4242 4242`.
3. Local webhooks:

```bash
stripe listen --forward-to localhost:5000/api/v1/payments/webhook
```

4. Signed webhook → payment `PAID`, booking `CONFIRMED`.

### bKash (sandbox)

1. `POST /payments/initiate` with `"gateway": "BKASH"`.
2. Open `checkoutUrl`.
3. Typical sandbox: wallet `01770618575` · OTP `123456` · PIN `12121`.
4. Callback: `GET /api/v1/payments/bkash/callback`.

**Notes:** Prefer small sandbox amounts. For localhost callbacks, use ngrok (or the live Render URL) and set `BKASH_CALLBACK_URL` to `https://YOUR_PUBLIC_HOST/api/v1`.

---

## Email & OTP

```text
POST /auth/forgot-password
  → OTP stored in Redis (5 min)
  → EJS email sent
POST /auth/reset-password { email, otp, newPassword }
```

| Environment | Provider |
|-------------|----------|
| Local | Gmail SMTP via Nodemailer |
| Render | [Resend](https://resend.com) HTTPS API |

Render free tier blocks outbound SMTP (`25` / `465` / `587`). Production mail uses Resend on port `443`.

| Variable | Purpose |
|----------|---------|
| `RESEND_API_KEY` | Resend API key |
| `RESEND_FROM` | Sender (e.g. `Housing Platform <onboarding@resend.dev>`) |
| `RESEND_TEST_TO` | Redirect OTP mail to your Resend account email (required on free tier) |
| `ALLOW_OTP_IN_RESPONSE` | If send fails, return `otp` in the JSON body for demos |

With `onboarding@resend.dev`, Resend only delivers to the account owner unless a custom domain is verified. `RESEND_TEST_TO` delivers the **same OTP** stored in Redis and notes the intended account in the email body.

- `emailSent: true` → use the code from email (optional `deliveredTo` field).
- `emailSent: false` → use `data.otp` from the API response.

Optional alternative: `BREVO_API_KEY` (Brevo HTTPS).

---

## Deployment

Hosted on **Render** as a Node web service.

| Field | Value |
|-------|--------|
| Build | `npm install --include=dev && npm run build` |
| Pre-Deploy | `npx prisma migrate deploy` |
| Start | `npm start` |

**Production email (required for live OTP):**

```env
RESEND_API_KEY=re_...
RESEND_FROM=Housing Platform <onboarding@resend.dev>
RESEND_TEST_TO=your-resend-account@gmail.com
ALLOW_OTP_IN_RESPONSE=true
```

Also set `DATABASE_URL`, `DIRECT_URL`, JWT secrets, Stripe, Redis, Cloudinary, bKash, and:

```env
BACKEND_URL=https://b7a6-assignment-backend.onrender.com
BKASH_CALLBACK_URL=https://b7a6-assignment-backend.onrender.com/api/v1
```

Stripe Dashboard webhook endpoint:

`https://b7a6-assignment-backend.onrender.com/api/v1/payments/webhook`

Seed once against the production database: `npx prisma db seed`.

---

## License

ISC · Educational / assignment use.
