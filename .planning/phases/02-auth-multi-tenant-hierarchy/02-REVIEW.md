---
phase: 02-auth-multi-tenant-hierarchy
reviewed: 2026-06-20T00:00:00Z
depth: standard
files_reviewed: 23
files_reviewed_list:
  - apps/api/package.json
  - apps/api/src/index.ts
  - apps/api/src/middleware/auth.ts
  - apps/api/src/middleware/pipeline.ts
  - apps/api/src/middleware/rbac.test.ts
  - apps/api/src/middleware/rbac.ts
  - apps/api/src/middleware/tenant.test.ts
  - apps/api/src/middleware/tenant.ts
  - apps/api/src/routes/cameras.test.ts
  - apps/api/src/routes/cameras.ts
  - apps/api/src/routes/obras.test.ts
  - apps/api/src/routes/obras.ts
  - apps/api/src/types/express.d.ts
  - apps/web/auth.config.ts
  - apps/web/auth.test.ts
  - apps/web/auth.ts
  - apps/web/middleware.ts
  - apps/web/src/app/(auth)/login/actions.ts
  - apps/web/src/app/(auth)/login/page.tsx
  - apps/web/src/app/api/auth/[...nextauth]/route.ts
  - apps/web/src/types/next-auth.d.ts
  - packages/database/prisma/schema.prisma
  - packages/database/src/seed.ts
findings:
  critical: 2
  warning: 4
  info: 3
  total: 9
status: issues_found
---

# Phase 02: Code Review Report

**Reviewed:** 2026-06-20
**Depth:** standard
**Files Reviewed:** 23
**Status:** issues_found

## Summary

This phase implements auth (Auth.js v5 JWT + bcrypt), multi-tenant scoping via a Prisma client extension, RBAC middleware, and CRUD routes for Obras and Cameras. The overall architecture is sound: tenant isolation is enforced at the application layer through `createTenantClient`, the JWT secret derivation mirrors Auth.js v5's own key-derivation logic, and the `protectedPipeline` pattern correctly orders auth before tenant scoping.

Two critical issues require attention before this code goes to production. The most important is that **all `async` route handlers in Express 4 swallow unhandled errors silently** — `throw err` inside an `async` callback does not propagate to Express's error handler in v4. The second critical issue is a **tenant-bypass attack surface**: a `SUPER_ADMIN` user can supply any `empresaId` in the request body when calling POST `/api/obras` or POST `/api/obras/:obraId/cameras`, because the guard only rejects a _missing_ `empresaId` rather than enforcing that SUPER_ADMIN routes always receive `empresaId` from a trusted out-of-band source.

Four warnings cover: missing global error handler, no rate-limiting on the auth endpoints, a timing-leak in `authorizeUser`, and an unchecked assertion in the `session` callback.

---

## Critical Issues

### CR-01: Unhandled async errors crash silently in Express 4 route handlers

**File:** `apps/api/src/routes/obras.ts:78`, `apps/api/src/routes/obras.ts:100`, `apps/api/src/routes/cameras.ts:22`, `apps/api/src/routes/cameras.ts:68`, `apps/api/src/routes/cameras.ts:100`, `apps/api/src/routes/cameras.ts:123`

**Issue:** All route handlers are declared as `async (req, res) => { … }` (not `async (req, res, next) => { … }`), and errors that are not matched by a known Prisma error code are re-thrown with `throw err`. In Express 4, uncaught promise rejections inside route callbacks are **not** forwarded to the error-handling middleware — the rejection is unhandled, the request hangs without a response, and the Node.js process may emit an `UnhandledPromiseRejection` warning (or crash in newer Node versions with `--unhandled-rejections=throw`). Express 5 would handle this automatically, but the project pins Express `^4.21.0`.

**Affected pattern (every route that rethrows):**
```typescript
// obras.ts:58-80 — PUT /:id
router.put('/:id', requireRole('SUPER_ADMIN', 'ADMIN_EMPRESA'), async (req, res) => {
  // ...
  try {
    // ...
  } catch (err: unknown) {
    const code = (err as { code?: string })?.code;
    if (code === 'P2025') return res.status(404).json({ error: 'Obra não encontrada' });
    throw err;  // <-- hangs the request in Express 4
  }
});
```

**Fix:** Either (a) add `next` to every handler signature and call `next(err)` instead of `throw err`, or (b) wrap every async handler with a utility that catches and forwards errors:

