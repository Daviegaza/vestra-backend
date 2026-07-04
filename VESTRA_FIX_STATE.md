# Vestra Fix State — session 2026-07-04

Snapshot of where the "make it best in world" fix pass stands. Read this first if resuming.

## Repos in scope

- `/home/davie/WebstormProjects/vestra-backend`  — Node/Express/Prisma monolith (`src/index.ts`)
- `/home/davie/WebstormProjects/vestra_properties` — React 19 / Vite 8 / Capacitor mobile

## Audits run (background agents, 2026-07-04)

All 4 completed. Summaries below. Full text was in tmp agent outputs — likely gone. Re-run if needed.

### Backend — 7 CRITICAL / 11 HIGH / 8 MEDIUM

CRITICALs and their fix status (all now PATCHED in Phase 1):

- [x] JWT_SECRET fallback `dev-secret-change-me` — now env-validated (32+ char, fail-fast on start)
- [x] Privilege escalation via `POST /api/roles/activate { role: 'admin' }` — admin removed from self-serve enum
- [x] IDOR on `POST /api/rentals/pay` — added active-lease check
- [x] IDOR on `POST /api/escrow` — sellerId now derived from `property.ownerId`, buyer!=seller enforced
- [x] IDOR on `POST /api/maintenance` — landlord/tenant/admin membership check
- [x] Auth endpoints shared global 200 req/min limiter — now separate `authLimiter` (10 / 15min)
- [x] Seed script (`prisma/seed.ts`) with `password` for `admin@vestra.com` runnable against prod — now gated on `NODE_ENV=production` + `ALLOW_SEED=true` opt-in
- [x] Error handler leaked internal Prisma messages — now generic + requestId

Other HIGH fixes applied:

- [x] Property view counter used `update` — now `findUnique` then fire-and-forget increment
- [x] Property list unbounded `limit` — now zod-validated pagination with `perPage.max(100)`
- [x] Rentals `/receipts` had no role guard — added `requireRole('tenant','landlord','admin')`
- [x] Chama list N+1 — replaced with single `groupBy`
- [x] Role switch didn't check `status === 'active'` — added
- [x] Subscription `/cancel` accepted arbitrary role string — now zod-parsed
- [x] E.164 phone validation on register — added `^\+254[17]\d{8}$`
- [x] Graceful shutdown on SIGTERM/SIGINT — added
- [x] Request ID middleware — added
- [x] 404 catch-all — added
- [x] Health readiness/liveness split — `/health/live` + `/health/ready`
- [x] `trust proxy` + `x-powered-by` disabled

Phase 2 (this session):

