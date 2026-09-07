# Housing & Roommate Management Platform — Backend

B7A6 backend assignment (Student ID ends in **6**).

REST API for landlords to list properties/rooms, tenants to request rentals and pay via **Stripe**, and admins to manage the platform.

**No frontend** — use Postman / Thunder Client.

## Features

- Auth: register, login, Google login, JWT access + refresh, logout
- Roles: `ADMIN`, `LANDLORD`, `TENANT` (strict RBAC)
- Properties + rooms (search, filter, pagination, soft delete)
- Rental request workflow + transaction-safe booking
- **Stripe** Checkout + webhook verification (real payments)
- Admin users, roles/status, dashboard stats, audit logs
- Helmet, CORS, rate limiting, Zod validation

## Payment note

- **Stripe** = fully implemented (initiate → Checkout → webhook → `PAID` + booking `CONFIRMED`)
- **bKash** = enum + gateway stub only — **not implemented**, no fake URLs

## Tech stack

Node.js · TypeScript · Express · PostgreSQL · Prisma · Zod · JWT · Stripe · Helmet · CORS · express-rate-limit · Biome

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

Fill at least:

```env
DATABASE_URL="postgresql://USER:PASSWORD@localhost:5432/housing_roommate?schema=public"
JWT_ACCESS_SECRET=...
JWT_REFRESH_SECRET=...
ADMIN_EMAIL=admin@housing.com
ADMIN_PASSWORD=ChangeMeAdmin123!
STRIPE_SECRET_KEY=sk_test_...
STRIPE_WEBHOOK_SECRET=whsec_...
GOOGLE_CLIENT_ID=...   # for Google login
```

Never commit real secrets. Do not paste Stripe/Google secrets into chat.

### 3. Database

```bash
npx prisma migrate dev --name init
npm run db:seed
```

### 4. Run

```bash
npm run dev
```

Health: `GET http://localhost:5000/health`

## Scripts

| Command | Purpose |
|---------|---------|
| `npm run dev` | Dev server with reload |
| `npm run build` | TypeScript compile |
| `npm start` | Run compiled `dist` |
| `npm run db:seed` | Seed demo admin |
| `npx prisma studio` | DB GUI |

## Core API (all under `/api/v1`)

| Area | Endpoints |
|------|-----------|
| Auth | `POST /auth/register`, `/login`, `/google`, `/refresh-token`, `/logout` |
| User | `GET/PATCH /users/me` |
| Property | `POST/GET/PATCH/DELETE /properties`, `GET /properties/:id` |
| Room | `POST/GET /properties/:propertyId/rooms`, `PATCH/DELETE /rooms/:id` |
| Rental | `POST /rental-requests`, `GET .../my`, `.../received`, approve/reject/cancel |
| Booking | `GET /bookings/my`, `GET /bookings/:id`, `PATCH .../cancel` |
| Payment | `POST /payments/initiate`, `POST /payments/webhook`, `GET /payments/my`, `GET /payments/:id` |
| Admin | `/admin/users`, status/role, `/dashboard-stats`, `/audit-logs` |

Response shape:

```json
{ "success": true, "message": "...", "data": {} }
```

Errors:

```json
{ "success": false, "message": "...", "errors": [] }
```

## Stripe flow

1. Tenant: `POST /payments/initiate` with `{ "bookingId": "..." }`
2. Backend creates PENDING payment + Stripe Checkout Session
3. Client opens `checkoutUrl`
4. Stripe webhook → signature verified → Payment `PAID`, Booking `CONFIRMED`

Local webhook:

```bash
stripe listen --forward-to localhost:5000/api/v1/payments/webhook
```

## Future bKash

```
src/modules/payment/gateways/
  stripe.gateway.ts      # active
  payment-gateway.interface.ts
  (BkashGateway stub rejects until real integration)
```

## Deployment (Render)

- Set env vars (including `DATABASE_URL`, Stripe, JWT, CORS)
- Build: `npm install && npx prisma generate && npm run build`
- Start: `npx prisma migrate deploy && npm start`
- Point Stripe webhook to `https://YOUR_HOST/api/v1/payments/webhook`

## Demo admin

From `.env` after seed:

- Email: `ADMIN_EMAIL`
- Password: `ADMIN_PASSWORD`

## Postman

Import `postman/housing-platform.json` and set `baseUrl`, `accessToken`, role tokens.

## Architecture

```
Routes → Validation → Auth → RBAC → Controller → Service → Prisma → PostgreSQL
```
