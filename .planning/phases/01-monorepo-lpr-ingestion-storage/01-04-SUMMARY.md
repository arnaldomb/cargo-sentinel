---
phase: 01-monorepo-lpr-ingestion-storage
plan: "04"
subsystem: lpr-ingestion-pipeline
tags: [bullmq, redis, garage, s3, webhook, idempotency, normalization, tdd]
requires: ["01-01", "01-02", "01-03"]
provides: [lpr-webhook-route, bullmq-queue, lpr-worker, garage-service, idempotency-key, payload-normalization]
affects: [phase-2-dashboard, phase-3-alerts, phase-4-reports]
tech-stack:
  added:
    - "bullmq ^5.79.0 — BullMQ job queue with SHA256 jobId dedup"
    - "@aws-sdk/client-s3 ^3.1073.0 — S3-compatible Garage uploads"
    - "@aws-sdk/s3-request-presigner ^3.1073.0 — SigV4 presigned GET URLs"
    - "ioredis 5.10.1 (pinned) — Redis client for BullMQ connections"
    - "uuid ^14.0.1 — unique Garage object key generation"
    - "sharp ^0.35.2 — image buffer validation (available for optional recompression)"
    - "supertest ^7.2.2 — HTTP route testing"
  patterns:
    - "Dual S3Client pattern: internalS3 (GARAGE_INTERNAL_URL) for uploads, publicS3 (GARAGE_SERVER_URL) for presigned URLs"
    - "Redis connection factory (createRedisConnection) — Queue and Worker each call it independently (Pitfall 5)"
    - "Two-layer idempotency: BullMQ jobId dedup (Layer 1) + Prisma upsert on idempotencyKey (Layer 2)"
    - "Immediate 200 pattern: res.status(200).json() before any await in route handler (LPR-02)"
    - "empresaId resolved from camera DB row only, never from webhook payload (T-1-D2)"
    - "rawPayload stored without ImageBase64 field (LPR-04 anti-pattern prevention)"
    - "SHA256(cameraId:placa:dateTime) for idempotency key (T-1-V6: never MD5)"
key-files:
  created:
    - apps/api/src/services/redis.ts
    - apps/api/src/services/garage.ts
    - apps/api/src/services/garage.test.ts
    - apps/api/src/jobs/idempotency.ts
    - apps/api/src/jobs/idempotency.test.ts
    - apps/api/src/lpr/normalize.ts
    - apps/api/src/lpr/normalize.test.ts
    - apps/api/src/jobs/queue.ts
    - apps/api/src/jobs/worker.ts
    - apps/api/src/routes/lpr.ts
    - apps/api/src/routes/lpr.test.ts
  modified:
    - apps/api/src/index.ts (mount /api/lpr router; conditional worker import)
    - apps/api/package.json (add bullmq, aws-sdk, ioredis, uuid, sharp, supertest)
    - package.json (ioredis override 5.10.1; sharp/msgpackr-extract in onlyBuiltDependencies)
    - pnpm-lock.yaml
decisions:
  - "Dual S3Client pattern: two separate S3Client instances (internal for upload, public for presigned URLs) to avoid Pitfall 2 SignatureDoesNotMatch"
  - "ioredis pinned to 5.10.1 to deduplicate with BullMQ's bundled version (prevents TS type mismatch across two ioredis instances)"
  - "Direcao resolved as string literal union ('ENTRADA' | 'SAIDA' | null) in worker.ts — avoids @prisma/client direct dependency in apps/api"
  - "Worker imported conditionally (NODE_ENV !== 'test') in index.ts to prevent Redis connections during unit tests"
  - "rawPayloadWithoutImage stored (not full job.data) to prevent base64 image accumulation in Postgres JSON column"
metrics:
  duration: "~45 minutes"
  completed: "2026-06-20T20:00:00Z"
  tasks_completed: 3
  tasks_total: 3
  files_created: 11
  files_modified: 4
requirements_satisfied:
  - LPR-01
  - LPR-02
  - LPR-03
  - LPR-04
  - LPR-05
  - STORAGE-02
  - STORAGE-03
---

# Phase 01 Plan 04: Intelbras LPR Ingestion Pipeline Summary

Webhook→queue→worker→Garage→Postgres pipeline: POST /api/lpr/NotificationInfo/vehicle returns 200 immediately and enqueues a BullMQ job keyed by SHA256(cameraId:placa:dateTime); the worker decodes base64, uploads to Garage via internal S3Client, and upserts an Evento row with ON CONFLICT DO NOTHING semantics; presigned GET URLs use a separate public S3Client signed against GARAGE_SERVER_URL with 300s TTL.

## Tasks Completed

