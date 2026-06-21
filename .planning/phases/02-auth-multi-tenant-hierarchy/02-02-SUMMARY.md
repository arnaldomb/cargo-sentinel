---
phase: 02-auth-multi-tenant-hierarchy
plan: "02"
subsystem: auth
tags: [auth, next-auth, jwt, credentials, bcryptjs, middleware, login]
dependency_graph:
  requires: [02-01]
  provides: [AUTH_SECRET, JWT-session, login-page, middleware-protection]
  affects: [02-03-express-auth-middleware]
tech_stack:
  added:
    - next-auth@5.0.0-beta.31 (Auth.js v5)
    - bcryptjs@3.0.3
    - zod@4.4.3
    - vitest@4.1.9
  patterns:
    - CredentialsProvider with bcryptjs.compare
    - JWT session strategy (no database sessions)
    - Module augmentation for role/empresaId in Session and JWT
    - Edge-safe middleware using auth.config (no bcryptjs in Edge)
    - authorizeUser() exported for testability
key_files:
  created:
    - apps/web/auth.config.ts
    - apps/web/auth.ts
    - apps/web/auth.test.ts
    - apps/web/middleware.ts
    - apps/web/vitest.config.ts
    - apps/web/.env.local.example
    - apps/web/src/types/next-auth.d.ts
    - apps/web/src/app/api/auth/[...nextauth]/route.ts
    - apps/web/src/app/(auth)/login/page.tsx
    - apps/web/src/app/(auth)/login/actions.ts
  modified:
    - apps/web/package.json
    - pnpm-lock.yaml
decisions:
  - "D2-confirmed: JWT strategy maxAge 7d / updateAge 5min — no RefreshToken table (AUTH-04)"
  - "authorizeUser() extracted from Credentials authorize() for testability without mocking NextAuth internals"
  - "middleware.ts imports authConfig (not auth.ts) to keep bcryptjs out of Edge runtime (Pitfall 2)"
  - "Dynamic import of signIn/signOut in server actions avoids circular import issues"
metrics:
  duration: ~25min
  completed_date: "2026-06-20"
  tasks_completed: 3
  files_created: 10
  files_modified: 2
  tests_added: 6
---

# Phase 02 Plan 02: Auth.js v5 Setup Summary

**One-liner:** Auth.js v5 with CredentialsProvider + bcryptjs, JWT carrying sub/role/empresaId (7d/5min), login/logout pages, edge-safe middleware, 6 vitest tests green.

## What Was Built

Auth.js v5 fully configured for the Next.js app, providing the authentication foundation that all subsequent phases depend on.

**Core auth flow:**
1. User POSTs email + password to `/login` via server action
2. `authorizeUser()` validates against DB via `prisma.user.findUnique` + `bcryptjs.compare`
3. If `empresa.status === 'SUSPENSO'`, login is rejected (TENANT-01)
4. On success, Auth.js emits a JWE session token with `sub`, `role`, `empresaId` via `callbacks.jwt`
5. `callbacks.session` exposes those claims to server components
6. Middleware protects all routes except `/login` and `/api/auth/**`
7. `logoutAction` calls `signOut({ redirectTo: '/login' })` clearing the session cookie

**File structure:**

```
apps/web/
├── auth.config.ts          # Edge-safe config (no Node-only imports)
├── auth.ts                 # Full config with CredentialsProvider + bcryptjs
├── auth.test.ts            # 6 vitest tests for authorizeUser + callbacks
├── middleware.ts           # Route protection (uses auth.config, not auth.ts)
├── vitest.config.ts        # Test runner config
├── .env.local.example      # AUTH_SECRET + DATABASE_URL documented
└── src/
    ├── types/
    │   └── next-auth.d.ts  # Module augmentation: role/empresaId in Session+JWT
    └── app/
        ├── api/auth/[...nextauth]/route.ts  # GET/POST handlers
        └── (auth)/login/
            ├── page.tsx    # Client component with useActionState
            └── actions.ts  # loginAction + logoutAction (server actions)
```

## Task Commits

| Task | Description | Commit |
|------|-------------|--------|
| 1 | Install deps + module augmentation + route handler | 8ab904e |
| 2 | auth.config.ts + auth.ts (TDD - 6 tests green) | 355285d |
| 3 | middleware.ts + login page + logout | 4319435 |

## Requirements Fulfilled

| Requirement | Status |
|-------------|--------|
| AUTH-01: Login with email/password | Done — CredentialsProvider + loginAction |
| AUTH-02: JWT carries sub, role, empresaId | Done — callbacks.jwt assigns all three |
| AUTH-04: Session TTL 7d / updateAge 5min | Done — D2 confirmed in auth.config.ts |
| AUTH-06: Logout clears session cookie | Done — signOut() in logoutAction |
| TENANT-01: SUSPENSO empresa rejected | Done — authorize() checks empresa.status |

## Deviations from Plan

### Auto-fixed Issues

None — plan executed exactly as written.

### Notable Implementation Choices

**1. authorizeUser() extraction for testability**
- The plan suggested either extracting to a helper or testing via NextAuth mock
- Chose to export `authorizeUser(credentials)` from `auth.ts` and call it inside `Credentials.authorize()`
- This avoids the complexity of mocking NextAuth internals while enabling direct unit testing

**2. Dynamic import in server actions**
- Used `await import('../../../../auth')` inside `loginAction` and `logoutAction`
- Avoids potential circular import issues between server actions and auth.ts

**3. Vitest installed (Rule 3 - Blocking)**
- Vitest was not present in the web app; installed it to fulfill the TDD requirement
- Added `vitest.config.ts` with `vite-tsconfig-paths` for path resolution

## Known Stubs

None. All auth flows are wired to real database queries via `@cargo-sentinel/database`.

## Threat Flags

No new security surface beyond what was declared in the plan's threat model.

Threats from plan addressed:
- T-02-04 (credential stuffing): bcryptjs.compare is timing-safe by design; rate limiting deferred to Plan 03
- T-02-05 (role elevation): role/empresaId sourced only from DB in authorize(), never from client input
- T-02-06 (suspended empresa): `empresa.status === 'SUSPENSO'` check in authorizeUser()
- T-02-07 (passwordHash disclosure): `passwordHash` not returned in authorize() result object
- T-02-08 (JWE tampering): Auth.js encrypts token with AUTH_SECRET (AES-256-CBC-HS512)
- T-02-09 (redirect loop): middleware matcher excludes `/login` and `/api/auth`
- T-02-20 (token replay): accepted risk per D2; AUTH_SECRET rotation as emergency mitigation

## Self-Check: PASSED
