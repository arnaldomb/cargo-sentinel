---
phase: 02-auth-multi-tenant-hierarchy
plan: 01
subsystem: database
tags: [prisma, schema, auth, seed, multi-tenant]
dependency_graph:
  requires: [01-04]
  provides: [User table, Role enum, seed credentials]
  affects: [02-02-auth-session, 02-03-tenant-middleware]
tech_stack:
  added: [bcryptjs@3.x, tsx@4.x]
  patterns: [Prisma upsert for idempotent seeds, bcryptjs cost 12 for password hashing]
key_files:
  created:
    - packages/database/src/seed.ts
  modified:
    - packages/database/prisma/schema.prisma
    - packages/database/package.json
    - pnpm-lock.yaml
key_decisions:
  - "No RefreshToken table (D2 LOCKED) — JWT maxAge 7d / updateAge 5min configured in Plan 02"
  - "bcryptjs cost 12 for seed passwords — bcrypt cost 12 is the 2026 production standard"
  - "empresaId: null for SUPER_ADMIN — explicit null enforces the cross-tenant superuser pattern"
  - "prisma db push run inside Docker network (node:22-alpine container) due to Windows Docker Desktop network isolation"
metrics:
  duration: "~25 minutes"
  completed: "2026-06-21T00:13:57Z"
  tasks_completed: 3
  files_changed: 4
requirements_satisfied: [AUTH-03, TENANT-01, TENANT-02, TENANT-03, TENANT-04]
---

# Phase 02 Plan 01: User Schema + Seed Summary

**One-liner:** Prisma schema extended with enum Role (3 values) and model User (bcrypt password + optional empresaId), applied to Postgres via db push, seeded with SUPER_ADMIN + empresa demo (ADMIN_EMPRESA + OPERADOR).

## What Was Built

Added authentication foundation to the Prisma schema and populated the database with demo credentials:

1. **enum Role** — `SUPER_ADMIN`, `ADMIN_EMPRESA`, `OPERADOR` added after existing `EmpresaStatus` enum
2. **model User** — `id`, `email` (unique), `passwordHash`, `nome`, `role`, `empresaId?` (optional FK to Empresa), `createdAt`, `updatedAt`; indexes on `empresaId` and `email`
3. **Empresa.users relation** — `users User[]` added to the Empresa model (back-relation)
4. **prisma db push** — schema applied to `cargo_sentinel` Postgres database; table `User` and enum `Role` created
5. **prisma generate** — Prisma Client regenerated with `User` and `Role` TypeScript types (`SUPER_ADMIN` confirmed in `index.d.ts`)
6. **seed.ts** — idempotent upsert-based seed creating 4 users:
   - `superadmin@cargosentinel.com` / `SUPER_ADMIN` / `empresaId: null`
   - `admin@demo.com` / `ADMIN_EMPRESA` / linked to Construtora Demo
   - `operador@demo.com` / `OPERADOR` / linked to Construtora Demo
   - `Construtora Demo` empresa (cnpj: `00000000000191`)

## Commits

| Task | Commit | Description |
|------|--------|-------------|
| 1 | `19ad28f` | feat(02-01): adicionar enum Role e modelo User ao schema Prisma |
| 2 | `3eeebc7` | chore(02-01): prisma db push + generate — tabela User e enum Role aplicados ao Postgres |
| 3 | `2a7e771` | feat(02-01): seed Super Admin + empresa demo com admin e operador |

## Decisions Made

1. **No RefreshToken table** — Decision D2 LOCKED from RESEARCH. JWT maxAge 7d + updateAge 5min configured in Plan 02. Refresh table pattern rejected.
2. **bcryptjs cost 12** — Current 2026 production standard (OWASP recommends 10-12 for interactive logins). Cost 12 provides ~300ms hash time on modern hardware.
3. **empresaId: null for SUPER_ADMIN** — Explicit null (not undefined) in upsert `create` block to enforce cross-tenant superuser semantics. AUTH-02 requirement.
4. **Docker container for db push** — On Windows with Docker Desktop, the postgres container is not accessible at `localhost:5432` (Docker's network isolation). Used `node:22-alpine` container on `cargo-sentinel_sentinel` network to run `prisma db push` and `pnpm seed` against `postgres:5432` hostname.

## Deviations from Plan

### Infrastructure Deviation

**[Rule 3 - Blocking Issue] Docker network isolation on Windows requires container-based db push**

- **Found during:** Task 2
- **Issue:** `prisma db push` targeting `localhost:5432` failed with `P1001: Can't reach database server`. Docker Desktop on Windows does not expose container ports to the Windows host when the port is not explicitly mapped in `docker-compose.yml`. The postgres service has no `ports:` mapping in `docker-compose.yml`.
- **Fix:** Ran `prisma db push` and `pnpm seed` inside a `node:22-alpine` Docker container joined to the `cargo-sentinel_sentinel` network, connecting to `postgres:5432` (Docker DNS). This matches production behavior where services communicate via Docker network DNS, not localhost.
- **Impact:** None on code or schema. Same result. The plan's bash commands assumed direct localhost access — a reasonable assumption for Linux/Mac devs but not Windows Docker Desktop.
- **Files modified:** None (infrastructure-only workaround)

## Known Stubs

None — seed data is real (bcrypt-hashed passwords, proper role assignments). No placeholder text in any created files.

## Threat Surface Scan

This plan adds a `User` table with `passwordHash` column. Confirmed mitigations from threat model:

| Flag | Status | Notes |
|------|--------|-------|
| T-02-01: passwordHash disclosure | Mitigated | bcryptjs cost 12 applied in seed; no select-all routes exist yet (enforced in Plans 02/04) |
| T-02-02: role/empresaId tampering | Mitigated | role and empresaId set only server-side in seed; no client-writable route exists yet |
| T-02-03: seed credentials known | Accepted | Dev-only demo credentials; production provisioning deferred to Phase 7 |

No new threat surface beyond what was declared in the plan's threat model.

## Self-Check

### Files Created/Modified

- [x] `packages/database/prisma/schema.prisma` — contains enum Role, model User, Empresa.users
- [x] `packages/database/src/seed.ts` — 54 lines, creates 4 users via upsert
- [x] `packages/database/package.json` — seed script added, bcryptjs + tsx in dependencies
- [x] `pnpm-lock.yaml` — updated with new packages

### Commits Verified

- [x] `19ad28f` feat(02-01): adicionar enum Role e modelo User ao schema Prisma
- [x] `3eeebc7` chore(02-01): prisma db push + generate — tabela User e enum Role aplicados ao Postgres
- [x] `2a7e771` feat(02-01): seed Super Admin + empresa demo com admin e operador

## Self-Check: PASSED
