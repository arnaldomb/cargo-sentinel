---
phase: quick
plan: 260712-o0s
subsystem: whatsapp-integration
tags: [zapi, whatsapp, express, prisma, nextjs, bff-proxy, superadmin, multi-tenant]

requires: []
provides:
  - Z-API-only WhatsApp alerting (Evolution API fully removed)
  - SUPER_ADMIN-provisioned Z-API instance per empresa (instanceId/token/clientToken never exposed to tenant)
  - Tenant-facing WhatsApp config UI (status/QR/grupos/config de envio/testar), no raw credentials
affects: [alert-worker, admin-panel, tenant-configuracoes]

tech-stack:
  added: []
  patterns:
    - "Superadmin provisions third-party credentials; tenant only sees derived/masked state (tokenMask, instanciaVinculada)"
    - "Prisma migrate diff --from-config-datasource --to-schema as fallback when migrate dev requires a destructive reset on a drifted dev DB"

key-files:
  created:
    - apps/api/src/infra/zapi/zapi.service.ts
    - apps/web/src/app/(superadmin)/admin/empresas/[id]/whatsapp/page.tsx
    - apps/web/src/app/(superadmin)/admin/empresas/[id]/whatsapp/whatsapp-provision-client.tsx
    - apps/web/src/app/api/admin-whatsapp-proxy/[id]/route.ts
    - apps/web/src/app/api/admin-whatsapp-proxy/[id]/desconectar/route.ts
    - packages/database/prisma/migrations/20260712202653_remove_evolution_zapi_provisioning/migration.sql
  modified:
    - packages/database/prisma/schema.prisma
    - apps/api/src/jobs/alert-worker.ts
    - apps/api/src/jobs/alert-worker.test.ts
    - apps/api/src/routes/configuracoes-whatsapp.ts
    - apps/api/src/routes/admin.ts
    - apps/api/src/index.ts
    - apps/web/src/app/(admin)/configuracoes/whatsapp/whatsapp-client.tsx
    - apps/web/src/components/sidebar.tsx
    - .env.example
    - docker-compose.yml
    - docker-compose.vps.yml
    - CLAUDE.md

key-decisions:
  - "Z-API replaces Evolution API entirely — SUPER_ADMIN provisions the instance per empresa, tenant never sees raw credentials"
  - "Removed ConfiguracaoAlerta model (per-obra phone list) — it was exclusive to the Evolution flow"
  - "Generated the migration via `prisma migrate diff --from-config-datasource --to-schema` instead of `migrate dev`, since the local dev DB was built with `db push` and had diverged from migration history (migrate dev demanded a destructive reset)"

patterns-established:
  - "Z-API credential flow: SUPER_ADMIN PUT validates via getStatus() before persisting; tenant GET/PUT strip zapi* fields"

requirements-completed: []

duration: ~2h30min
completed: 2026-07-12
---

# Quick Task 260712-o0s: Z-API WhatsApp Integration Summary

**Replaced Evolution API with Z-API end-to-end: SUPER_ADMIN provisions/validates the Z-API instance per empresa (credentials never reach the tenant), alert-worker sends alerts only via Z-API with a gate on ativo/CONECTADO/classificação, and both superadmin and tenant UIs were rebuilt around this flow.**

## Performance

- **Duration:** ~2h30min
- **Tasks:** 6/6 completed
- **Files modified/created:** 23

## Accomplishments

