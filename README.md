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
- JWT access + refresh tokens (rotated on refresh); logout invalidates refresh tokens
- Forgot / reset password with Redis OTP (5-minute TTL, max 5 wrong attempts) and EJS email template
- Profile update and Cloudinary profile image upload (Multer)
- Seeded demo accounts for all three roles (see [Demo accounts](#demo-accounts))

### Security & quality
- Three roles: `ADMIN`, `LANDLORD`, `TENANT` with strict RBAC
- Bearer JWT on protected routes
- Helmet, CORS, and `express-rate-limit` (global + stricter limits on login/register/Google and OTP routes)
- Zod validation on request bodies, params, and queries
- Soft deletes (`deletedAt`) and audit logs for critical actions

### Housing domain
- Property and room CRUD (landlord-owned); partial `PATCH` updates only touch the fields sent
- Public listings with search, filter, sort, and pagination (only `PUBLISHED` properties are public)
- `GET /properties/my` — landlord's own properties in every status, paginated
- Rental requests: create → approve / reject / cancel
- Approve uses a Prisma interactive transaction with conditional updates (request must still be `PENDING`, room must still be available) to prevent double-booking under concurrency

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
1. ADMIN / demo LANDLORD / demo TENANT are seeded; ADMIN manages users and audits
2. LANDLORD registers → creates Property (DRAFT) → adds Room(s) → PATCH status PUBLISHED
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
| Room | `available: true` → `false` on approve → `true` again when the booking is cancelled |
| Booking | `PENDING_PAYMENT` → `CONFIRMED` or `CANCELLED` |
| Payment | `PENDING` → `PAID` / `FAILED` / `CANCELLED` (a `FAILED` Stripe payment can still become `PAID` if the customer retries in the same checkout) |

**State rules enforced by the API (`409 Conflict`):**

- Rental requests can only be created for `PUBLISHED` properties.
- Approve / reject / cancel only succeed while the request is still `PENDING`.
- A room with an active booking (`PENDING_PAYMENT` / `CONFIRMED`) cannot be marked `available: true`, and neither the room nor its property can be deleted until that booking is cancelled.
- Deleting a room or property automatically rejects its `PENDING` rental requests.
- Starting a new payment closes (expires) any earlier open checkout for the same booking, so a booking can't be paid twice.
- A payment that arrives after its booking was cancelled is recorded as `PAID` but does **not** revive the booking; it is flagged with a `PAYMENT_REQUIRES_REFUND` audit log for manual refund.

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
| `400` | Validation (Zod), malformed JSON, non-image upload |
| `401` | Missing or invalid token |
| `403` | Wrong role or ownership, blocked account, protected demo account |
| `404` | Missing, soft-deleted, or not-visible (e.g. another landlord's draft) resource |
| `409` | Invalid state (e.g. already approved, room booked, duplicate unique value) |
| `413` | Uploaded file larger than 5 MB |
| `429` | Rate limit exceeded |
| `502` | Payment provider error |
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
| `POST` | `/auth/logout` | Access token and/or `refreshToken` | With `refreshToken`: revoke that session. With only an access token: revoke all sessions |
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
| `GET` | `/properties` | Public | List + search / filter / sort / pagination (`PUBLISHED` only; `?status=DRAFT` / `ARCHIVED` is admin-only) |
| `GET` | `/properties/my` | Landlord / Admin | Caller's own properties (all statuses), paginated |
| `GET` | `/properties/:id` | Public | Property detail (drafts/archived: owner or admin only, otherwise `404`) |
| `POST` | `/properties` | Landlord / Admin | Create |
| `PATCH` | `/properties/:id` | Owner / Admin | Update |
| `DELETE` | `/properties/:id` | Owner / Admin | Soft delete |
| `POST` | `/properties/:propertyId/rooms` | Owner / Admin | Add room |
| `GET` | `/properties/:propertyId/rooms` | Public | List rooms (same visibility as the property) |
| `PATCH` | `/rooms/:id` | Owner / Admin | Update room |
| `DELETE` | `/rooms/:id` | Owner / Admin | Soft delete room |

Query example:  
`?page=1&limit=10&search=gulshan&city=Dhaka&minRent=5000&maxRent=20000&propertyType=APARTMENT&available=true&sortBy=monthlyRent&sortOrder=asc`

`GET /properties/my` query: `page`, `limit` (max 100), `search`, `status` (`DRAFT` / `PUBLISHED` / `ARCHIVED`), `sortBy` (`createdAt` / `monthlyRent` / `title` / `city`), `sortOrder`.

`PATCH /properties/:id` and `PATCH /rooms/:id` are true partial updates: omitted fields keep their current values (an empty body returns `400`).

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

`GET /payments/my` and `GET /payments/:id` include a `booking` summary (dates, status, property, room). Booking responses include a `tenant` summary.

### Admin

| Method | Path | Access | Description |
|--------|------|--------|-------------|
| `GET` | `/admin/users` | Admin | List users. Optional `search` (name/email/phone), `role`, `status`, `page`, `limit` (max 100). Without `limit` the full list is returned; `meta` is always included |
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
│   └── seed.ts                    # Demo ADMIN / LANDLORD / TENANT
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

### Demo accounts

`npm run db:seed` (same as `npx prisma db seed`) creates or resets one account per role. It is idempotent: re-running restores the name, password, role and `ACTIVE` status. The defaults below are public demo credentials for development/evaluation; override them with the env variables listed.

| Role | Email | Password | Override env |
|------|-------|----------|--------------|
| `ADMIN` | `admin@housing.com` | `ChangeMeAdmin123!` | `ADMIN_EMAIL` / `ADMIN_PASSWORD` |
| `LANDLORD` | `landlord@housing.com` | `Landlord123!` | `DEMO_LANDLORD_EMAIL` / `DEMO_LANDLORD_PASSWORD` |
| `TENANT` | `tenant@housing.com` | `Tenant123!` | `DEMO_TENANT_EMAIL` / `DEMO_TENANT_PASSWORD` |

With `PROTECT_DEMO_ACCOUNTS=true` (default), these accounts cannot be blocked, re-roled, or password-reset through the API (`403`), so one-click demo login keeps working.

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
| `npm run db:seed` | Create / reset demo accounts |
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

Rents are stored in BDT, so Stripe charges in `STRIPE_CURRENCY` (default `bdt`) and the payment row records that currency. Stripe rejects totals below roughly USD 0.50 (about ৳60); the API returns `400` with Stripe's message in that case.

To let the frontend identify the returning checkout, `STRIPE_SUCCESS_URL` may include Stripe's placeholder, e.g. `https://your-frontend/payment/success?session_id={CHECKOUT_SESSION_ID}`. The session id equals the payment's `gatewayPaymentId`.
3. Local webhooks:

```bash
stripe listen --forward-to localhost:5000/api/v1/payments/webhook
```

4. Signed webhook → payment `PAID`, booking `CONFIRMED`.

Enable these webhook events on the Stripe endpoint:

| Event | Effect |
|-------|--------|
| `checkout.session.completed` | `PAID` + booking `CONFIRMED` (only when `payment_status` is `paid`) |
| `checkout.session.async_payment_succeeded` | `PAID` + booking `CONFIRMED` |
| `checkout.session.async_payment_failed` | `FAILED` |
| `checkout.session.expired` | `CANCELLED` |
| `payment_intent.payment_failed` | `FAILED` (matched via PaymentIntent metadata / checkout session) |

`STRIPE_SUCCESS_URL` receives no payment id; the success page should re-fetch `GET /payments/my` or `GET /bookings/:id` until the webhook has confirmed the booking.

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
| `ALLOW_OTP_IN_RESPONSE` | Default `false`. If `true` and sending fails, `otp` is returned in the JSON body. Local debugging only: in production it lets anyone reset any account's password |

With `onboarding@resend.dev`, Resend only delivers to the account owner unless a custom domain is verified. `RESEND_TEST_TO` delivers the **same OTP** stored in Redis and notes the intended account in the email body.

- `emailSent: true` → use the code from email (optional `deliveredTo` field).
- `emailSent: false` → only when `ALLOW_OTP_IN_RESPONSE=true`: use `data.otp` from the API response.

After 5 wrong OTPs the code is invalidated and a new one must be requested.

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
ALLOW_OTP_IN_RESPONSE=false
```

Set `CORS_ORIGIN` / `FRONTEND_URL` / `STRIPE_SUCCESS_URL` / `STRIPE_CANCEL_URL` to the deployed frontend.

Also set `DATABASE_URL`, `DIRECT_URL`, JWT secrets, Stripe, Redis, Cloudinary, bKash, and:

```env
BACKEND_URL=https://b7a6-assignment-backend.onrender.com
BKASH_CALLBACK_URL=https://b7a6-assignment-backend.onrender.com/api/v1
```

Stripe Dashboard webhook endpoint:

`https://b7a6-assignment-backend.onrender.com/api/v1/payments/webhook`

Seed against the production database to create/reset the demo accounts: `npx prisma db seed`.

---

## License

ISC · Educational / assignment use.