- [x] Prisma schema hardening: `AgentProfile.subscriptionTier` → enum + `@updatedAt` + rating/county indexes + EARB verification cache. `Lease` `@updatedAt` + 4 indexes. `RentReceipt` 3 indexes + landlord relation + `mpesaRef @unique` (idempotency guard). `Commission` `@updatedAt` + 2 indexes. `Property` +4 composite indexes (city+status+listingType, county+status+listingType, price, isFeatured+status). `Escrow` +3 indexes. `RentalUnit` +updatedAt/index. `Lead` +updatedAt/indexes. `Message` +conversationId (denormalized for cheap `/messages/conversations` grouping) + (receiverId,read) index. `Notification` compound (userId,read,createdAt).
- [x] New models: `AgentReview` (unique per reviewer+agent), `PropertyFavorite` (unique per user+property), `PropertyInquiry`, `AuditLog` (append-only, `AuditAction` enum), `RefreshToken` (hash-only, parent chain for replay detection), `PasswordReset` (hash-only, 30-min TTL), `VerificationRequest` (`VerificationKind` × `VerificationStatus`, propagates to Property/AgentProfile/User on approve), `IdempotencyRecord` (unique per user+key+route, 24h TTL).
- [x] Baseline migration written (`prisma/migrations/00000000000000_baseline/migration.sql`, 877 lines). Apply with `prisma migrate deploy` after `DATABASE_URL` is set.
- [x] Helper modules: `src/lib/qs.ts` (query-string narrowing), `src/lib/audit.ts` (fire-and-forget `writeAudit`), `src/lib/tokens.ts` (refresh-token issue/rotate/revoke with replay detection + password reset), `src/lib/mpesa.ts` (Daraja 3.0 STK Push + msisdn normalizer + callback secret verify — needs env keys to arm), `src/lib/idempotency.ts` (middleware + `saveIdempotencyResult`).
- [x] Spec endpoints added: `POST /auth/refresh` (rotates refresh, revokes chain on replay), `POST /auth/logout` (opt `everywhere:true`), `POST /auth/change-password` (revokes all sessions), `POST /auth/forgot-password` (never leaks user existence, logs token in dev), `POST /auth/reset-password`. `GET /properties/my`, `POST /properties/:id/inquiry` (anonymous allowed, transaction fans out to Lead + Notification + counter increment), `POST/DELETE /properties/:id/favorite`, `GET /properties/favorites/mine`. `GET /agents/top`, `GET /agents/:id/listings`, `POST /agents/:id/review` (recomputes profile rating/count), `GET /agents/:id/reviews`. `POST /verify/requests` (kind × subject with ownership check), `GET /verify/requests/mine`, `GET /verify/requests` (admin), `POST /verify/requests/:id/decide` (approval propagates isVerified/earbVerified/isKycVerified). `GET /dashboard/stats` (role-scoped), `GET /dashboard/activity` (notifications + audit tail). `GET /messages/conversations` (single raw SQL DISTINCT ON + unread count). `GET /escrow/:id` (party or admin only).
- [x] `register` + `login` now also return `refreshToken` + `refreshExpiresAt`. Message create computes `conversationId` (sorted pair) and blocks self-messages.
- [x] Pre-existing 21 tsc errors fixed by pinning `@types/express` to `^4.17.21` (was `^5.0.0`, drift with runtime `express@^4.21.2` caused params/query narrowing failures).
- [x] Frontend `capacitor.config.ts` iOS `limitsNavigationsToAppBoundDomains: true` (requires `WKAppBoundDomains` array in Info.plist).
- [x] Frontend `src/services/api.ts` rewritten with refresh-token rotation (single-flight promise), auto-retry on 401, `session:expired` event on unrecoverable 401, `AbortController` compatible (Signal passes through). Mock helpers kept as legacy shim so existing callers still compile.
- [x] `src/components/ai/AIAssistant.tsx` — `renderMarkdown` now HTML-escapes user input before applying **bold** + newline transforms. Blocks script tag / attribute XSS via chat.
- [x] `.env.production` + `.env.example` added on frontend.

Deferred to next session (in priority order):

- [ ] Full monolith split of `src/index.ts` (still 1700+ lines). Pure refactor — behavior unchanged but improves testability.
- [ ] AuditLog *writes* on remaining financial ops (rent pay, escrow create/status, subscription create/cancel, chama contribute, extension approve/decline, admin actions). Helper is wired; needs callsite additions.
- [ ] Idempotency middleware application to financial POSTs (helper module lives at `src/lib/idempotency.ts`; still needs `app.use(idempotency(prisma))` on `/api/rentals/pay`, `/api/subscriptions/subscribe`, `/api/chamas/:id/contribute`, `/api/escrow`, `/api/extensions`).
- [ ] Daraja STK Push wiring in route handlers + `/api/mpesa/callback/:secret` endpoint (helper module `src/lib/mpesa.ts` ready — arm by setting `DARAJA_*` env vars).
- [ ] Structured logging: replace morgan with pino + pino-http.
- [ ] Vitest + supertest scaffold; priority tests for auth flow, refresh rotation, role activate/switch, rent pay IDOR, escrow IDOR, subscription, verify decide.
- [ ] Currency enum + per-currency aggregation.
- [ ] EARB scraper cron for `agentProfile.earbVerified` refresh.
- [ ] Frontend: HttpOnly cookie migration (needs backend cookie-based auth + CORS `credentials: true` + Capacitor cookie strategy — currently blocked by scope, tokens still in localStorage but refresh rotation limits blast radius).
- [ ] Frontend: `AuthGuard.initialized` state to stop login-flash on hard refresh; AbortController threaded through `useAsync`; global `session:expired` listener in app root to clear Zustand + redirect.
- [ ] Migrate `services/auth.ts`, `services/escrow.ts`, `services/blog.ts` off `mockCall` to real endpoints (real endpoints now exist).
- [ ] Meilisearch integration for property search (replace ILIKE OR chain).

