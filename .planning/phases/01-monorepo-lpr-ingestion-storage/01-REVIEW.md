---
phase: 01-monorepo-lpr-ingestion-storage
reviewed: 2026-06-20T00:00:00Z
depth: standard
files_reviewed: 26
files_reviewed_list:
  - .dockerignore
  - .env.example
  - apps/api/Dockerfile
  - apps/api/src/jobs/idempotency.test.ts
  - apps/api/src/jobs/idempotency.ts
  - apps/api/src/jobs/queue.ts
  - apps/api/src/jobs/worker.ts
  - apps/api/src/lpr/normalize.test.ts
  - apps/api/src/lpr/normalize.ts
  - apps/api/src/routes/lpr.test.ts
  - apps/api/src/routes/lpr.ts
  - apps/api/src/services/garage.test.ts
  - apps/api/src/services/garage.ts
  - apps/api/src/services/redis.ts
  - apps/web/Dockerfile
  - docker-compose.yml
  - garage/garage.toml
  - packages/database/package.json
  - packages/database/prisma.config.ts
  - packages/database/prisma/schema.prisma
  - packages/database/src/index.ts
  - packages/database/src/tenant.test.ts
  - packages/database/src/tenant.ts
  - packages/database/tsconfig.json
  - packages/database/vitest.config.ts
  - traefik/acme.json
findings:
  critical: 3
  warning: 4
  info: 3
  total: 10
status: issues_found
---

# Phase 01: Code Review Report

**Reviewed:** 2026-06-20T00:00:00Z
**Depth:** standard
**Files Reviewed:** 26
**Status:** issues_found

## Summary

Phase 01 delivers the monorepo scaffold, LPR ingestion pipeline, Garage S3 storage, BullMQ queue/worker, tenant middleware, and Docker Compose infrastructure. The overall architecture is sound: the two-layer dedup strategy (BullMQ jobId + Prisma upsert), the immediate-200-then-enqueue pattern, and the internal/public S3 client split all reflect correct design decisions consistent with the research findings.

Three critical issues require fixes before the service runs safely in production:

1. The Traefik dashboard is exposed unauthenticated to the internet.
2. The Express async route handler for LPR events does not catch errors from `lprQueue.add`, producing silent unhandled rejections in Express 4.
3. The BullMQ Worker instance is discarded (not stored), preventing graceful shutdown and losing access to worker-level error events.

Additionally, the tenant middleware silently skips write operations, creating a gap between its documented purpose and its actual enforcement scope. Four warnings and three info items are documented below.

---

## Critical Issues

### CR-01: Traefik Dashboard Exposed Without Authentication

**File:** `docker-compose.yml:146`
**Issue:** Port `8080:8080` is published, which exposes the Traefik API and dashboard to the internet with no authentication. The Traefik API gives full read access to all routing rules, TLS certificate metadata, and service topology. If `--api.insecure=true` is ever enabled (the default Traefik demo configuration), it also allows runtime reconfiguration.

**Fix:** Remove the `8080` port binding entirely, or restrict it to localhost and protect with `basicauth` middleware:

```yaml
# docker-compose.yml — remove the 8080 binding:
ports:
  - "80:80"
  - "443:443"
  # Do NOT expose 8080 in production

# If dashboard is needed, add to Traefik command args:
  - "--api.dashboard=true"
  - "--api.insecure=false"
# And add a router + basicauth middleware in labels
```

---

### CR-02: Unhandled Promise Rejection in Async Express Route Handler (Express 4)

**File:** `apps/api/src/routes/lpr.ts:41`
**Issue:** The route handler is declared `async` and calls `await lprQueue.add(...)` after the response has already been sent. Express 4.x does not automatically catch errors from async handlers — if `lprQueue.add` throws (e.g., Redis connection failure), the error becomes an unhandled promise rejection that crashes the process in Node 15+. The `try/catch` block on lines 27-33 only wraps `normalizeIntelbrasPayload`, not the queue operation.

```typescript
// Current — lprQueue.add error is not caught:
router.post('/NotificationInfo/:action', async (req, res) => {
  res.status(200).json({ status: 'received' });
  // ...
  await lprQueue.add(...);  // throws on Redis failure → unhandled rejection
});
```

**Fix:** Wrap the enqueue call in its own try/catch:

