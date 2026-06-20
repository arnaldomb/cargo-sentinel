---
phase: 01-monorepo-lpr-ingestion-storage
plan: "02"
subsystem: database
tags: [prisma, postgresql, multi-tenancy, tenant-client, schema, tdd]
requires: ["01-01"]
provides: [prisma-schema, tenant-client, database-types]
affects: [all-subsequent-plans, lpr-worker-plan-04, phase-2-features]
tech-stack:
  added:
    - "@prisma/client ^7.8.0"
    - "prisma ^7.8.0 (devDep)"
    - "@types/node ^20.19.43 (devDep)"
  patterns:
    - "Prisma v7 requires prisma.config.ts for datasource URL (breaking from v6)"
    - "createTenantClient via prisma.$extends query.$allModels.$allOperations"
    - "PrismaClient singleton via globalThis for HMR safety"
    - "TDD: failing test committed first, then implementation"
key-files:
  created:
    - packages/database/prisma/schema.prisma
    - packages/database/prisma.config.ts
    - packages/database/src/tenant.ts
    - packages/database/src/tenant.test.ts
  modified:
    - packages/database/src/index.ts
    - packages/database/package.json
    - packages/database/tsconfig.json
    - packages/database/vitest.config.ts
    - package.json (pnpm.onlyBuiltDependencies for Prisma engine scripts)
    - pnpm-lock.yaml
decisions:
  - "Prisma v7 datasource URL moved to prisma.config.ts — schema.prisma datasource block has no url property"
  - "pnpm.onlyBuiltDependencies added to root package.json to allow @prisma/engines, prisma, esbuild postinstall scripts"
  - "tsconfig excludes *.test.ts — vitest handles test compilation; tsc build only compiles src"
  - "createTenantClient return type cast as unknown in test — Prisma v7 $extends return type does not expose mock properties"
metrics:
  duration: "~45 minutes"
  completed: "2026-06-20T18:45:48Z"
  tasks_completed: 2
  tasks_total: 2
  files_created: 4
  files_modified: 6
requirements_satisfied:
  - INFRA-02
---

# Phase 01 Plan 02: Prisma Schema + Tenant Client Summary

Prisma v7 schema with Empresa/Obra/Camera/Evento models (denormalized empresaId, idempotencyKey @unique), createTenantClient via $extends injecting empresaId into every query, pushed to postgres:16-alpine and proven callable via 2 passing vitest unit tests.

## Tasks Completed

| Task | Name | Commit | Key Files |
|------|------|--------|-----------|
| 1 | Prisma schema, deps, tenant client + unit tests (TDD) | 76f8407 | packages/database/prisma/schema.prisma, packages/database/prisma.config.ts, packages/database/src/tenant.ts, packages/database/src/tenant.test.ts, packages/database/src/index.ts |
| 2 | Push Prisma schema to Postgres | 6a2f7cc | verified via docker exec \dt |
| - | Auto-fix: TS build errors + vitest dist pickup | 01d6dd8 | packages/database/tsconfig.json, vitest.config.ts, tenant.test.ts, package.json |

## Verification Results

- `prisma generate` exits 0 — client types produced (v7.8.0)
- `pnpm --filter @cargo-sentinel/database test` passes: 1 file, 2 tests
  - Test 1: `typeof createTenantClient === 'function'` PASS
  - Test 2: `mockPrisma.$extends` called once, returns `{ __tenant: true }` PASS
- `prisma db push --accept-data-loss` exits 0 — "Your database is now in sync"
- `\dt` confirms: Camera, Empresa, Evento, Obra tables created in cargo_sentinel
- `pnpm build`: all 5 packages pass (shared, ui, database, api, web)

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Prisma v7 breaking change: datasource URL must be in prisma.config.ts**
- **Found during:** Task 1 — first `prisma generate` run
- **Issue:** Prisma v7 removed `url = env("DATABASE_URL")` from `schema.prisma`. Error: "The datasource property `url` is no longer supported in schema files"
- **Fix:** Created `packages/database/prisma.config.ts` with `defineConfig({ datasource: { url: process.env.DATABASE_URL } })`. Removed `url` from datasource block in schema.prisma.
- **Files modified:** `packages/database/prisma.config.ts` (new), `packages/database/prisma/schema.prisma`
- **Commit:** 76f8407

**2. [Rule 3 - Blocking] pnpm blocked Prisma engine postinstall scripts**
- **Found during:** Task 1 — `prisma generate` failed because engine binaries weren't downloaded
- **Issue:** pnpm v10 blocks all build scripts by default. `@prisma/engines` postinstall downloads query engine binary.
- **Fix:** Added `"pnpm": { "onlyBuiltDependencies": ["@prisma/engines", "prisma", "esbuild"] }` to root `package.json`. Ran `pnpm install` to trigger approved scripts.
- **Files modified:** `package.json` (root)
- **Commit:** 76f8407

**3. [Rule 1 - Bug] TS build errors: process not found + __tenant type mismatch**
- **Found during:** Post-Task 1 `pnpm build` run
- **Issue 1:** `TS2580: Cannot find name 'process'` in index.ts — `@types/node` missing
- **Issue 2:** `TS2339: Property '__tenant' does not exist` in tenant.test.ts — Prisma v7 `$extends` return type is fully typed; mock's `__tenant` property not visible
- **Fix 1:** `pnpm --filter @cargo-sentinel/database add -D @types/node`
- **Fix 2:** Cast `result as unknown as { __tenant: boolean }` in test
- **Fix 3:** Excluded `*.test.ts` from `tsconfig.json` build (vitest handles test compilation)
- **Fix 4:** Excluded `dist/**` from `vitest.config.ts` (tsc was emitting test JS to dist, vitest picked it up twice)
- **Files modified:** `packages/database/package.json`, `packages/database/src/tenant.test.ts`, `packages/database/tsconfig.json`, `packages/database/vitest.config.ts`
- **Commit:** 01d6dd8

**4. [Rule 1 - Bug] Prisma v7 removed --skip-generate flag from db push**
- **Found during:** Task 2 — first `prisma db push` attempt
- **Issue:** `--skip-generate` flag no longer exists in Prisma v7. Error: "unknown or unexpected option"
- **Fix:** Ran `prisma db push --accept-data-loss` without `--skip-generate`
- **Commit:** 6a2f7cc (verified, no file change)

## Known Stubs

None. All models and the tenant client are fully implemented. The `DATABASE_URL` in `.env` uses dev credentials matching the disposable push container; Plan 03 brings up the persistent postgres service using the same credentials.

## Threat Flags

No new threat surface beyond the plan's threat model. `.env` is gitignored (T-1-D3 mitigated). `empresaId` is injected server-side only, never accepted from external input in this plan (T-1-D2 mitigated). `createTenantClient` $extends asserted by unit test (T-1-D1 mitigated at unit level; integration enforcement deferred to Phase 2).

## Self-Check: PASSED

- packages/database/prisma/schema.prisma: FOUND (model Evento with idempotencyKey @unique, empresaId String)
- packages/database/prisma.config.ts: FOUND (defineConfig with datasource.url)
- packages/database/src/tenant.ts: FOUND ($extends, $allOperations)
- packages/database/src/tenant.test.ts: FOUND (2 tests)
- packages/database/src/index.ts: FOUND (export { createTenantClient }, export const prisma)
- packages/database/package.json: FOUND (@prisma/client in dependencies, prisma in devDependencies)
- Commit 76f8407: FOUND
- Commit 6a2f7cc: FOUND
- Commit 01d6dd8: FOUND