```typescript
// Option A — prefer this; add next to signature and forward
router.put('/:id', requireRole('SUPER_ADMIN', 'ADMIN_EMPRESA'), async (req, res, next) => {
  try {
    // ...
  } catch (err: unknown) {
    const code = (err as { code?: string })?.code;
    if (code === 'P2025') return res.status(404).json({ error: 'Obra não encontrada' });
    return next(err);  // forward unknown errors to Express error handler
  }
});

// Add a global error handler in index.ts
app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
  console.error(err);
  res.status(500).json({ error: 'Erro interno do servidor' });
});
```

---

### CR-02: SUPER_ADMIN empresaId injection via request body (tenant bypass)

**File:** `apps/api/src/routes/obras.ts:42-44`, `apps/api/src/routes/cameras.ts:48-51`

**Issue:** For `SUPER_ADMIN`, `req.user!.empresaId` is `null` (by design). When the route detects a null `empresaId`, it returns a 400 error that tells the caller "SUPER_ADMIN deve informar empresaId ao criar obra". However, the route never actually reads `empresaId` from `req.body` — so this 400 always fires for `SUPER_ADMIN` regardless. The comment suggests the intention is for `SUPER_ADMIN` to specify `empresaId` somehow, but the implementation does not read it from body, and the error message implies it should be in the body.

If, in a future iteration, a developer "fixes" this by reading `empresaId` from `req.body`, a `SUPER_ADMIN` would be able to create obras under any tenant by supplying an arbitrary `empresaId` — exactly the cross-tenant injection risk the comment on line 40 of `obras.ts` warns against.

Additionally, even today the UX is broken: `SUPER_ADMIN` calls `POST /api/obras` and always receives a 400, making the endpoint unusable for that role despite the RBAC check allowing it.

**Fix:** Make the intent explicit. If `SUPER_ADMIN` cross-tenant creation is not in scope for this phase, remove the role from `requireRole('SUPER_ADMIN', 'ADMIN_EMPRESA')` on the POST routes, or return a 403 with a clear message instead of a misleading 400:

```typescript
// obras.ts POST handler
const empresaId = req.user!.empresaId;
if (!empresaId) {
  // SUPER_ADMIN creating obras is not supported in this phase
  return res.status(403).json({ error: 'SUPER_ADMIN não pode criar obras diretamente — use o painel de administração' });
}
```

If cross-tenant creation IS intended in a future phase, the `empresaId` must come from a validated, explicit request field (never blindly from the body without ownership checks) and the route should be separately guarded.

---

## Warnings

### WR-01: No global error handler — unmatched errors produce no response

**File:** `apps/api/src/index.ts:1-30`

**Issue:** The Express application has no error-handling middleware (`(err, req, res, next) => { … }` with four parameters). Even after fixing CR-01 by calling `next(err)`, without a registered error handler Express will respond with its default HTML error page, leaking stack traces and internal details in development, and potentially sending nothing useful in production.

**Fix:**
```typescript
// At the bottom of index.ts, after all route registrations
import type { Request, Response, NextFunction } from 'express';

app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
  console.error('[unhandled error]', err);
  res.status(500).json({ error: 'Erro interno do servidor' });
});
```

---

### WR-02: No rate limiting on the login endpoint

**File:** `apps/web/src/app/(auth)/login/actions.ts:5-19`, `apps/web/src/app/api/auth/[...nextauth]/route.ts`

**Issue:** The `loginAction` server action (and the underlying `POST /api/auth/callback/credentials` handler) has no rate limiting. An attacker can brute-force credentials in parallel without any throttling. The `express-rate-limit` package is already a dependency of the Express API, but there is no equivalent protection on the Next.js auth endpoint.

**Fix:** Add rate limiting at the middleware level. In `apps/web/middleware.ts`, check the rate limit for `POST` requests to `/api/auth/callback/credentials`. A simpler approach is to use a Redis-backed counter in `loginAction`:

```typescript
// apps/web/src/app/(auth)/login/actions.ts
import { redis } from '@cargo-sentinel/shared/redis'; // or ioredis

export async function loginAction(_prev: unknown, formData: FormData) {
  const ip = headers().get('x-forwarded-for') ?? 'unknown';
  const key = `login:rate:${ip}`;
  const attempts = await redis.incr(key);
  if (attempts === 1) await redis.expire(key, 60); // 60s window
  if (attempts > 10) return { error: 'Muitas tentativas. Tente novamente em 1 minuto.' };
  // ... rest of loginAction
}
```

---

### WR-03: Timing side-channel — password check skipped when user not found

