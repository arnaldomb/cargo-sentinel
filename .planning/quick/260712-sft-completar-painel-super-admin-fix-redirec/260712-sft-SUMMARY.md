---
phase: quick-260712-sft
plan: 01
subsystem: auth
tags: [nextauth, prisma, express, superadmin, rbac]

requires:
  - phase: quick-260712-o0s
    provides: WhatsAppProvisionClient superadmin component, ConfiguracaoWhatsApp model, admin-whatsapp-proxy pattern
provides:
  - SUPER_ADMIN redirect fix (never lands on tenant dashboard)
  - User.ativo field + login gate
  - Empresa detail backend routes (GET/PATCH) + usuarios CRUD backend routes
  - BFF proxies for empresa detail and usuarios
  - Tabbed empresa detail shell (Geral/Usuários/WhatsApp)
  - Empresas list client-side search by nome/CNPJ
affects: [superadmin panel, user management, empresa admin UI]

tech-stack:
  added: []
  patterns:
    - "prisma migrate diff --from-config-datasource --to-schema as fallback when migrate dev demands destructive reset on drifted dev DB"

key-files:
  created:
    - packages/database/prisma/migrations/20260712210000_add_user_ativo/migration.sql
    - apps/web/src/app/api/admin-empresa-proxy/[id]/route.ts
    - apps/web/src/app/api/admin-usuarios-proxy/[id]/route.ts
    - apps/web/src/app/api/admin-usuarios-proxy/[id]/[usuarioId]/route.ts
    - apps/web/src/app/api/admin-usuarios-proxy/[id]/[usuarioId]/resetar-senha/route.ts
    - apps/web/src/app/(superadmin)/admin/empresas/[id]/page.tsx
    - apps/web/src/app/(superadmin)/admin/empresas/[id]/empresa-detail-shell.tsx
    - apps/web/src/app/(superadmin)/admin/empresas/[id]/usuarios-tab.tsx
    - apps/web/src/app/(superadmin)/admin/empresas-table.tsx
  modified:
    - apps/web/src/app/page.tsx
    - packages/database/prisma/schema.prisma
    - apps/web/auth.ts
    - apps/api/src/routes/admin.ts
    - apps/web/src/app/(superadmin)/admin/page.tsx

key-decisions:
  - "Migration applied via prisma migrate diff --from-config-datasource --script fallback (dev DB was db-push-provisioned with no _prisma_migrations table); also had to catch up the still-unapplied 20260712202653_remove_evolution_zapi_provisioning migration from the previous quick task before applying add_user_ativo"
  - "PUT /empresas/:id/usuarios/:usuarioId returns 403 if target user has role SUPER_ADMIN, blocking any edit (including ativo toggle) — enforced both in the UI (no action buttons rendered) and the backend"
  - "No billing/plan/subscription fields added to Empresa (explicit out-of-scope confirmed in plan)"

patterns-established:
  - "BFF proxy pattern: forward Cookie header via cookies().toString(), cache:'no-store' on GET, params as Promise (Next 15)"

requirements-completed: [SADMIN-REDIRECT, SADMIN-EMPRESA-DETAIL, SADMIN-USUARIOS-CRUD, SADMIN-SHELL-TABS, SADMIN-LIST-SEARCH]

duration: ~50min
completed: 2026-07-12
---

# Quick Task 260712-sft: Completar painel Super Admin + fix redirect Summary

**SUPER_ADMIN redirect bug fixed, empresa detail shell with Geral/Usuários/WhatsApp tabs, full usuarios CRUD (create/edit role/toggle ativo/reset password) scoped to ADMIN_EMPRESA|OPERADOR, and client-side search by nome/CNPJ on the empresas list.**

## Performance

- **Duration:** ~50 min
- **Tasks:** 6/6 completed
- **Files modified/created:** 14

## Accomplishments

