---
phase: 01-monorepo-lpr-ingestion-storage
plan: "01"
subsystem: monorepo-scaffold
tags: [turborepo, pnpm, typescript, monorepo, express, nextjs]
requires: []
provides: [monorepo-build-graph, workspace-protocol, shared-lpr-types, express-api-stub, nextjs-web-stub]
affects: [all-subsequent-plans]
tech-stack:
  added:
    - "pnpm 10.33.0 workspaces"
    - "Turborepo 2.x (turbo@2.9.18)"
    - "TypeScript 5.x (^5.4.0)"
    - "Express 4.21.x"
    - "Next.js 15.5.19"
    - "vitest 4.1.9"
    - "tsx 4.22.x"
  patterns:
    - "workspace:* protocol for internal package references"
    - "turbo.json tasks (v2 syntax) with ^build dependsOn"
    - "tsconfig.base.json extended by each workspace"
key-files:
  created:
    - package.json
    - pnpm-workspace.yaml
    - turbo.json
    - tsconfig.base.json
    - .npmrc
    - .gitignore
    - packages/shared/src/types/lpr.ts
    - packages/shared/src/index.ts
    - packages/shared/package.json
    - packages/shared/tsconfig.json
    - packages/database/src/index.ts
    - packages/database/package.json
    - packages/database/tsconfig.json
    - packages/database/vitest.config.ts
    - packages/ui/src/index.ts
    - packages/ui/package.json
    - packages/ui/tsconfig.json
    - apps/api/src/index.ts
    - apps/api/package.json
    - apps/api/tsconfig.json
    - apps/api/vitest.config.ts
    - apps/web/src/app/page.tsx
    - apps/web/src/app/layout.tsx
    - apps/web/next.config.ts
    - apps/web/package.json
    - apps/web/tsconfig.json
    - pnpm-lock.yaml
  modified:
    - apps/web/tsconfig.json (Next.js build added allowJs, noEmit, isolatedModules automatically)
decisions:
  - "Express app exported with explicit Express type annotation to avoid TS2742 non-portable inference error"
  - "apps/web tsconfig.json auto-modified by Next.js 15 build — allowJs/noEmit/isolatedModules added; accepted as correct"
metrics:
  duration: "~30 minutes"
  completed: "2026-06-20T18:35:59Z"
  tasks_completed: 3
  tasks_total: 3
  files_created: 27
  files_modified: 1
requirements_satisfied:
  - INFRA-01
---

# Phase 01 Plan 01: Turborepo Monorepo Scaffold Summary

Turborepo 2.x + pnpm monorepo with 5 workspaces wired via workspace:* protocol, IntelbrasPayload/LprJobData canonical types exported from @cargo-sentinel/shared, and a passing `pnpm build` across all packages.

## Tasks Completed

| Task | Name | Commit | Key Files |
|------|------|--------|-----------|
| 1 | Root workspace config + turbo.json + tooling | 12b333d | package.json, pnpm-workspace.yaml, turbo.json, tsconfig.base.json, .npmrc, .gitignore |
| 2 | packages/shared, packages/database stub, packages/ui stub | 7e03b70 | packages/shared/src/types/lpr.ts, packages/database/vitest.config.ts, packages/ui/src/index.ts |
| 3 | apps/api + apps/web, install, build verification | a1d47be | apps/api/src/index.ts, apps/web/src/app/*, pnpm-lock.yaml |

## Verification Results

- `pnpm install` exits 0 — 6 workspaces resolved (root + 5 packages)
- `pnpm build` exits 0 — 5 tasks successful (shared, database, ui, api, web)
- turbo.json uses `tasks` (v2 syntax), `^build` dependsOn confirmed
- `packages/shared/src/types/lpr.ts` exports IntelbrasPayload and LprJobData
- `apps/api` imports type from `@cargo-sentinel/shared` — workspace resolution confirmed
- `.gitignore` includes `node_modules`, `.turbo`, `.env`, `.env.local`
- `vitest` installed in `apps/api` and `packages/database`

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed TS2742 non-portable type inference in apps/api/src/index.ts**
- **Found during:** Task 3 — first `pnpm build` run
- **Issue:** TypeScript could not name the inferred type of `app` without referencing the deep `@types/express-serve-static-core` transitive path, which fails with `error TS2742`
- **Fix:** Changed `export const app = express()` to `export const app: Express = express()` with explicit `Express` type import from `express`
- **Files modified:** `apps/api/src/index.ts`
- **Commit:** a1d47be (included in Task 3 commit)

**2. [Expected behavior] Next.js 15 auto-modified apps/web/tsconfig.json**
- **Found during:** Task 3 — `next build` run
- **Issue:** Next.js 15 automatically added `allowJs: true`, `noEmit: true`, and `isolatedModules: true` to the tsconfig
- **Fix:** Accepted changes — these are correct Next.js 15 requirements and do not break anything
- **Files modified:** `apps/web/tsconfig.json`
- **Commit:** a1d47be

## Known Stubs

| Stub | File | Reason |
|------|------|--------|
| `DATABASE_PACKAGE` constant | packages/database/src/index.ts | Prisma client + createTenantClient implemented in Plan 02 |
| `UI_PACKAGE` constant | packages/ui/src/index.ts | React components added in Phase 3 |
| `<main>Cargo Sentinel</main>` | apps/web/src/app/page.tsx | Home page is a stub; real UI built in later phases |

These stubs are intentional — this plan's goal is to scaffold the build graph, not implement application features.

## Threat Flags

No new threat surface introduced beyond what the plan's threat model covers. `.env` and `.env.local` are gitignored as required by T-1-S2 mitigation.

## Self-Check: PASSED

- package.json: FOUND
- pnpm-workspace.yaml: FOUND
- turbo.json: FOUND
- tsconfig.base.json: FOUND
- packages/shared/src/types/lpr.ts: FOUND
- packages/database/vitest.config.ts: FOUND
- apps/api/src/index.ts: FOUND
- apps/web/src/app/page.tsx: FOUND
- pnpm-lock.yaml: FOUND
- Commit 12b333d: FOUND
- Commit 7e03b70: FOUND
- Commit a1d47be: FOUND