- Evolution API fully removed: `apps/api/src/services/whatsapp.ts` (+ test) and `apps/api/src/routes/configuracoes-alerta.ts` deleted, `ConfiguracaoAlerta` Prisma model dropped, Docker Compose `evolution-api` service removed from both `docker-compose.yml` and `docker-compose.vps.yml`, `.env.example` cleaned up.
- `alert-worker.ts` now sends WhatsApp alerts exclusively via Z-API, gated on `configWhatsApp.ativo && whatsappInstStatus === 'CONECTADO'`, valid `zapiConfigFrom()`, and `classificacoesAlerta` permitting the payload's classification; each send (destino/grupo) wrapped in its own try/catch.
- Tenant routes (`/api/configuracoes-whatsapp`) rewritten so GET/PUT never read or write `zapiInstanceId`/`zapiToken`/`zapiClientToken`; `status` moved from POST to GET; added `/desconectar` and `/testar`.
- Superadmin routes added under `/api/admin/empresas/:id/whatsapp` (GET masked view, PUT validates credentials via `getStatus()` before persisting, POST `/desconectar`, DELETE clears the link).
- New superadmin UI at `/admin/empresas/[id]/whatsapp` (vincular/desconectar/remover instância) with a matching BFF proxy.
- Tenant UI (`whatsapp-client.tsx`) rebuilt without credential fields; shows a provisioning warning when `instanciaVinculada === false`; added desconectar/testar actions. Old `/configuracoes/alertas` (Evolution) page removed; sidebar now has a single "WhatsApp" nav item.
- `CLAUDE.md` stack docs updated: Z-API replaces the Evolution API entries in Recommended Stack, Key Decisions (#5), What NOT to Use, and Version Notes, with the revision explicitly dated 2026-07-12.

## Task Commits

1. **Task 1: Schema, migração e worker — remover Evolution, alertas via Z-API apenas** - `76aa5ef` (feat)
2. **Task 2: Rotas tenant Z-API (ADMIN_EMPRESA) — sem credenciais brutas** - `21f6e67` (feat)
3. **Task 3: Rotas superadmin de provisionamento Z-API por empresa** - `033ec43` (feat)
4. **Task 4: UI superadmin de provisionamento + proxy BFF** - `14686c8` (feat)
5. **Task 5: UI tenant ajustada + sidebar + remover página de alertas Evolution** - `d9e0ea5` (feat)
6. **Task 6: Cleanup de config/infra e docs + verificação final** - `df3e3ec` (chore)

## Files Created/Modified

- `packages/database/prisma/schema.prisma` — removed `ConfiguracaoAlerta` model and its `Empresa`/`Obra` relations; `ConfiguracaoWhatsApp` untouched (`@@unique([empresaId])` preserved)
- `packages/database/prisma/migrations/20260712202653_remove_evolution_zapi_provisioning/migration.sql` — drops `ConfiguracaoAlerta`, creates `ConfiguracaoWhatsApp` + `WhatsAppInstanciaStatus` enum (generated via `prisma migrate diff`, applied directly to the dev DB — see Deviations)
- `apps/api/src/jobs/alert-worker.ts` — Z-API-only `alert:whatsapp` handler with dedup + gate
- `apps/api/src/jobs/alert-worker.test.ts` — rewritten to mock `../infra/zapi/zapi.service` and `prisma.configuracaoWhatsApp`
- `apps/api/src/routes/configuracoes-whatsapp.ts` — tenant routes, credential-free responses
- `apps/api/src/routes/admin.ts` — superadmin Z-API provisioning routes appended
- `apps/api/src/index.ts` — dropped `configuracoes-alerta` router mount and import
- `apps/api/src/infra/zapi/zapi.service.ts` — Z-API HTTP client (status/qr-code/disconnect/listGroups/sendWhatsAppText)
- `apps/web/src/app/(superadmin)/admin/empresas/[id]/whatsapp/page.tsx` + `whatsapp-provision-client.tsx` — superadmin provisioning UI
- `apps/web/src/app/api/admin-whatsapp-proxy/[id]/route.ts` + `.../desconectar/route.ts` — superadmin BFF proxies
- `apps/web/src/app/(superadmin)/admin/page.tsx` — added per-empresa "WhatsApp" link
- `apps/web/src/app/(admin)/configuracoes/whatsapp/whatsapp-client.tsx` + `page.tsx` — tenant UI (replaces `/configuracoes/alertas`)
- `apps/web/src/app/api/configuracoes-whatsapp-proxy/*` — base, status (GET), qrcode, grupos, testar, desconectar proxies
- `apps/web/src/components/sidebar.tsx` — single "WhatsApp" nav item, dropped Evolution "Alertas" link
- `.env.example`, `docker-compose.yml`, `docker-compose.vps.yml` — Evolution service/env removed, `ZAPI_CLIENT_TOKEN` passthrough kept/added
- `CLAUDE.md` — stack decision revised to Z-API

## Decisions Made

- Z-API replaces Evolution API completely (per plan's pre-confirmed decision #1) — no Evolution code, infra, or env var remains in source.
- SUPER_ADMIN is the sole owner of Z-API credentials; tenant-facing API/UI surfaces are built to structurally exclude `zapiInstanceId`/`zapiToken`/`zapiClientToken` (stripped in the route handler's response shape, not just hidden in the UI).
- `ConfiguracaoAlerta` (per-obra phone list) removed as dead weight — it was exclusively used by the Evolution flow, confirmed via grep before deletion.
- Migration authored via `prisma migrate diff --from-config-datasource --to-schema prisma/schema.prisma --script` rather than `prisma migrate dev` (see Deviations below).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] `prisma migrate dev` required a destructive reset on the dev DB**
- **Found during:** Task 1
- **Issue:** The local dev Postgres (Docker container `cargo-sentinel-postgres-1`, reachable on host port 5433) was originally provisioned via `prisma db push`, not `migrate dev`, so its schema had drifted from the single existing migration (`20260622000239_add_camera_nome`). Running `prisma migrate dev --name remove_evolution_zapi_provisioning` refused to proceed and demanded `prisma migrate reset` (would drop all dev data).
- **Fix:** Followed the plan's documented fallback — generated the SQL with `prisma migrate diff --from-config-datasource --to-schema prisma/schema.prisma --script` (Prisma 7 CLI syntax; `--from-url` was removed in v7), hand-created the migration directory `packages/database/prisma/migrations/20260712202653_remove_evolution_zapi_provisioning/migration.sql`, applied it directly via `docker exec -i cargo-sentinel-postgres-1 psql ... < migration.sql`, then ran `prisma generate`.
- **Files modified:** `packages/database/prisma/migrations/20260712202653_remove_evolution_zapi_provisioning/migration.sql`
- **Verification:** `\dt` confirmed `ConfiguracaoAlerta` dropped and `ConfiguracaoWhatsApp` created; `pnpm --filter @cargo-sentinel/api build` passes against the regenerated client.
- **Committed in:** `76aa5ef` (Task 1 commit)

**2. [Rule 3 - Blocking] `.env` container password mismatch discovered while connecting to the dev DB**
- **Found during:** Task 1
- **Issue:** `.env`'s `DATABASE_URL`/`POSTGRES_PASSWORD` (`changeme_strong_password`) did not match the already-running Postgres container's actual password (`sentinel`, from an earlier `docker-compose up`). Not a code change — noted so the migration steps above are reproducible.
- **Fix:** Used `docker exec cargo-sentinel-postgres-1 env` to read the container's real credentials for the one-off `DATABASE_URL` override used only for the migration commands.
- **Files modified:** None (local environment inspection only; `.env` itself is gitignored and untouched)
- **Committed in:** N/A (no source change)

---

**Total deviations:** 2 auto-fixed (both Rule 3 — blocking, both in Task 1's migration step)
**Impact on plan:** No scope creep; both were process-level workarounds for the plan's explicitly documented fallback path (`prisma migrate diff` when `migrate dev` can't run cleanly).

## Issues Encountered

- `pnpm --filter @cargo-sentinel/api test:unit` has 3 pre-existing failing test files (`eventos.test.ts`, `placas.test.ts` — twice) unrelated to this plan: an incomplete `../services/garage` mock missing `getThumbnailProxyUrl`. Confirmed pre-existing and out of scope (not caused by any file this plan touched); `alert-worker.test.ts` passes in isolation (14/14). Logged to `.planning/quick/260712-o0s-portar-integra-o-whatsapp-via-z-api-do-o/deferred-items.md` per the scope-boundary rule, not fixed.

## User Setup Required

None — no new external service configuration required. `ZAPI_CLIENT_TOKEN` in `.env.example` was already documented as an optional global fallback; per-empresa Z-API credentials are entered through the new SUPER_ADMIN UI at `/admin/empresas/[id]/whatsapp`, not via environment variables.

## Next Phase Readiness

- Backend, superadmin UI, and tenant UI are all wired end-to-end for Z-API; `alert-worker` will silently no-op (no send) for any empresa without a provisioned+connected instance, which is the intended default-safe behavior.
- Known follow-up (not part of this task): the 3 pre-existing `garage` mock test failures in `eventos.test.ts`/`placas.test.ts` should be fixed in a future quick task.
- Local dev DB has diverged from the migration history in a way that predates this task (`db push` vs `migrate dev`); future schema changes on this environment should expect the same `migrate diff` fallback until the dev DB is reset or re-baselined.

---
*Quick task: 260712-o0s*
*Completed: 2026-07-12*

## Self-Check: PASSED

All 17 key files verified present on disk; all 6 task commit hashes verified in `git log`.