```typescript
router.post('/NotificationInfo/:action', async (req, res) => {
  res.status(200).json({ status: 'received' });

  const { action } = req.params;
  if (action !== 'vehicle') return;

  let normalized;
  try {
    normalized = normalizeIntelbrasPayload(req.body as Record<string, unknown>);
  } catch (err) {
    console.error('[lpr] invalid payload:', err instanceof Error ? err.message : err);
    return;
  }

  const { PlateNumber, ImageBase64, CameraId, Direction, DateTime } = normalized;
  const idempotencyKey = buildIdempotencyKey(CameraId, PlateNumber, DateTime);

  try {
    await lprQueue.add(
      'process-lpr-event',
      { PlateNumber, ImageBase64, CameraId, Direction, DateTime, idempotencyKey },
      { jobId: idempotencyKey },
    );
  } catch (err) {
    console.error('[lpr] failed to enqueue job:', err instanceof Error ? err.message : err);
  }
});
```

---

### CR-03: BullMQ Worker Instance Discarded — No Graceful Shutdown, No Error Handler

**File:** `apps/api/src/jobs/worker.ts:31`
**Issue:** `new Worker(...)` is called but the returned instance is not assigned to any variable. This has two consequences:

1. The worker cannot be gracefully shut down (`worker.close()`) on `SIGTERM`. When Docker stops the container, BullMQ jobs in-flight will be interrupted mid-execution (between the Garage upload and the Prisma upsert), leaving orphaned S3 objects with no DB record.
2. Worker-level error events (`worker.on('error', ...)`) cannot be attached, so Redis connection failures in the worker are swallowed or trigger uncaught exceptions.

**Fix:** Assign the instance and wire shutdown:

```typescript
// worker.ts
export const lprWorker = new Worker(
  'lpr-events',
  async (job) => { /* ... */ },
  { connection: createRedisConnection() },
);

lprWorker.on('error', (err) => {
  console.error('[worker] BullMQ worker error:', err);
});

// In apps/api/src/index.ts, add:
process.on('SIGTERM', async () => {
  await lprWorker.close();
  process.exit(0);
});
```

---

## Warnings

### WR-01: Tenant Middleware Silently Bypasses Write Operations

**File:** `packages/database/src/tenant.ts:8`
**Issue:** The `$allOperations` interceptor injects `empresaId` into the `where` clause of every query. However, `create` and `createMany` operations do not have a `where` clause — they use a `data` field. The middleware's `'where' in args` check returns `false` for these operations, so they pass through unmodified. The middleware is documented as enforcing tenant isolation, but it only enforces it for read/update/delete operations.

In the current worker (`worker.ts:55`), `prisma.evento.upsert` uses the global `prisma` client (not a tenant client), so this gap is not immediately exploitable. But callers using `createTenantClient` for writes would get no enforcement.

**Fix:** Add documentation comment clarifying the scope limitation, and for create operations, verify `data.empresaId` matches the tenant:

```typescript
export function createTenantClient(prisma: PrismaClient, empresaId: string) {
  return prisma.$extends({
    query: {
      $allModels: {
        async $allOperations({ args, query }) {
          if (args && typeof args === 'object') {
            // Inject into WHERE (read/update/delete)
            if ('where' in args) {
              (args as any).where = { ...(args as any).where, empresaId };
            }
            // Guard CREATE data — throw if empresaId is provided but doesn't match
            if ('data' in args && (args as any).data?.empresaId !== undefined) {
              if ((args as any).data.empresaId !== empresaId) {
                throw new Error(`Tenant isolation: empresaId mismatch`);
              }
            }
          }
          return query(args);
        },
      },
    },
  });
}
```

---

### WR-02: Empty CameraId Passes Normalization and Is Silently Accepted

**File:** `apps/api/src/lpr/normalize.ts:33`
**Issue:** When none of the known CameraId field name variants (`CameraId`, `camera_id`, `ChannelId`, `DeviceId`) are present in the raw payload, `camera` defaults to `''` (empty string). This empty-string CameraId is then included in the normalized payload, passes V5 validation (which only checks plate and image), and gets enqueued. The worker will call `prisma.camera.findUnique({ where: { codigoLpr: '' } })` which returns `null` and throws — so the job fails correctly — but it consumes a queue slot and makes 1 unnecessary DB round-trip per event.

More importantly, the error message `Camera not found: ` (empty string) makes debugging very difficult. Explicit rejection at normalization time is better.

**Fix:** Add a CameraId validation in `normalizeIntelbrasPayload` alongside the existing plate/image check:

```typescript
// In normalize.ts, after the existing validation block:
if (!camera || camera.trim() === '') {
  throw new Error('invalid LPR payload: missing cameraId');
}
```

---

