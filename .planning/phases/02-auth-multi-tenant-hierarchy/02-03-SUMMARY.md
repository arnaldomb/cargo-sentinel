---
phase: 02-auth-multi-tenant-hierarchy
plan: "03"
subsystem: api-auth-middleware
tags: [auth, middleware, rbac, multi-tenant, jwe, express]
dependency_graph:
  requires: [02-01, 02-02]
  provides: [authMiddleware, tenantMiddleware, requireRole, protectedPipeline]
  affects: [apps/api/src/index.ts, all future protected routes in Plan 04+]
tech_stack:
  added:
    - jose@6.2.3 (JWE decrypt — D5 locked)
    - "@panva/hkdf@1.2.1" (HKDF key derivation for Auth.js v5 token)
    - cookie-parser (read session cookie in Express)
    - helmet (secure HTTP headers)
    - express-rate-limit (installed, ready for login endpoint)
  patterns:
    - JWE decrypt via jose.jwtDecrypt + @panva/hkdf (never jsonwebtoken.verify)
    - SUPER_ADMIN bypass: prisma raw instead of createTenantClient(prisma, null)
    - protectedPipeline = [authMiddleware, tenantMiddleware] export for route composition
key_files:
  created:
    - apps/api/src/middleware/auth.ts
    - apps/api/src/middleware/tenant.ts
    - apps/api/src/middleware/rbac.ts
    - apps/api/src/middleware/tenant.test.ts
    - apps/api/src/middleware/rbac.test.ts
    - apps/api/src/types/express.d.ts
  modified:
    - apps/api/src/index.ts
    - apps/api/package.json
decisions:
  - "D5-LOCKED: jose.jwtDecrypt + @panva/hkdf for Express token verification (no jsonwebtoken)"
  - "SUPER_ADMIN receives prisma raw — tenantMiddleware never calls createTenantClient(prisma, null)"
  - "protectedPipeline exported from index.ts — Plan 04 CRUD routes consume it"
  - "cookie-parser + helmet mounted globally; /api/lpr and /api/health remain public"
metrics:
  duration_minutes: 25
  tasks_completed: 3
  tasks_total: 3
  tests_added: 9
  files_created: 6
  files_modified: 2
  completed_date: "2026-06-21"
requirements_satisfied: [AUTH-05, AUTH-03, TENANT-06]
---

# Phase 02 Plan 03: Express Auth/Tenant/RBAC Middleware Summary

**One-liner:** JWE decrypt middleware (jose + hkdf) + SUPER_ADMIN-aware tenant injection + requireRole RBAC guard with 9 unit tests covering Pitfall 4 bypass.

## What Was Built

Three Express middleware files that form the security layer for all future protected routes:

1. **`authMiddleware`** (`apps/api/src/middleware/auth.ts`) — Decrypts Auth.js v5 JWE tokens using `jose.jwtDecrypt` + `@panva/hkdf`. Reads session cookie (`authjs.session-token` in dev, `__Secure-authjs.session-token` in prod). Falls back to `Authorization: Bearer` header for API clients. Populates `req.user = { id, role, empresaId }`. Returns 401 without token or on invalid/expired token.

2. **`tenantMiddleware`** (`apps/api/src/middleware/tenant.ts`) — Injects `req.tenantClient`. For normal users: calls `createTenantClient(prisma, empresaId)` which scopes all queries to the tenant. For SUPER_ADMIN (empresaId null): assigns `prisma` raw directly — critically, never calls `createTenantClient(prisma, null)` which would filter for `empresaId IS NULL` and return zero rows (Pitfall 4). Normal users with null empresaId get 403.

3. **`requireRole`** (`apps/api/src/middleware/rbac.ts`) — Factory returning an Express middleware that checks `req.user.role` against allowed roles. Returns 403 for unauthorized or missing user.

**`protectedPipeline`** exported from `index.ts` as `[authMiddleware, tenantMiddleware]` in the correct order (Pitfall 5: auth must populate req.user before tenant reads it).

## Commits

| Task | Commit | Description |
|------|--------|-------------|
| Task 1 | 4ba2dbd | Install deps + express.d.ts type augmentation + authMiddleware |
| Task 2 | deea6f1 | tenantMiddleware + requireRole + 9 unit tests (TDD RED→GREEN) |
| Task 3 | 1bf3462 | Mount helmet + cookie-parser + export protectedPipeline in index.ts |

## Test Results

```
Test Files  3 passed (3)
     Tests  14 passed (14)
```

- `src/middleware/tenant.test.ts` — 4 tests (SUPER_ADMIN bypass, createTenantClient call, 401 no user, 403 null empresaId)
- `src/middleware/rbac.test.ts` — 5 tests (role rejection, role acceptance, missing user, SUPER_ADMIN allowed, SUPER_ADMIN rejected)
- `src/routes/lpr.test.ts` — 5 tests (Phase 1 regression — still green)

## Threat Mitigations Applied

| Threat ID | Mitigation |
|-----------|------------|
| T-02-10 | jwtDecrypt validates JWE integrity with AUTH_SECRET; invalid token → 401 |
| T-02-11 | Exclusive use of jose (no jsonwebtoken); prevents alg=none/confusion attacks |
| T-02-12 | empresaId read ONLY from req.user (token); createTenantClient injects in 100% of queries |
| T-02-13 | SUPER_ADMIN branch activates only when role from token === 'SUPER_ADMIN'; normal user with null empresaId → 403 |
| T-02-14 | jwtDecrypt verifies exp claim automatically; expired token → 401 |
| T-02-15 | helmet() applied globally before all routes |

## Deviations from Plan

None — plan executed exactly as written.

TDD note: The tenant.test.ts required `vi.hoisted()` to correctly share mock values between the `vi.mock()` factory call and test assertions. This is standard Vitest pattern for module-level mocks with shared references — not a deviation from the plan, just a Vitest implementation detail.

## Known Stubs

None. All middleware implementations are complete and functional.

## Self-Check

Files created:
- apps/api/src/middleware/auth.ts ✓
- apps/api/src/middleware/tenant.ts ✓
- apps/api/src/middleware/rbac.ts ✓
- apps/api/src/middleware/tenant.test.ts ✓
- apps/api/src/middleware/rbac.test.ts ✓
- apps/api/src/types/express.d.ts ✓

Commits: 4ba2dbd, deea6f1, 1bf3462 — all on master branch.