## TypeScript state

`tsc -p tsconfig.json --noEmit` — **0 errors** after this session. The 21 pre-existing errors were all caused by `@types/express@^5.0.0` drift against runtime `express@^4.21.2`; pinned to `^4.17.21`.

## Frontend — 4 CRITICAL / 13 HIGH / 10 MEDIUM (NOT YET PATCHED)

Blockers before production:

1. **JWT stored in localStorage** (`src/services/api.ts:15-23`) — move to HttpOnly cookie via backend
2. **XSS in `AIAssistant.tsx`** — unsafe raw HTML injection with unsanitized regex on user chat input; use `react-markdown` or DOMPurify
3. **`.env` `VITE_API_URL=http://localhost:4000`** ships if not overridden — add `.env.production`, doc `VITE_API_URL`
4. **`capacitor.config.ts` iOS** navigation domain restriction disabled — flip to true, associated-domains entitlement, external opens via `@capacitor/browser`

Other HIGH:

- No AbortController in `useAsync` → race conditions on fast nav
- `login` legacy shim silently swallows errors
- AuthGuard flashes login on hard refresh (add `initialized` state)
- 401 not globally intercepted → user not logged out on token expiry
- `services/properties.ts:33` over-fetches 4x for pagination (should hit `page/perPage` from backend now that backend supports it)
- Mock helpers (`mockCall`, `maybeThrow`, `delay`) shipped in prod bundle
- No focus trap on modals, no skip-nav, safe-area only on bottom nav
- No AndroidBackButton handler
- No Capacitor deep-link handler
- No test setup
- OTP login exposed as "simulated" to production users

## Cross-repo — 15+ backend routes missing per API-spec

Spec (`vestra_properties/backend-api-spec.md`) was written for FastAPI/Python; backend is Node/Express. Path/verb drift throughout. Priority missing endpoints:

- `POST /api/auth/refresh` (needed for JWT rotation)
- `POST /api/auth/logout` (with jti blocklist)
- `POST /api/auth/forgot-password` + `/reset-password`
- `POST /api/auth/change-password`
- `POST /api/properties/:id/inquiry` (currently no way to increment `inquiries`)
- `POST /api/properties/:id/favorite` (currently localStorage-only)
- `GET /api/properties/my`
- `GET /api/agents/top`, `GET /api/agents/:id/listings`, `POST /api/agents/:id/review`
- Entire `/api/verify/*` namespace (property title-deed verification)
- `GET /api/dashboard/stats`, `GET /api/dashboard/activity`, role-specific sub-paths
- `GET /api/messages/conversations`
- `GET /api/escrow/:id`
- Frontend uses `/api/rentals` but spec says `/api/rental` — normalize spec

Dead frontend service files still using `mockCall`:
- `vestra_properties/src/services/auth.ts` (loginUser, registerUser, updateProfile, changePassword)
- `vestra_properties/src/services/escrow.ts` (createEscrow, etc.)

Dead backend routes with no frontend caller:
- Most rentals (`/api/rentals/units`, `/api/rentals/tenants`, `/api/rentals/pay`)
- `/api/maintenance` GET/POST
- All admin routes (`/api/admin/*`)
- Blog (`/api/blog`, `/api/blog/:slug`)

## Market intel — key facts (from research agent, 2026)