- `apps/web/src/app/page.tsx` now redirects `SUPER_ADMIN` to `/admin` immediately after the login-check, before rendering the tenant `DashboardClient` — the bug that let super admins land on tenant UI is fixed.
- `User.ativo Boolean @default(true)` added to the Prisma schema; `authorizeUser` in `apps/web/auth.ts` rejects login when `user.ativo === false`, after the existing empresa-SUSPENSO check.
- Backend (`apps/api/src/routes/admin.ts`): `GET/PATCH /empresas/:id` (detail with `_count`, edit nome/cnpj with P2002/P2025 handling) and full usuarios CRUD under `/empresas/:id/usuarios` — list, create (role locked to `ADMIN_EMPRESA`/`OPERADOR`, rejects `SUPER_ADMIN`), edit nome/role/ativo (403 if target is `SUPER_ADMIN`), reset password.
- Four BFF proxies under `apps/web/src/app/api/admin-empresa-proxy` and `admin-usuarios-proxy`, following the existing `admin-whatsapp-proxy` cookie-forwarding pattern exactly.
- `EmpresaDetailShell` client component renders tabs Geral (data + counters + `SuspendButton` reuse), Usuários (new `UsuariosTab`), WhatsApp (reuses existing `WhatsAppProvisionClient` — no duplication).
- `UsuariosTab`: table with role select (SUPER_ADMIN read-only, no action buttons rendered for it), ativo/inativo badge + toggle button, reset-password modal, "novo usuário" modal (role default OPERADOR, options ADMIN_EMPRESA|OPERADOR only).
- `empresas-table.tsx` extracted from `admin/page.tsx`, adds a client-side search input filtering by nome (case-insensitive) or CNPJ (digit-normalized). WhatsApp link now points to `/admin/empresas/[id]?tab=whatsapp` (the shell) instead of the old standalone `/whatsapp` route; empresa nome links to the detail page.

## Task Commits

1. **Task 1: Fix redirect SUPER_ADMIN + campo User.ativo + bloqueio de login** - `01057d5` (feat)
2. **Task 2: Rotas backend de detalhe da empresa e CRUD de usuários** - `433b84e` (feat)
3. **Task 3: Proxies BFF para detalhe da empresa e usuários** - `c4b146d` (feat)
4. **Task 4: Shell de abas em /admin/empresas/[id] (Geral + WhatsApp)** - `d19ec49` (feat)
5. **Task 5: Aba Usuários — tabela, criar, resetar senha, toggle ativo** - `782aabd` (feat)
6. **Task 6: Busca client-side na lista + ajuste do link WhatsApp** - `d467812` (feat)

**Plan metadata:** (pending — orchestrator commits docs separately)

## Files Created/Modified

- `packages/database/prisma/migrations/20260712210000_add_user_ativo/migration.sql` — adds `User.ativo` column (generated via `prisma migrate diff`, applied directly to the dev DB — see Deviations)
- `packages/database/prisma/schema.prisma` — `User.ativo Boolean @default(true)`
- `apps/web/auth.ts` — `authorizeUser` rejects login when `!user.ativo`
- `apps/web/src/app/page.tsx` — redirects `SUPER_ADMIN` to `/admin`
- `apps/api/src/routes/admin.ts` — appended `GET/PATCH /empresas/:id` and `/empresas/:id/usuarios` CRUD routes
- `apps/web/src/app/api/admin-empresa-proxy/[id]/route.ts` — GET/PATCH proxy
- `apps/web/src/app/api/admin-usuarios-proxy/[id]/route.ts` — GET/POST proxy
- `apps/web/src/app/api/admin-usuarios-proxy/[id]/[usuarioId]/route.ts` — PUT proxy
- `apps/web/src/app/api/admin-usuarios-proxy/[id]/[usuarioId]/resetar-senha/route.ts` — POST proxy
- `apps/web/src/app/(superadmin)/admin/empresas/[id]/page.tsx` — server component, fetches empresa detail, resolves `?tab=` param
- `apps/web/src/app/(superadmin)/admin/empresas/[id]/empresa-detail-shell.tsx` — tabbed shell (Geral/Usuários/WhatsApp)
- `apps/web/src/app/(superadmin)/admin/empresas/[id]/usuarios-tab.tsx` — usuarios CRUD UI
- `apps/web/src/app/(superadmin)/admin/empresas-table.tsx` — extracted table with search
- `apps/web/src/app/(superadmin)/admin/page.tsx` — simplified to render `EmpresasTable`

## Decisions Made

