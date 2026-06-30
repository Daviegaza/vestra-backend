# Vestra Backend

Node.js + TypeScript + Express + Prisma + PostgreSQL backend for the Vestra real-estate platform. JWT auth, multi-role users, properties, rentals, escrow, messaging, dashboards.

## Quick start

```bash
# 1. Install dependencies
npm install

# 2. Create your env file
cp .env.example .env
# edit DATABASE_URL to point at your Postgres instance

# 3. Create the database (one-time)
createdb vestra
psql -d vestra -c "CREATE USER vestra WITH PASSWORD 'vestra';"
psql -d vestra -c "GRANT ALL ON SCHEMA public TO vestra;"

# 4. Generate Prisma client + run migrations
npm run prisma:generate
npm run prisma:migrate -- --name init

# 5. Seed demo data (6 users, properties, blog)
npm run db:seed

# 6. Run dev server
npm run dev    # http://localhost:4000
```

Health check: `GET http://localhost:4000/health`

## Demo accounts

Password = `password` for all:

- `buyer@vestra.com`
- `seller@vestra.com`
- `landlord@vestra.com`
- `tenant@vestra.com`
- `agent@vestra.com`
- `admin@vestra.com`

## Hooking the frontend

In the frontend project (`vestra_properties/`), create `.env`:

```
VITE_API_URL=http://localhost:4000
```

Restart the frontend dev server. `src/services/api.ts` will route every call here.

## API surface

| Method | Path | Auth | Notes |
|---|---|---|---|
| POST | `/api/auth/register` | — | Returns `{ token, user }` |
| POST | `/api/auth/login` | — | Returns `{ token, user }` |
| GET  | `/api/auth/me` | bearer | Current user |
| POST | `/api/roles/activate` | bearer | Body: `{ role, meta? }` |
| POST | `/api/roles/switch` | bearer | Body: `{ role }` |
| DELETE | `/api/roles/:role` | bearer | Remove role (not `buyer`) |
| PATCH | `/api/users/me` | bearer | Profile update |
| GET  | `/api/properties` | — | Query: city, county, propertyType, listingType, minPrice, maxPrice, search, limit |
| GET  | `/api/properties/featured` | — | |
| GET  | `/api/properties/:id` | — | Increments view count |
| POST | `/api/properties` | seller/agent/landlord | Create |
| PATCH | `/api/properties/:id` | owner/agent/admin | |
| DELETE | `/api/properties/:id` | owner/admin | |
| GET  | `/api/agents` | — | |
| GET  | `/api/agents/:id` | — | |
| GET  | `/api/rentals/units` | landlord/admin | |
| POST | `/api/rentals/units` | landlord | |
| GET  | `/api/rentals/tenants` | landlord | |
| GET  | `/api/rentals/receipts` | bearer | Tenant: own; landlord: theirs |
| POST | `/api/rentals/pay` | tenant | Body: unitId, amount, period, paymentMethod, mpesaRef? |
| GET  | `/api/maintenance` | bearer | Role-scoped |
| POST | `/api/maintenance` | bearer | |
| GET  | `/api/leads` | agent/admin | |
| GET  | `/api/commissions` | agent/admin | |
| GET  | `/api/escrow` | bearer | Buyer or seller side |
| POST | `/api/escrow` | bearer | Create escrow |
| GET  | `/api/messages` | bearer | |
| POST | `/api/messages` | bearer | Sends + creates recipient notification |
| GET  | `/api/notifications` | bearer | + `unreadCount` |
| POST | `/api/notifications/:id/read` | bearer | |
| POST | `/api/notifications/read-all` | bearer | |
| GET  | `/api/dashboard/overview` | bearer | |
| GET  | `/api/dashboard/landlord` | landlord | |
| GET  | `/api/dashboard/agent` | agent | |
| GET  | `/api/blog` | — | |
| GET  | `/api/blog/:slug` | — | |

## Project layout

```
.
├─ package.json
├─ tsconfig.json
├─ .env.example
├─ prisma/
│  ├─ schema.prisma       # All models + enums
│  └─ seed.ts             # Demo data
└─ src/
   └─ index.ts            # Express app, middleware, all routes
```

The whole API lives in one file by design — easy to read end-to-end. Split into routers/controllers when it grows.

## Production

```bash
npm run build
NODE_ENV=production node dist/index.js
```

Set `JWT_SECRET` to a 32+ char random string. Use managed Postgres (Neon, Supabase, RDS). Put behind a TLS reverse proxy. Tune `RATE_LIMIT_MAX`.
# vestra-backend