| Task | Name | Commit | Key Files |
|------|------|--------|-----------|
| 1 | Redis connection factory + dual-S3Client Garage service + presigned URL tests | 3d85d73 | services/redis.ts, services/garage.ts, services/garage.test.ts |
| 2 | SHA256 idempotency key + Intelbras payload normalization (pure functions + tests) | 2858d99 | jobs/idempotency.ts, jobs/idempotency.test.ts, lpr/normalize.ts, lpr/normalize.test.ts |
| 3 | BullMQ queue + worker + LPR route wired into Express | 027f40e | jobs/queue.ts, jobs/worker.ts, routes/lpr.ts, routes/lpr.test.ts, index.ts |

## Verification Results

- `pnpm --filter @cargo-sentinel/api test` passes: 4 test files, 36 tests (garage: 2, idempotency: 5, normalize: 6, lpr route: 5 + duplicates from combined run)
- `pnpm build` passes: all 5 workspaces (shared, ui, database, api, web)
- Route test: 200 returned before queue.add is awaited (immediate-200 contract proven)
- Route test: duplicate POST produces same SHA256 jobId (Layer 1 dedup proven)
- Garage test: presigned URL contains `sentinel.example.com`, excludes `garage:3900`, includes `X-Amz-Expires=300`
- Worker: `prisma.evento.upsert` with `update: {}` — ON CONFLICT DO NOTHING (Layer 2 dedup)
- Worker: `empresaId` sourced from `camera.empresaId` (DB), not payload (T-1-D2)
- Worker: `ImageBase64` stripped from rawPayload before DB write (LPR-04)

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Duplicate ioredis versions caused TypeScript type mismatch**
- **Found during:** Task 3 — `pnpm build` after creating queue.ts and worker.ts
- **Issue:** BullMQ 5.79.0 bundles `ioredis@5.10.1` as a direct dependency. We installed `ioredis@5.11.1` separately. pnpm resolved them as two different packages, causing TS2322: `Redis` from `5.11.1` not assignable to `ConnectionOptions` expecting `Redis` from `5.10.1`.
- **Fix:** Added `"overrides": { "ioredis": "5.10.1" }` to root `package.json` pnpm section. Pinned `apps/api/package.json` `ioredis` to `5.10.1`. Ran `pnpm install` to deduplicate.
- **Files modified:** `package.json` (root), `apps/api/package.json`, `pnpm-lock.yaml`
- **Commit:** 027f40e

**2. [Rule 1 - Bug] TS2742 non-portable type inference on Router**
- **Found during:** Task 3 — `pnpm build`
- **Issue:** `const router = Router()` inferred type references deep `@types/express-serve-static-core` path — same pattern as Plan 01 fix.
- **Fix:** Changed to `const router: RouterType = Router()` with explicit type import.
- **Files modified:** `apps/api/src/routes/lpr.ts`
- **Commit:** 027f40e

**3. [Rule 1 - Bug] @prisma/client not directly accessible from apps/api**
- **Found during:** Task 3 — `pnpm build`
- **Issue:** `import type { Direcao } from '@prisma/client'` failed with TS2307 because `@prisma/client` is a dependency of `packages/database`, not `apps/api`.
- **Fix:** Removed the import. Changed `resolveDirection` return type to string literal union `'ENTRADA' | 'SAIDA' | null` — structurally equivalent and type-safe without the cross-package import.
- **Files modified:** `apps/api/src/jobs/worker.ts`
- **Commit:** 027f40e

## Known Stubs

None. The full pipeline is implemented and unit-tested. Integration verification (camera DB seed → live POST → Postgres row → Garage object) is deferred to the phase integration gate per VALIDATION.md.

## Threat Flags

No new threat surface beyond what the plan's threat model covers.

- T-1-01 (Spoofing): Camera lookup rejects unknown CameraId — MITIGATED in worker.ts
- T-1-02 (DoS): express.json limit 2mb already set in Plan 01; normalize layer rejects missing plate/image — MITIGATED
- T-1-D2 (Cross-tenant disclosure): empresaId from camera.empresaId only — MITIGATED in worker.ts
- T-1-04 (Image access without auth): Garage bucket non-public; presigned URLs 300s TTL — MITIGATED in garage.ts
- T-1-V6 (Weak idempotency): SHA256 via Node crypto — MITIGATED in idempotency.ts

## Self-Check: PASSED

- apps/api/src/services/redis.ts: FOUND
- apps/api/src/services/garage.ts: FOUND
- apps/api/src/services/garage.test.ts: FOUND
- apps/api/src/jobs/idempotency.ts: FOUND
- apps/api/src/jobs/idempotency.test.ts: FOUND
- apps/api/src/lpr/normalize.ts: FOUND
- apps/api/src/lpr/normalize.test.ts: FOUND
- apps/api/src/jobs/queue.ts: FOUND
- apps/api/src/jobs/worker.ts: FOUND
- apps/api/src/routes/lpr.ts: FOUND
- apps/api/src/routes/lpr.test.ts: FOUND
- apps/api/src/index.ts: FOUND (contains app.use('/api/lpr', lprRouter))
- Commit 3d85d73: FOUND
- Commit 2858d99: FOUND
- Commit 027f40e: FOUND
- 36 tests passing: VERIFIED
- pnpm build all 5 packages: VERIFIED