- Migration generated via `prisma migrate diff --from-config-datasource --to-schema` (not `migrate dev`) since the dev DB has no `_prisma_migrations` table (originally provisioned via `db push`). Same fallback documented in the previous quick task (260712-o0s).
- Discovered during Task 1 that the dev DB was also missing the `20260712202653_remove_evolution_zapi_provisioning` migration (never applied, only committed to git) — applied that catch-up SQL directly to the container before applying the new `add_user_ativo` migration, so the DB reflects the currently committed schema in full.
- `PUT /empresas/:id/usuarios/:usuarioId` returns `403` outright if the target user's role is `SUPER_ADMIN` (not just role-change validation) — the plan's stated "never permitir editar/rebaixar" was interpreted as blocking the entire edit, including the `ativo` toggle, which is the safer reading and matches the UI (no action buttons rendered for SUPER_ADMIN rows).
- No billing/plan/subscription fields added to Empresa — out of scope per plan's pre-confirmed decision.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Dev DB missing previous unapplied migration + wrong DATABASE_URL in local .env files**
- **Found during:** Task 1 (migration for `User.ativo`)
- **Issue:** `prisma migrate dev` failed with `P1001` (couldn't reach `localhost:5432`) because `packages/database/.env`, `apps/api/.env`, and `apps/web/.env.local` all point to `localhost:5432` with password `sentinel`, but the actual dev Postgres container (`cargo-sentinel-postgres-1`) is bound to host port `5433` with password `changeme_strong_password`. After overriding `DATABASE_URL` for the correct port/credentials, `migrate dev` still demanded a destructive reset because the dev DB (provisioned via `db push`) has no `_prisma_migrations` table and, additionally, was missing the previously-committed-but-never-applied `20260712202653_remove_evolution_zapi_provisioning` migration.
- **Fix:** Applied the pre-existing `20260712202653_remove_evolution_zapi_provisioning/migration.sql` directly to the container first (catch-up), then generated a scoped diff for just `User.ativo` via `prisma migrate diff --from-config-datasource --to-schema prisma/schema.prisma --script`, wrote it to a new migration folder `20260712210000_add_user_ativo`, and applied it directly via `docker exec -i cargo-sentinel-postgres-1 psql ... < migration.sql`, then ran `prisma generate`.
- **Files modified:** `packages/database/prisma/migrations/20260712210000_add_user_ativo/migration.sql` (new)
- **Verification:** `pnpm --filter @cargo-sentinel/web build` passes with the new `ativo` field available on the Prisma Client type.
- **Committed in:** `01057d5` (Task 1 commit)

---

**Total deviations:** 1 auto-fixed (1 blocking — DB migration fallback)
**Impact on plan:** Necessary to unblock the plan's only schema change; no scope creep. The stale local `.env` files (`localhost:5432` / password `sentinel`) were left untouched since fixing them was out of this task's scope — flagged here for awareness.

## Issues Encountered

- Local `.env` files (`packages/database/.env`, `apps/api/.env`, `apps/web/.env.local`) all reference `localhost:5432` with password `sentinel`, which does not match the running dev Postgres container (`localhost:5433`, password `changeme_strong_password`). Migration commands required an explicit `DATABASE_URL` override. Not fixed — out of this task's scope; noted as a pre-existing environment drift.
- Pre-existing uncommitted debug changes in `apps/api/src/routes/lpr.ts` (extra `console.error` debug lines) and `.env.example` (a live-looking `ZAPI_CLIENT_TOKEN` value) were present in the working tree before this task started and are unrelated to this plan's scope — left untouched, not committed.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Super Admin panel is now feature-complete for empresa/usuario management per plan scope: redirect fixed, detail shell with 3 tabs, usuarios CRUD, list search.
- Local dev `.env` files should be corrected (port 5433, password `changeme_strong_password`) to avoid repeating the migration fallback dance in future quick tasks — recommend a follow-up quick task to fix `packages/database/.env`, `apps/api/.env`, `apps/web/.env.local`.
- `apps/api/src/routes/lpr.ts` has leftover debug `console.error` lines and `.env.example` has what looks like a real `ZAPI_CLIENT_TOKEN` value committed to the working tree (uncommitted) — should be reviewed/cleaned in a separate task.

---
*Phase: quick-260712-sft*
*Completed: 2026-07-12*

## Self-Check: PASSED

All 9 created/key files verified present on disk. All 6 task commit hashes (01057d5, 433b84e, c4b146d, d19ec49, 782aabd, d467812) verified present in git log.