**File:** `apps/web/auth.ts:31-34`

**Issue:** When the user email does not exist in the database, `authorizeUser` returns `null` immediately (line 31) without calling `bcryptjs.compare`. When the email exists but the password is wrong, `bcryptjs.compare` runs a bcrypt verification (expensive CPU operation). This timing difference allows an attacker to enumerate valid email addresses by measuring response time.

```typescript
// Current — returns early for unknown email, leaking timing info
const user = await prisma.user.findUnique({ ... });
if (!user) return null;           // fast path — email not found
const valid = await bcryptjs.compare(password, user.passwordHash);  // slow path
```

**Fix:** Always run `bcryptjs.compare` against a dummy hash when no user is found:

```typescript
const DUMMY_HASH = '$2b$12$dummyhashfortimingnormalizationonly....';

const user = await prisma.user.findUnique({ where: { email }, include: { empresa: { select: { status: true } } } });
await bcryptjs.compare(password, user?.passwordHash ?? DUMMY_HASH);
if (!user) return null;
if (user.empresa?.status === 'SUSPENSO') return null;
// ... rest of checks
```

---

### WR-04: Unchecked `token.sub` cast in session callback

**File:** `apps/web/auth.config.ts:21`

**Issue:** `session.user.id = token.sub as string` casts `token.sub` to `string` unconditionally. According to Auth.js v5 types, `token.sub` is `string | undefined`. If a token somehow lacks `sub` (e.g., a token manually created in tests or through edge cases), `session.user.id` will be set to `undefined` while TypeScript believes it is a `string`, causing downstream failures whenever callers read `session.user.id` as a non-nullable string.

**Fix:**
```typescript
session({ session, token }) {
  if (!token.sub) throw new Error('JWT token missing sub claim');
  session.user.id = token.sub;
  session.user.role = token.role;
  session.user.empresaId = token.empresaId;
  return session;
},
```

---

## Info

### IN-01: Seed file contains hardcoded plaintext passwords in version control

**File:** `packages/database/src/seed.ts:5-6`

**Issue:** Default passwords (`SuperAdmin123!`, `Admin123!`, `Operador123!`) are hardcoded in a committed seed file. While seed files are development artifacts, these passwords are a common source of credential reuse in staging/production environments and tend to persist longer than intended.

**Fix:** Read passwords from environment variables with documented defaults:

```typescript
const superAdminPwd = process.env.SEED_SUPERADMIN_PASSWORD ?? 'SuperAdmin123!';
const adminPwd      = process.env.SEED_ADMIN_PASSWORD      ?? 'Admin123!';
const operadorPwd   = process.env.SEED_OPERADOR_PASSWORD   ?? 'Operador123!';
```

Add these variables to `.env.example` with clear "change before deploying to staging" comments.

---

### IN-02: Missing test coverage for GET /api/obras/:obraId/cameras with non-existent obra (P2025 path)

**File:** `apps/api/src/routes/cameras.test.ts`

**Issue:** The GET handler in `cameras.ts` wraps `obra.findFirstOrThrow` in a try/catch and returns 404 on P2025 (lines 19-22). No test covers this case (tests 7-11 only cover success, 403, 201, 409, and 204). The cameras `findMany` also has no error-handling wrapper — an unexpected Prisma error there hits the unhandled-async path described in CR-01.

**Fix:** Add a test case mirroring obras.test.ts Test 5 for the cameras GET route, using `findFirstOrThrow.mockRejectedValue(p2025)`.

---

### IN-03: Magic number for cookie name salt selection

**File:** `apps/api/src/middleware/auth.ts:7-9`

**Issue:** The production cookie name `__Secure-authjs.session-token` is a magic string embedded in the auth middleware. Auth.js v5 may change this cookie name in a minor update (it changed between v4 and v5). A mismatch between what Auth.js sets and what the Express middleware reads will silently break all browser-based auth without an error message pointing to the cookie name.

**Fix:** Extract to a named constant and add a comment linking to the Auth.js v5 changelog, so future updates can be audited:

```typescript
// Auth.js v5 cookie names (see https://authjs.dev/reference/nextjs#cookies)
// Review this constant when upgrading next-auth major version.
const AUTHJS_COOKIE_NAME =
  process.env.NODE_ENV === 'production'
    ? '__Secure-authjs.session-token'
    : 'authjs.session-token';
```

This is already partially addressed by the comment on line 5, but promoting the name to a named constant makes it easier to grep and audit.

---

_Reviewed: 2026-06-20_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