- **Property24 KE** wins volume (~326k listings). **BuyRentKenya** wins trust. **Jumia House exited 2024** → mid-market vacuum.
- **Ardhisasa** = KE Ministry of Lands digital land portal. Mandatory since Mar 2025. **No public API** — must build guided wizard for consumers.
- **KRA MRI** = 7.5% monthly rental income tax, mandatory since Jan 2024. **eRITS** launched Apr 2025. Platform must generate landlord statements matching KRA schema.
- **ODPC** registration required for controllers processing sensitive data at scale. Breach notification 72h. DPO required for large-scale monitoring.
- **Safaricom Daraja 3.0** launched Nov 2025. STK Push + C2B + B2C + B2B. Cannot do C2B + B2C on same shortcode — need separate B2C shortcode for landlord payouts. Callbacks must be idempotent + signature-verified + return 200 always (Daraja retries).
- **EARB** (Estate Agents Board) has a **public Members Directory** at members.estateagentsboard.or.ke — only ~500 licensed agents vs 40-50k operators. Huge trust gap.
- **Smile Identity** for KYC (KE National ID + biometric). Africa-optimized > Jumio.
- **CBK** doesn't allow non-licensed entities to hold funds — Vestra escrow must use partner-bank trust account.

## Recommended tech swaps (next arch pass)

- Search: Meilisearch (self-hosted, single node, <200k listings)
- Storage: Cloudflare R2 (egress-free)
- Image transforms: Bunny.net Optimizer
- Map tiles: MapTiler vector
- Payments: partner bank trust account for escrow; separate C2B and B2C shortcodes
- Auth: Redis jti blocklist for revocation
- Observability: pino + OpenTelemetry + Sentry
- Jobs: BullMQ (if Redis) else pg-boss
- Realtime: SSE default, WebSocket for chat only
- Mobile: keep Capacitor (right call for content-heavy proptech)

## Next-session priority order

1. Apply the baseline migration to a live DB (`prisma migrate deploy`) so index changes land.
2. Wire `idempotency(prisma)` middleware onto `/api/rentals/pay`, `/api/subscriptions/subscribe`, `/api/chamas/:id/contribute`, `/api/escrow` — helper is ready in `src/lib/idempotency.ts`.
3. Add `writeAudit(prisma, req, {action, ...})` calls at every financial mutation (rent-pay, escrow create + status transitions, subscription subscribe + cancel, chama contribute, extension approve/decline, admin overrides).
4. Daraja STK Push wiring in `POST /api/rentals/pay` + subscription + chama + escrow. Add `POST /api/mpesa/callback/:secret` that verifies `verifyCallbackSecret`, persists receipt with a real `mpesaRef` (unique constraint now guards double-spend), notifies the party.
5. Frontend: app-root listener for `session:expired` to clear Zustand + redirect; migrate `services/auth.ts` off `mockCall`; add `AuthGuard.initialized`.
6. Vitest + supertest scaffold. Priority tests: register → login → refresh → rotate → replay-detection; rent-pay IDOR; escrow IDOR; verify decide propagation; role activate/switch.
7. Full monolith split (pure refactor once tests are green).
8. Meilisearch swap for property search + geo.
9. Structured pino logging.
10. EARB scraper cron.

## Files added this session

- `src/lib/qs.ts` `src/lib/audit.ts` `src/lib/tokens.ts` `src/lib/mpesa.ts` `src/lib/idempotency.ts`
- `prisma/migrations/00000000000000_baseline/migration.sql` (877 lines)
- Frontend: `.env.example` `.env.production`

## Files modified this session

- `prisma/schema.prisma` (indexes, enum tightening, 8 new models)
- `src/index.ts` (imports + register/login refresh flow + message conversationId + 20 new endpoints before 404 catch-all)
- `package.json` (@types/express ^4.17.21)
- `vestra_properties/capacitor.config.ts` (iOS lockdown)
- `vestra_properties/src/services/api.ts` (refresh flow + session:expired event)
- `vestra_properties/src/components/ai/AIAssistant.tsx` (HTML-escape user input in renderMarkdown)
