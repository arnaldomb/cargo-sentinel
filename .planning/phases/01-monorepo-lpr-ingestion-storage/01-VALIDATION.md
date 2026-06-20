---
phase: 1
slug: monorepo-lpr-ingestion-storage
status: draft
nyquist_compliant: true
wave_0_complete: true
created: 2026-06-20
---

# Phase 1 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest (unit) across `apps/api` and `packages/database` |
| **Config files** | `apps/api/vitest.config.ts`, `packages/database/vitest.config.ts` |
| **Quick run command** | `pnpm --filter @cargo-sentinel/api test:unit` |
| **Full suite command** | `pnpm test` (all workspaces via turbo) |
| **Estimated runtime** | ~15 seconds |

---

## Sampling Rate

- **After every task commit:** Run the workspace-scoped unit suite (`pnpm --filter <workspace> test:unit`)
- **After every plan wave:** Run `pnpm test` (full suite across all workspaces)
- **Before `/gsd-verify-work`:** Full suite must be green
- **Max feedback latency:** 20 seconds

---

## Per-Task Verification Map

> Tests are created **inline within their implementation plans** (each code-producing task is `tdd="true"` and writes its test alongside the implementation). There is no separate Wave 0 test-only plan; the `wave_0_complete` contract is satisfied because every MISSING test reference is created by the first task that needs it, before that task's implementation is accepted.

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | Test Created By | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-----------------|--------|
| 1-01-x  | 01 | 1 | INFRA-01 | — | N/A | build | `pnpm build` | Plan 01 (workspace scaffold) | ⬜ pending |
| 1-02-1  | 02 | 2 | INFRA-02 (`createTenantClient`) | T-1-D1 | Injects `empresaId` into every `where`; `$extends` invoked | unit | `pnpm --filter @cargo-sentinel/database test` | Plan 02 Task 1 (`tenant.test.ts`) | ⬜ pending |
| 1-02-2  | 02 | 2 | INFRA-02 (schema push) | T-1-D3 | Schema applies; 4 tables exist | smoke | `prisma db push --accept-data-loss` | Plan 02 Task 2 (disposable PG) | ⬜ pending |
| 1-03-1  | 03 | 2 | INFRA-03, INFRA-04, INFRA-05 | T-1-I2, T-1-I3 | acme.json chmod 600; secrets in gitignored .env | infra | garage.toml/.env.example file checks | Plan 03 Task 1 | ⬜ pending |
| 1-03-2  | 03 | 2 | STORAGE-01 | T-1-03 | `lpr-images` bucket auto-creates; not public | smoke | `docker compose config` + `garage bucket list` | Plan 03 Task 2 | ⬜ pending |
| 1-04-1  | 04 | 3 | LPR-04, LPR-05, STORAGE-02, STORAGE-03 | T-1-04 | Presigned URL uses public `GARAGE_SERVER_URL`, not `garage:3900`; 300s TTL | unit | `pnpm --filter @cargo-sentinel/api test:unit -- garage` | Plan 04 Task 1 (`garage.test.ts`) | ⬜ pending |
| 1-04-2  | 04 | 3 | LPR-03 (key) | T-1-V6 | SHA256 idempotency key (never MD5); deterministic | unit | `pnpm --filter @cargo-sentinel/api test:unit -- idempotency normalize` | Plan 04 Task 2 (`idempotency.test.ts`, `normalize.test.ts`) | ⬜ pending |
| 1-04-3  | 04 | 3 | LPR-01, LPR-02, LPR-03 | T-1-01, T-1-02, T-1-D2 | 200 returned immediately; jobId dedup; `empresaId` from camera (not payload) | unit | `pnpm --filter @cargo-sentinel/api test:unit -- lpr` | Plan 04 Task 3 (`lpr.test.ts`) | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

### Requirement → Plan Coverage (authoritative)

| Requirement | Plan | Notes |
|-------------|------|-------|
| INFRA-01 | 01 | Turborepo + pnpm workspaces, `pnpm build` green |
| INFRA-02 | 02 | `createTenantClient` (Task 1) + schema push (Task 2) |
| INFRA-03 | 03 | 6-service docker-compose |
| INFRA-04 | 03 | Traefik v3 priority routing |
| INFRA-05 | 03 | acme.json persistent volume |
| LPR-01 | 04 | Task 3 — webhook route |
| LPR-02 | 04 | Task 3 — immediate 200 |
| LPR-03 | 04 | Task 2 (key) + Task 3 (jobId dedup) |
| LPR-04 | 04 | Task 1 (Garage upload) + Task 3 (worker, no base64 in DB) |
| LPR-05 | 04 | Task 1 (`fotoGarageKey` + presigned URL) |
| STORAGE-01 | 03 | Garage `lpr-images` bucket auto-create |
| STORAGE-02 | 04 | Task 1 — `GARAGE_SERVER_URL` public endpoint |
| STORAGE-03 | 04 | Task 1 — presigned GET URL, 300s TTL |

---

## Wave 0 Requirements (satisfied inline)

`wave_0_complete: true` — tests are authored inline by the implementation tasks (all code-producing tasks are `tdd="true"`), not by a separate test-only plan. The framework and each test file are created by the first task that consumes them, before that task's implementation is accepted:

- [x] `packages/database/src/tenant.test.ts` — INFRA-02 → created by **Plan 02 Task 1** (vitest installed in the database workspace)
- [x] `apps/api/src/services/garage.test.ts` — LPR-05/STORAGE-02/STORAGE-03 → created by **Plan 04 Task 1** (vitest installed in the api workspace)
- [x] `apps/api/src/jobs/idempotency.test.ts` + `apps/api/src/lpr/normalize.test.ts` — LPR-03 → created by **Plan 04 Task 2**
- [x] `apps/api/src/routes/lpr.test.ts` — LPR-01/LPR-02/LPR-03 → created by **Plan 04 Task 3**
- [x] vitest installed in `packages/database` (Plan 02) and `apps/api` (Plan 04 Task 1)

*No separate Wave 0 plan exists; the inline-TDD structure satisfies the Wave 0 contract because no implementation task is accepted before its test file exists and runs.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Real Intelbras camera sends webhook and event appears in Postgres | LPR-01..05 (live) | Requires physical camera hardware | Point camera at `/api/lpr/NotificationInfo/vehicle`, check Postgres `Evento` table; inspect logged `rawPayload` to confirm field-name variants |
| Docker Compose all 6 services start cleanly | INFRA-03 | Requires Docker runtime with port availability | `docker compose up`, verify all containers reach healthy status |
| Presigned URL opens photo in browser | STORAGE-03 | Browser behavior not testable in CI | Copy presigned URL from API response, open in browser |

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or inline-created test dependencies
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 references covered (inline TDD — no MISSING references remain)
- [x] No watch-mode flags
- [x] Feedback latency < 20s
- [x] `nyquist_compliant: true` set in frontmatter
- [x] `wave_0_complete: true` set in frontmatter (inline test creation satisfies the contract)

**Approval:** pending