### WR-03: `garage.toml` Placeholder Secrets Committed to Version Control

**File:** `garage/garage.toml:15,24`
**Issue:** The `rpc_secret` is set to 64 zeros and `admin_token` is set to `"dev-admin-token-replace-before-deploy"`. These are committed to the repository. While labeled as dev placeholders, if a developer deploys directly from `git clone` without replacing these values, Garage's RPC and admin API will use publicly known credentials.

The `rpc_secret` with all-zero value is particularly notable — any process that knows the Garage RPC protocol could interact with the cluster using this key.

**Fix:** Remove the actual placeholder values from the committed file and replace with instructions to generate them:

```toml
# garage/garage.toml
# Generate with: openssl rand -hex 32
rpc_secret = "REPLACE_WITH_GENERATED_SECRET"

[admin]
api_bind_addr = "[::]:3903"
# Generate with: openssl rand -base64 32
admin_token = "REPLACE_WITH_GENERATED_TOKEN"
```

Alternatively, use environment variable substitution and pass `rpc_secret` and `admin_token` via Docker secrets or env vars, keeping committed values always obviously invalid.

---

### WR-04: `garage.ts` BUCKET Name Hardcoded — Diverges from Environment Variable

**File:** `apps/api/src/services/garage.ts:5`
**Issue:** `const BUCKET = 'lpr-images'` is hardcoded. The environment provides `GARAGE_DEFAULT_BUCKET` (set to `lpr-images` in `.env.example` and passed to the Garage container). If a deployer changes `GARAGE_DEFAULT_BUCKET` to a different value, the API will continue trying to upload to the old hardcoded `'lpr-images'` bucket, causing `NoSuchBucket` errors with no obvious diagnostic path.

**Fix:**
```typescript
// garage.ts
const BUCKET = process.env.GARAGE_DEFAULT_BUCKET ?? 'lpr-images';
```

---

## Info

### IN-01: `apps/api/Dockerfile` Copies `packages/ui` Into the API Image Unnecessarily

**File:** `apps/api/Dockerfile:51`
**Issue:** The API runtime stage copies `packages/ui` (`COPY --from=builder /app/packages/ui ./packages/ui`). The API service has no dependency on the UI component library. This increases the image size and adds a coupling that could be confusing.

**Fix:** Remove the UI copy from the API Dockerfile:
```dockerfile
# Remove this line from Stage 3 (runner) of apps/api/Dockerfile:
# COPY --from=builder /app/packages/ui ./packages/ui
```

---

### IN-02: `getPresignedUrl` Creates a New S3Client on Every Invocation

**File:** `apps/api/src/services/garage.ts:53`
**Issue:** A new `S3Client` is instantiated inside `getPresignedUrl` on every call. The internal client `internalS3` is correctly module-scoped (created once), but the public client for presigned URLs is not reused. Under high LPR event load, this creates a new HTTP/TLS connection pool per request.

**Fix:** Extract the public client to module scope, mirroring the pattern used for `internalS3`:

```typescript
const publicS3 = new S3Client({
  region: 'garage',
  endpoint: process.env.GARAGE_SERVER_URL,
  credentials: {
    accessKeyId: process.env.GARAGE_ACCESS_KEY!,
    secretAccessKey: process.env.GARAGE_SECRET_KEY!,
  },
  forcePathStyle: true,
});

export async function getPresignedUrl(key: string): Promise<string> {
  return getSignedUrl(publicS3, new GetObjectCommand({ Bucket: BUCKET, Key: key }), {
    expiresIn: 300,
  });
}
```

Note: The test currently uses dynamic import with `beforeEach` env setup specifically because the client is constructed at import time. If this is refactored, the test will need to be updated to set env vars before the module is first imported (e.g., using `vi.stubEnv` or a setup file).

---

### IN-03: Prisma Schema Missing `datasource.url` — Relies Entirely on `prisma.config.ts`

**File:** `packages/database/prisma/schema.prisma:5-7`
**Issue:** The `datasource db` block has no `url` field. This is valid in Prisma v7 when a `prisma.config.ts` provides the datasource, but it means running `prisma generate` or `prisma db push` without the config file (e.g., in a CI environment that only copies the `prisma/` directory) will fail with a confusing error about missing datasource URL.

**Fix:** Add a fallback `url` with `env()` for compatibility and clearer error messages:

```prisma
datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}
```

This makes both the `prisma.config.ts` path (runtime) and the direct `prisma` CLI path (CI/migrations) work without additional setup.

---

_Reviewed: 2026-06-20T00:00:00Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
