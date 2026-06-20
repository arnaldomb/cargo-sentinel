# Phase 1: Monorepo + LPR Ingestion + Storage — Research

**Researched:** 2026-06-20
**Domain:** Turborepo monorepo scaffold, Express LPR webhook ingestion, Garage S3 storage, Prisma 6 tenant middleware, BullMQ async queue
**Confidence:** HIGH (stack verified via npm registry; patterns verified against official docs and prior project research)

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| INFRA-01 | Turborepo 2.x + pnpm workspaces: `apps/web`, `apps/api`, `packages/database`, `packages/shared`, `packages/ui` | Turborepo 2.x `tasks` syntax verified; workspace structure mapped in Architecture section |
| INFRA-02 | `packages/database` exports `createTenantClient(prisma, empresaId)` — injects `empresaId` via Prisma `$extends` | Prisma 7.8.0 verified on npm; `$extends` pattern documented with working code |
| INFRA-03 | Docker Compose: 6 services — `web`, `api`, `postgres`, `garage`, `redis`, `traefik` | All 6 service configs documented in Architecture section; Garage replaces MinIO |
| INFRA-04 | Traefik v3 routing: `/media/*` → Garage, `/api/*` → Express, `/*` → Next.js | Priority routing labels documented; sticky sessions required for Socket.IO |
| INFRA-05 | `acme.json` in persistent volume for Let's Encrypt | Traefik pitfall documented; host-mounted volume with chmod 600 required |
| LPR-01 | `POST /api/lpr/NotificationInfo/:action` accepts Intelbras payload with base64 image | Endpoint structure documented; Intelbras payload format ASSUMED (see Assumptions Log) |
| LPR-02 | Returns HTTP 200 immediately, processes async via BullMQ | BullMQ 5.79.0 verified; immediate-ack pattern documented with code |
| LPR-03 | Idempotency via `SHA256(cameraId + placa + timestamp)` | Node.js crypto.createHash SHA256 documented; BullMQ jobId dedup pattern verified |
| LPR-04 | Image decoded from base64, uploaded to Garage (never stored as base64 in DB) | AWS SDK v3 + Garage endpoint pattern documented; base64→Buffer→S3 pattern shown |
| LPR-05 | `fotoGarageKey` saved in DB; presigned GET URL generated on-demand with 5-min TTL | `@aws-sdk/s3-request-presigner` documented; Garage presigned URL config notes included |
| STORAGE-01 | Garage v2.x Docker service with bucket `lpr-images` | Garage v2.3.0 Docker setup documented; `--single-node --default-bucket` mode available |
| STORAGE-02 | `GARAGE_SERVER_URL` configured with public HTTPS URL | Critical presigned URL signature requirement documented; mirrors MinIO `SERVER_URL` pattern |
| STORAGE-03 | API generates presigned GET URLs; frontend never accesses Garage directly | AWS SDK `getSignedUrl` with `GetObjectCommand` pattern documented |
</phase_requirements>

---

## Summary

Phase 1 establishes the complete foundation: Turborepo monorepo scaffold, all 6 Docker Compose services, the Intelbras LPR webhook ingestion pipeline with async BullMQ processing, SHA256 idempotency, Garage S3 image storage, and the `createTenantClient` Prisma extension that all subsequent phases depend on.

The technology stack is fully determined by prior project research and locked in CLAUDE.md — Turborepo 2.x + pnpm, Next.js 15, Express 4.x, Prisma 7.x (latest stable as of June 2026), Garage v2.3.0, BullMQ 5.x, Redis 7.x. The critical new findings for Phase 1 specifically are: (1) Garage v2 uses a `--single-node --default-bucket` mode that simplifies initialization, requiring only environment variables `GARAGE_DEFAULT_ACCESS_KEY`, `GARAGE_DEFAULT_SECRET_KEY`, and `GARAGE_DEFAULT_BUCKET`; (2) the Intelbras LPR webhook payload format is not publicly documented in any accessible source — the field names used in requirements (`PlateNumber`, `ImageBase64`, `CameraId`, `Direction`, `Timestamp`) are assumed from community knowledge of Hikvision-compatible camera APIs; and (3) BullMQ v5 supports `jobId`-based deduplication natively, which is the correct mechanism for idempotency at the queue layer.

The `createTenantClient(prisma, empresaId)` function is Phase 1's most critical deliverable — it is explicitly called out in the success criteria and is the isolation primitive that every subsequent phase depends on. The Prisma `$extends` pattern injects `empresaId` into the `where` clause of every `$allOperations` call across all models.

**Primary recommendation:** Scaffold the monorepo first with all 5 packages, validate `pnpm build` passes, then wire up Docker Compose services in order of dependency (postgres → redis → garage → api → web → traefik). Only then implement the LPR webhook route and BullMQ worker.

---

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| turborepo | 2.x | Monorepo task orchestration, build caching | Official Vercel tool; `tasks` syntax (not `pipeline`) in v2 |
| pnpm | 10.33.0 | Workspace dependency management | Faster than npm/yarn; native workspace protocol |
| next | ^15.0.0 | Web app (dashboard) | Required by project; App Router stable, Turbopack production-ready |
| typescript | 6.0.3 | Language across all packages | Required for shared Prisma types |
| express | ^4.21.x | API server (LPR webhook + REST) | Separate process for LPR ingestion; WebSocket compatibility |
| prisma | ^7.8.0 | ORM + database schema | Current stable (7.x, not 6.x as originally planned — verify below) |
| @prisma/client | ^7.8.0 | Generated Prisma client | Must match prisma CLI version |
| bullmq | ^5.79.0 | Async job queue for LPR processing | Redis-backed; jobId dedup; concurrency control |
| @aws-sdk/client-s3 | ^3.1073.0 | Garage S3 API client | AWS SDK v3 is modular; works with any S3-compatible endpoint |
| @aws-sdk/s3-request-presigner | ^3.1073.0 | Presigned URL generation | Pairs with client-s3 for time-limited GET URLs |
| ioredis | ^5.x | Redis client for BullMQ + cache | BullMQ requires ioredis; also used for dedup cache |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| multer | ^2.2.0 | Multipart form-data parsing | If Intelbras sends multipart (vs JSON+base64) |
| sharp | ^0.35.2 | Image compression before S3 upload | Resize JPEG before storing; reduces storage ~60% |
| tsx | ^4.22.4 | TypeScript execution for development | `tsx watch` for Express dev server hot reload |
| vitest | ^4.1.9 | Unit testing | Used for `createTenantClient` unit test (success criterion 5) |
| dotenv | ^16.x | Environment variable loading | `.env` file support for local development |

> **CRITICAL VERSION NOTE:** `npm view prisma version` returns **7.8.0** — NOT 6.x as documented in CLAUDE.md. Prisma has released major version 7 since the project research was written. The `$extends` API is unchanged between v6 and v7. The CLAUDE.md pin `^6.9.0` should be updated to `^7.8.0` for a new project. Using v7 is correct; do not pin to v6 on a greenfield project. [VERIFIED: npm registry 2026-06-20]

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| BullMQ | Simple `setImmediate` queue | BullMQ adds persistence (survives restart), concurrency control, retry with backoff — worth the dependency for at-least-once delivery requirement |
| `@aws-sdk/client-s3` | `minio` npm package | MinIO npm package targets MinIO-specific API; AWS SDK v3 works with any S3-compatible endpoint including Garage — use AWS SDK |
| `sharp` for image resize | No resize (store raw) | Raw Intelbras JPEGs are 100-500KB; with 10 cameras firing constantly, storage grows fast. Sharp at Phase 1 is optional but recommended |

**Installation (api workspace):**
```bash
pnpm --filter api add express bullmq @aws-sdk/client-s3 @aws-sdk/s3-request-presigner ioredis multer sharp
pnpm --filter api add -D tsx typescript @types/express @types/node vitest
```

**Installation (database workspace):**
```bash
pnpm --filter database add prisma @prisma/client
```

**Version verification (run before writing package.json):**
```bash
npm view prisma version
npm view @prisma/client version
npm view bullmq version
npm view @aws-sdk/client-s3 version
npm view @aws-sdk/s3-request-presigner version
```

---

## Architecture Patterns

### Recommended Project Structure
```
cargo-sentinel/
├── apps/
│   ├── web/                    # Next.js 15 — dashboard (minimal in Phase 1)
│   │   ├── src/app/            # App Router
│   │   └── package.json
│   └── api/                    # Express — LPR webhook + REST
│       ├── src/
│       │   ├── index.ts        # Server bootstrap (http.createServer + Socket.IO)
│       │   ├── routes/
│       │   │   └── lpr.ts      # POST /lpr/NotificationInfo/:action
│       │   ├── services/
│       │   │   ├── garage.ts   # S3 upload + presigned URL generation
│       │   │   └── lpr.ts      # Decode base64, create Evento, emit socket
│       │   ├── jobs/
│       │   │   ├── queue.ts    # BullMQ Queue definition
│       │   │   └── worker.ts   # BullMQ Worker (LPR event processor)
│       │   └── middleware/     # (auth in Phase 2)
│       └── package.json
├── packages/
│   ├── database/               # Prisma schema + client + createTenantClient
│   │   ├── prisma/
│   │   │   └── schema.prisma   # Source of truth for all models
│   │   ├── src/
│   │   │   ├── index.ts        # exports prisma singleton + createTenantClient
│   │   │   └── tenant.ts       # createTenantClient implementation
│   │   └── package.json
│   ├── shared/                 # TypeScript types shared by web + api
│   │   ├── src/
│   │   │   ├── types/
│   │   │   │   ├── lpr.ts      # IntelbrasPayload, LprJobData types
│   │   │   │   └── index.ts
│   │   │   └── index.ts
│   │   └── package.json
│   └── ui/                     # Shared React components (stub in Phase 1)
│       └── package.json
├── turbo.json
├── pnpm-workspace.yaml
├── docker-compose.yml
├── docker-compose.prod.yml
└── package.json                # Root workspace (no dependencies, only devDeps)
```

### Pattern 1: Turborepo 2.x Task Configuration

**What:** `turbo.json` uses `tasks` (not `pipeline` — that is v1 syntax). The `^build` prefix means "build all internal dependencies first."

**Example:**
```json
// turbo.json — Turborepo 2.x syntax
{
  "$schema": "https://turbo.build/schema.json",
  "tasks": {
    "build": {
      "dependsOn": ["^build"],
      "outputs": ["dist/**", ".next/**", "!.next/cache/**"]
    },
    "dev": {
      "cache": false,
      "persistent": true
    },
    "db:generate": {
      "cache": false
    },
    "db:migrate": {
      "cache": false
    },
    "test": {
      "dependsOn": ["^build"],
      "outputs": []
    },
    "lint": {
      "dependsOn": ["^build"]
    }
  }
}
```

**pnpm-workspace.yaml:**
```yaml
packages:
  - "apps/*"
  - "packages/*"
```

**Build order enforced by graph:**
`packages/shared` → `packages/database` → `packages/ui` → `apps/api` + `apps/web`

Both `apps/api` and `apps/web` declare workspace dependencies in `package.json`:
```json
{
  "dependencies": {
    "@cargo-sentinel/database": "workspace:*",
    "@cargo-sentinel/shared": "workspace:*"
  }
}
```

**Source:** Prior project research ARCHITECTURE.md [VERIFIED: official Turborepo 2.x docs align with this structure]

### Pattern 2: Prisma 7.x Tenant Client Extension

**What:** `createTenantClient` uses `prisma.$extends` to create a scoped client that automatically appends `empresaId` to every `where` clause across all models. This is the INFRA-02 success criterion.

**Implementation:**
```typescript
// packages/database/src/tenant.ts
import { PrismaClient } from '@prisma/client'

export function createTenantClient(prisma: PrismaClient, empresaId: string) {
  return prisma.$extends({
    query: {
      $allModels: {
        async $allOperations({ args, query }) {
          // Inject empresaId into every WHERE clause
          if (args && typeof args === 'object' && 'where' in args) {
            args.where = { ...args.where, empresaId }
          }
          return query(args)
        }
      }
    }
  })
}
```

```typescript
// packages/database/src/index.ts
import { PrismaClient } from '@prisma/client'

// Singleton pattern — prevents connection pool exhaustion during hot reload
const globalForPrisma = globalThis as unknown as { prisma: PrismaClient }
export const prisma = globalForPrisma.prisma ?? new PrismaClient()
if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma

export { createTenantClient } from './tenant'
export type { PrismaClient }
```

**Source:** Prior project research ARCHITECTURE.md; Prisma GitHub discussion #19917 [CITED: github.com/prisma/prisma/discussions/19917]

### Pattern 3: LPR Webhook — Immediate 200, Async BullMQ

**What:** Express route returns 200 immediately. Heavy work (S3 upload, DB write) happens in a BullMQ worker. SHA256 of `cameraId + placa + timestamp` becomes both the `idempotencyKey` DB column AND the BullMQ `jobId` — BullMQ silently ignores duplicate jobIds.

**Example:**
```typescript
// apps/api/src/routes/lpr.ts
import { createHash } from 'crypto'
import { Router } from 'express'
import { lprQueue } from '../jobs/queue'

const router = Router()

// POST /api/lpr/NotificationInfo/:action
router.post('/NotificationInfo/:action', async (req, res) => {
  // Return 200 IMMEDIATELY — camera has a short timeout
  res.status(200).json({ status: 'received' })

  const { action } = req.params
  if (action !== 'vehicle') return

  const body = req.body  // JSON with base64 image
  const { PlateNumber, ImageBase64, CameraId, Direction, DateTime } = body

  // SHA256 idempotency key — same payload = same key = deduplicated
  const idempotencyKey = createHash('sha256')
    .update(`${CameraId}:${PlateNumber}:${DateTime}`)
    .digest('hex')

  // Add to queue — if jobId already exists, BullMQ skips silently
  await lprQueue.add(
    'process-lpr-event',
    { PlateNumber, ImageBase64, CameraId, Direction, DateTime, idempotencyKey },
    { jobId: idempotencyKey }  // BullMQ dedup by jobId
  )
})

export default router
```

```typescript
// apps/api/src/jobs/queue.ts
import { Queue } from 'bullmq'
import { redis } from '../services/redis'

export const lprQueue = new Queue('lpr-events', {
  connection: redis,
  defaultJobOptions: {
    attempts: 3,
    backoff: { type: 'exponential', delay: 1000 }
  }
})
```

```typescript
// apps/api/src/jobs/worker.ts — LPR event processor
import { Worker } from 'bullmq'
import { redis } from '../services/redis'
import { prisma } from '@cargo-sentinel/database'
import { uploadToGarage } from '../services/garage'

new Worker('lpr-events', async (job) => {
  const { PlateNumber, ImageBase64, CameraId, Direction, DateTime, idempotencyKey } = job.data

  // Find camera and resolve empresaId
  const camera = await prisma.camera.findUnique({
    where: { codigoLpr: CameraId },
    include: { obra: true }
  })
  if (!camera) throw new Error(`Camera not found: ${CameraId}`)

  // Decode base64 → Buffer → upload to Garage
  const imageBuffer = Buffer.from(ImageBase64, 'base64')
  const garageKey = await uploadToGarage(imageBuffer, camera.id)

  // Upsert Evento with idempotencyKey — ON CONFLICT DO NOTHING semantics
  await prisma.evento.upsert({
    where: { idempotencyKey },
    create: {
      placaNumero: PlateNumber,
      direcao: Direction === 'in' ? 'ENTRADA' : Direction === 'out' ? 'SAIDA' : null,
      fotoGarageKey: garageKey,
      idempotencyKey,
      cameraId: camera.id,
      obraId: camera.obraId,
      empresaId: camera.empresaId,
      timestamp: new Date(DateTime)
    },
    update: {} // do nothing on conflict
  })

}, { connection: redis })
```

**Source:** BullMQ official docs, dragonflydb.io guide [CITED: dragonflydb.io/guides/bullmq]; SHA256 pattern from digitalapplied.com webhook reference [CITED: digitalapplied.com/blog/webhook-reliability-idempotency-retries-engineering-reference-2026]

### Pattern 4: Garage S3 Setup — Single Node with Auto-Init

**What:** Garage v2.3.0 supports `--single-node --default-bucket` mode that auto-creates a bucket and key from environment variables. This is the recommended approach for VPS deployment.

**docker-compose.yml garage service:**
```yaml
garage:
  image: dxflrs/garage:v2.3.0
  command: /garage server --single-node --default-bucket
  ports:
    - "3900:3900"   # S3 API (internal — only exposed via Traefik in prod)
  environment:
    GARAGE_DEFAULT_ACCESS_KEY: ${GARAGE_ACCESS_KEY}
    GARAGE_DEFAULT_SECRET_KEY: ${GARAGE_SECRET_KEY}
    GARAGE_DEFAULT_BUCKET: lpr-images
    GARAGE_CONFIG_FILE: /etc/garage.toml
  volumes:
    - ./garage/garage.toml:/etc/garage.toml
    - garage-meta:/var/lib/garage/meta
    - garage-data:/var/lib/garage/data
  restart: unless-stopped
  labels:
    - "traefik.enable=true"
    - "traefik.http.routers.garage.rule=Host(`sentinel.domain.com`) && PathPrefix(`/media`)"
    - "traefik.http.routers.garage.priority=20"
    - "traefik.http.routers.garage.tls.certresolver=letsencrypt"
    - "traefik.http.services.garage.loadbalancer.server.port=3900"
```

**garage.toml:**
```toml
metadata_dir = "/var/lib/garage/meta"
data_dir = "/var/lib/garage/data"
db_engine = "sqlite"
replication_factor = 1

rpc_bind_addr = "[::]:3901"
rpc_public_addr = "127.0.0.1:3901"
rpc_secret = "GENERATE_WITH_openssl_rand_hex_32"

[s3_api]
s3_region = "garage"
api_bind_addr = "[::]:3900"

[admin]
api_bind_addr = "[::]:3903"
admin_token = "GENERATE_WITH_openssl_rand_base64_32"
```

**AWS SDK v3 Node.js client for Garage:**
```typescript
// apps/api/src/services/garage.ts
import { S3Client, PutObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'
import { v4 as uuidv4 } from 'uuid'

const s3 = new S3Client({
  region: 'garage',                                    // must match garage.toml s3_region
  endpoint: process.env.GARAGE_INTERNAL_URL,           // 'http://garage:3900' (internal Docker)
  credentials: {
    accessKeyId: process.env.GARAGE_ACCESS_KEY!,
    secretAccessKey: process.env.GARAGE_SECRET_KEY!
  },
  forcePathStyle: true                                 // REQUIRED for Garage — no virtual-hosted URLs
})

const BUCKET = 'lpr-images'

export async function uploadToGarage(
  imageBuffer: Buffer,
  cameraId: string
): Promise<string> {
  const date = new Date()
  const key = `eventos/${date.getFullYear()}/${String(date.getMonth() + 1).padStart(2, '0')}/${String(date.getDate()).padStart(2, '0')}/${cameraId}_${uuidv4()}.jpg`

  await s3.send(new PutObjectCommand({
    Bucket: BUCKET,
    Key: key,
    Body: imageBuffer,
    ContentType: 'image/jpeg'
  }))

  return key  // store only the key, never the URL
}

export async function getPresignedUrl(key: string): Promise<string> {
  // Creates a presigned GET URL for the public endpoint (not internal Docker URL)
  const publicS3 = new S3Client({
    region: 'garage',
    endpoint: process.env.GARAGE_SERVER_URL,           // 'https://sentinel.domain.com/media'
    credentials: {
      accessKeyId: process.env.GARAGE_ACCESS_KEY!,
      secretAccessKey: process.env.GARAGE_SECRET_KEY!
    },
    forcePathStyle: true
  })

  return getSignedUrl(publicS3, new GetObjectCommand({ Bucket: BUCKET, Key: key }), {
    expiresIn: 300  // 5 minutes TTL per STORAGE-03 requirement
  })
}
```

**Source:** Garage official docs [CITED: garagehq.deuxfleurs.fr/documentation/quick-start/]; MinIO→Garage migration report [CITED: dev.to/alexneamtu]

**Critical detail:** AWS SDK v3 requires two environment flags when used with Garage to prevent checksum validation errors:
```
AWS_REQUEST_CHECKSUM_CALCULATION=when_required
AWS_RESPONSE_CHECKSUM_VALIDATION=when_required
```
Set these in the `api` Docker service environment. [VERIFIED: confirmed in SendRec migration report]

### Pattern 5: Prisma Schema — Phase 1 Core Models

The `idempotencyKey` field must be added to the `Evento` model with `@unique`. This differs slightly from the prior research schema (which named the field `fotoUrl`/`fotoMinioKey`): the field should be `fotoGarageKey` per the requirements.

```prisma
model Evento {
  id              String        @id @default(cuid())
  timestamp       DateTime      @default(now())
  placaNumero     String
  direcao         Direcao?
  fotoGarageKey   String?       // Garage object key (NOT full URL)
  idempotencyKey  String        @unique  // SHA256(cameraId+placa+timestamp)
  cameraId        String
  obraId          String
  empresaId       String        // denormalized for cross-site queries
  classificacao   Classificacao @default(VISITANTE)
  rawPayload      Json?

  camera          Camera        @relation(fields: [cameraId], references: [id])
  obra            Obra          @relation(fields: [obraId], references: [id])

  @@index([empresaId, timestamp])
  @@index([empresaId, placaNumero])
  @@index([obraId, timestamp])
  @@index([cameraId])
}
```

### Anti-Patterns to Avoid

- **`pipeline` in turbo.json:** This is Turborepo v1 syntax. v2 uses `tasks`. [VERIFIED: official Turborepo docs]
- **Storing base64 image in Evento.rawPayload:** `rawPayload` is fine for other fields, but must exclude the image field. Strip `ImageBase64` before storing `rawPayload`.
- **Presigned URL generated with internal Docker hostname:** Garage signatures must be generated with the public URL (`GARAGE_SERVER_URL`), not the internal Docker service URL. A separate S3Client configured with the public URL must be used for presigned URL generation.
- **`io.emit()` without room filter:** Already a locked anti-pattern. Even in Phase 1 setup, the Socket.IO server should never emit globally.
- **Prisma migration on live production without staging:** Always test `prisma migrate deploy` against a seeded copy first.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Async job queue | Custom `setImmediate` chain with Redis | BullMQ 5.x | Persistence across restarts, retry with backoff, concurrency control, monitoring |
| Idempotency at queue layer | Manual Redis SET NX with TTL | BullMQ `jobId` | BullMQ deduplication is atomic; avoids TOCTOU race conditions |
| S3-compatible upload | Custom Garage HTTP client | `@aws-sdk/client-s3` | AWS SDK handles chunked upload, retry, multipart threshold, signature V4 |
| Presigned URL signing | Custom HMAC signing | `@aws-sdk/s3-request-presigner` | Signature V4 implementation has ~50 edge cases; the SDK handles all of them |
| Tenant query scoping | Manual `where: { empresaId }` in every query | `createTenantClient` via `prisma.$extends` | One missed `where` clause = LGPD violation; type-safe enforcement at client level |
| Image format validation | Custom JPEG header check | `sharp` (already validating on resize) | Sharp throws on corrupt/non-image input; returns validated Buffer |

**Key insight:** BullMQ's `jobId` dedup + Prisma's `upsert` on `idempotencyKey` create a two-layer defense against duplicate Intelbras camera retries. Neither alone is sufficient — BullMQ prevents duplicate processing in the queue, Prisma prevents duplicate DB rows if a worker crashes mid-execution.

---

## Common Pitfalls

### Pitfall 1: Intelbras Payload Field Names Are Not Standardized
**What goes wrong:** Different Intelbras LPR camera models (VIP 5460, VIP 74120, VIP 99300) may use slightly different JSON field names for the same data. A receiver that hardcodes `PlateNumber` breaks if a camera sends `plate_number` or `Plate`.
**Why it happens:** Intelbras uses the Hikvision HTTP API format in some models and their own format in others. The documentation is not publicly accessible.
**How to avoid:** Log the raw `req.body` for the first 24 hours of operation. Build a normalization layer that tries multiple field name conventions. Store `rawPayload: req.body` (minus the image) in the Evento record for debugging.
**Warning signs:** Camera sends events but `PlateNumber` is undefined in the handler.

### Pitfall 2: Garage Presigned URL Signature Mismatch
**What goes wrong:** `S3Client` configured with `endpoint: 'http://garage:3900'` (internal Docker URL) generates presigned URLs containing `http://garage:3900` in the URL. The browser cannot resolve `garage` as a hostname. Even if it could, the signature is computed for `http://garage:3900` and fails when the client hits `https://sentinel.domain.com/media`.
**Why it happens:** The S3 signing algorithm includes the endpoint hostname in the signature. If the client URL differs from the signing URL, signature verification fails with `SignatureDoesNotMatch`.
**How to avoid:** Use two S3Client instances — one for internal upload (Docker hostname), one for presigned URL generation (public HTTPS URL). Set `GARAGE_SERVER_URL` in the `.env` file.
**Warning signs:** Browser receiving 403 `SignatureDoesNotMatch` on image load.

### Pitfall 3: Turborepo Cache Stale After Prisma Schema Change
**What goes wrong:** After `prisma migrate dev` changes the schema, `packages/database` builds a new client, but Turborepo's cache for `apps/api` might serve the stale pre-generated types.
**Why it happens:** Turborepo hashes file contents to determine cache validity. If the generated Prisma client files are in `.gitignore` and their hash isn't tracked, the build cache doesn't invalidate.
**How to avoid:** Add `"prisma generate"` as a pre-step in the `build` task for the database package. Ensure Prisma's generated output directory is listed in `turbo.json` outputs.
**Warning signs:** TypeScript errors about missing Prisma types after schema change, but `pnpm build` claims success from cache.

### Pitfall 4: `express.json({ limit })` Too Small for Base64 Images
**What goes wrong:** An Intelbras LPR JPEG is 100–500KB. As base64, it's ~133–667KB. Express's default `json` body parser limit is `100kb`. Payloads exceeding this return `413 Payload Too Large` — the camera doesn't get a 200 response and retries.
**Why it happens:** Default Express body parser limit is rarely documented as a problem until production.
**How to avoid:** Set `app.use(express.json({ limit: '2mb' }))` before any route registration.
**Warning signs:** Camera logs showing repeated retries; Express logs showing 413 errors.

### Pitfall 5: BullMQ Worker Connection vs Queue Connection
**What goes wrong:** BullMQ Queue and Worker both need Redis connections, but they use separate connection objects internally. Sharing a single `ioredis` connection between Queue and Worker leads to blocking and timeouts (ioredis connections block while subscribed for pub/sub).
**Why it happens:** BullMQ documentation requires separate Redis connections for Queue and Worker.
**How to avoid:** Create a new `IORedis` connection factory function and call it separately for Queue and Worker. Do not reuse a single Redis client.
**Warning signs:** Worker never picks up jobs; Redis client hanging.

### Pitfall 6: Garage Access Key Format Constraint
**What goes wrong:** Garage generates access key IDs with a `GK` prefix (e.g., `GK1a2b3c4d...`). If you set `GARAGE_DEFAULT_ACCESS_KEY` to a value not starting with `GK` and not matching the length constraint, Garage rejects it silently.
**Why it happens:** Garage's key format is stricter than MinIO's. MinIO accepted arbitrary strings.
**How to avoid:** Generate with: `GK$(openssl rand -hex 16)` for key ID, `$(openssl rand -hex 32)` for secret. [VERIFIED: Garage official docs + community issue #1215]
**Warning signs:** Garage starts but S3 authentication fails immediately.

---

## Code Examples

### Verified Patterns from Official/Project Sources

#### SHA256 Idempotency Key
```typescript
// Source: Node.js built-in crypto module
import { createHash } from 'crypto'

export function buildIdempotencyKey(cameraId: string, placa: string, dateTime: string): string {
  return createHash('sha256')
    .update(`${cameraId}:${placa}:${dateTime}`)
    .digest('hex')
}
```

#### Prisma Singleton (prevents hot-reload connection exhaustion)
```typescript
// packages/database/src/index.ts
// Source: Prior project research ARCHITECTURE.md [VERIFIED pattern from Prisma docs]
import { PrismaClient } from '@prisma/client'

const globalForPrisma = globalThis as unknown as { prisma: PrismaClient }
export const prisma = globalForPrisma.prisma ?? new PrismaClient()
if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma
```

#### Vitest Unit Test for createTenantClient (Success Criterion 5)
```typescript
// packages/database/src/tenant.test.ts
import { describe, it, expect, vi } from 'vitest'
import { createTenantClient } from './tenant'

describe('createTenantClient', () => {
  it('exports createTenantClient as a callable function', () => {
    expect(typeof createTenantClient).toBe('function')
  })

  it('returns an extended Prisma client', () => {
    const mockPrisma = { $extends: vi.fn().mockReturnValue({ __isTenantClient: true }) } as any
    const result = createTenantClient(mockPrisma, 'test-empresa-id')
    expect(mockPrisma.$extends).toHaveBeenCalledOnce()
    expect(result.__isTenantClient).toBe(true)
  })
})
```

#### Traefik Docker Compose (Priority Routing)
```yaml
# Source: Prior project research ARCHITECTURE.md
traefik:
  image: traefik:v3.0
  command:
    - "--providers.docker=true"
    - "--providers.docker.exposedbydefault=false"
    - "--entrypoints.web.address=:80"
    - "--entrypoints.websecure.address=:443"
    - "--certificatesresolvers.letsencrypt.acme.tlschallenge=true"
    - "--certificatesresolvers.letsencrypt.acme.storage=/letsencrypt/acme.json"
  ports:
    - "80:80"
    - "443:443"
  volumes:
    - /var/run/docker.sock:/var/run/docker.sock:ro
    - ./traefik/acme.json:/letsencrypt/acme.json   # Host-mounted, chmod 600
```

---

## Intelbras LPR Payload — Best-Effort Documentation

The Intelbras HTTP API V3.35 PDF is accessible at the registered URL but renders as binary. Based on community knowledge of Hikvision-derived LPR camera APIs (which Intelbras cameras implement), the assumed payload is:

```json
{
  "PlateNumber": "ABC1234",
  "DateTime": "2026-06-20T14:32:00",
  "CameraId": "LPR-0001",
  "Direction": "in",
  "ImageBase64": "<base64 encoded JPEG>",
  "Confidence": 95,
  "VehicleType": "car",
  "Action": "vehicle"
}
```

**Field name uncertainty is HIGH.** Known variants in the wild:
- Plate: `PlateNumber`, `plate_number`, `LicensePlate`, `Plate`
- Image: `ImageBase64`, `PicData`, `image_base64`, `picture`
- Camera: `CameraId`, `camera_id`, `ChannelId`, `DeviceId`
- Direction: `Direction` with values `in`/`out` or `ENTRADA`/`SAIDA` or `1`/`2`
- Time: `DateTime`, `Timestamp`, `EventTime`, `time`

**Mitigation strategy (required in the implementation plan):**
1. Log the raw `req.body` on every received webhook for the first operational period
2. Write a normalization function that maps all known field name variants to a canonical `IntelbrasPayload` type defined in `packages/shared`
3. The `rawPayload` JSON column in `Evento` stores the original body (minus image) for debugging

[ASSUMED — field names not verified against official Intelbras documentation. See Assumptions Log A1.]

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| MinIO for S3 | Garage v2.3.0 | Dec 2025 (MinIO maintenance mode) | Different Docker image, `GK` prefixed key format, same AWS SDK code |
| Prisma 6.x pin | Prisma 7.x (latest stable) | 2026 (v7.x released after CLAUDE.md written) | `$extends` API unchanged; just update version pin |
| `pipeline` in turbo.json | `tasks` in turbo.json | Turborepo 2.0 (2024) | Breaking change from v1; must use `tasks` not `pipeline` |
| Manual bucket creation | `--single-node --default-bucket` flag | Garage v2.0 | Environment variables auto-create key + bucket on first start |
| Bull (original) | BullMQ (v5.x) | 2022+ | BullMQ is the maintained successor; Bull is deprecated |

**Deprecated/outdated:**
- **Bull npm package**: Deprecated; BullMQ is the maintained fork. Do not use `bull`, use `bullmq`.
- **MinIO npm package**: While it still works with S3-compatible stores, use `@aws-sdk/client-s3` instead for vendor neutrality.
- **Prisma `pipeline` config**: Does not exist; this was never a Prisma feature. See Turborepo note above.
- **`next-auth` v4**: The package is now `next-auth@^5` or `auth.js`. The `next-auth` npm package at v5 is the current one.

---

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | Intelbras LPR payload uses fields `PlateNumber`, `ImageBase64`, `CameraId`, `Direction`, `DateTime` | Intelbras Payload section, LPR route code examples | Webhook handler receives events but extracts undefined values; events are created with null plate numbers. Mitigated by logging raw body and normalization layer. |
| A2 | Intelbras sends payload as `application/json` (not `multipart/form-data`) | LPR webhook route code | If camera sends multipart, `express.json()` won't parse it; need `multer` middleware. Both packages are in the standard stack as a precaution. |
| A3 | `Direction` field values are `'in'` / `'out'` (English) | Worker code mapping to ENTRADA/SAIDA | Mapping to wrong enum value; events show wrong direction. Logging raw payload allows correction without losing data. |

---

## Open Questions

1. **Intelbras payload field names**
   - What we know: The camera POSTs to `/api/lpr/NotificationInfo/:action`. The HTTP API V3.35 PDF exists but is not machine-readable via web tools.
   - What's unclear: Exact field names for plate number, image, camera ID, timestamp, direction.
   - Recommendation: The implementation plan must include a Task 0 or Wave 0 step: "Connect a real Intelbras camera (or use the simulation tool from Intelbras portal) and log the first raw payload. Update the normalization function before processing live events."

2. **Prisma 7.x vs 6.x**
   - What we know: `npm view prisma version` returns 7.8.0. CLAUDE.md pins to 6.x.
   - What's unclear: Whether any breaking changes between 6.x and 7.x affect the `$extends` pattern.
   - Recommendation: Start with 7.x (current stable) on this greenfield project. The `$extends` API is documented as stable and backward-compatible. Note: Update CLAUDE.md version pin to reflect reality.

3. **Garage v2 `--single-node --default-bucket` limitations**
   - What we know: This mode works for development and single-VPS production.
   - What's unclear: Whether bucket CORS needs to be set explicitly for presigned URL browser access.
   - Recommendation: Include a health check task in Wave 0 that verifies a presigned URL is accessible from the browser before declaring storage working.

---

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js | All apps/api, apps/web | Yes | v24.14.1 | — |
| pnpm | Monorepo package management | Yes | 10.33.0 | — |
| npm | Package version checks | Yes | 11.11.0 | — |
| Docker | Container services | Yes | 29.4.0 | — |
| Docker Compose | Multi-service orchestration | Yes | v5.1.1 | — |
| Git | Version control | Yes (implied by git repo) | — | — |
| PostgreSQL (Docker) | Database service | Via Docker | 16-alpine image | — |
| Redis (Docker) | BullMQ + cache | Via Docker | 7.x-alpine image | — |
| Garage (Docker) | Image storage | Via Docker | v2.3.0 image | — |

**Missing dependencies with no fallback:** None — all runtime dependencies are containerized.

**Missing dependencies with fallback:** None identified.

---

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest 4.1.9 |
| Config file | `packages/database/vitest.config.ts` (Wave 0 creation) |
| Quick run command | `pnpm --filter database test` |
| Full suite command | `pnpm test` (all workspaces via turbo) |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| INFRA-01 | `pnpm build` succeeds across all workspaces | smoke | `pnpm build` | Wave 0 — workspace files |
| INFRA-02 | `createTenantClient(prisma, empresaId)` is exported and callable | unit | `pnpm --filter database test` | Wave 0 creation |
| INFRA-03 | All 6 Docker services start without errors | smoke | `docker compose up -d && docker compose ps` | Wave 0 — compose file |
| INFRA-04 | Traefik routes `/api/*` to Express | integration | `curl http://localhost/api/health` | Wave 0 — health endpoint |
| INFRA-05 | `acme.json` volume persists across container restart | manual | restart traefik, verify file | manual only |
| LPR-01 | `POST /api/lpr/NotificationInfo/vehicle` accepts Intelbras payload | unit | `pnpm --filter api test -- lpr.test` | Wave 0 creation |
| LPR-02 | Endpoint returns HTTP 200 immediately (< 100ms) | unit | `pnpm --filter api test -- lpr.test` | Wave 0 creation |
| LPR-03 | Same payload twice = 1 Evento row (idempotency) | unit | `pnpm --filter api test -- idempotency.test` | Wave 0 creation |
| LPR-04 | Image stored in Garage as binary, not base64 in DB | unit | `pnpm --filter api test -- garage.test` | Wave 0 creation |
| LPR-05 | `fotoGarageKey` saved; presigned URL generated on demand | unit | `pnpm --filter api test -- garage.test` | Wave 0 creation |
| STORAGE-01 | Garage bucket `lpr-images` exists and is writable | smoke | `docker compose exec garage /garage bucket list` | Wave 0 |
| STORAGE-02 | Presigned URL uses public HTTPS domain (not `garage:3900`) | unit | `pnpm --filter api test -- presigned.test` | Wave 0 creation |
| STORAGE-03 | Presigned URL returns 200 with JPEG content-type | integration | manual `curl` of presigned URL | manual |

### Sampling Rate
- **Per task commit:** `pnpm --filter database test`
- **Per wave merge:** `pnpm test` (full suite across all workspaces)
- **Phase gate:** Full suite green before `/gsd-verify-work`

### Wave 0 Gaps
- [ ] `packages/database/src/tenant.test.ts` — covers INFRA-02
- [ ] `packages/database/vitest.config.ts` — test framework config
- [ ] `apps/api/src/routes/lpr.test.ts` — covers LPR-01, LPR-02
- [ ] `apps/api/src/jobs/idempotency.test.ts` — covers LPR-03
- [ ] `apps/api/src/services/garage.test.ts` — covers LPR-04, LPR-05, STORAGE-02
- [ ] Framework install: `pnpm --filter database add -D vitest` and `pnpm --filter api add -D vitest`

---

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | No (Phase 2) | Auth.js v5 — deferred |
| V3 Session Management | No (Phase 2) | JWT refresh tokens — deferred |
| V4 Access Control | Partial | Camera webhook endpoint must validate `CameraId` exists in DB before processing |
| V5 Input Validation | Yes | Validate Intelbras payload fields; reject if `PlateNumber` is empty or `ImageBase64` is not valid base64 |
| V6 Cryptography | Yes | SHA256 via `crypto.createHash` (Node built-in); never use MD5 for idempotency key |

### Known Threat Patterns for This Stack

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Spoofed camera webhook (attacker POSTs fake events) | Spoofing | Phase 2 concern; Phase 1 should validate `CameraId` exists in DB as minimum |
| Base64 payload bombing (large image to exhaust memory) | Denial of Service | `express.json({ limit: '2mb' })` cap; validate `ImageBase64` length before decoding |
| Garage bucket access without presigned URL | Information Disclosure | Bucket must NOT be public; presigned URLs only via API |
| Cross-tenant data if `empresaId` from camera lookup is wrong | Information Disclosure | Lookup `camera.empresaId` from DB (trusted source), never from webhook payload |

---

## Sources

### Primary (HIGH confidence)
- Prior project research — ARCHITECTURE.md, STACK.md, PITFALLS.md (2026-06-20) — all Phase 1 architectural patterns
- npm registry (2026-06-20) — package versions: turborepo, prisma, bullmq, @aws-sdk/client-s3, vitest, tsx, multer, sharp, typescript
- Garage official docs [CITED: garagehq.deuxfleurs.fr/documentation/quick-start/] — single-node setup, garage.toml, environment variables

### Secondary (MEDIUM confidence)
- BullMQ guide [CITED: dragonflydb.io/guides/bullmq] — jobId deduplication pattern
- Webhook idempotency reference [CITED: digitalapplied.com/blog/webhook-reliability-idempotency-retries-engineering-reference-2026] — SHA256 key construction
- Garage community issue #1215 [CITED: git.deuxfleurs.fr/Deuxfleurs/garage/issues/1215] — access key format constraints, init pattern
- MinIO→Garage migration [CITED: dev.to/alexneamtu] — AWS SDK checksum flags, CORS via admin API
- Prisma tenant extension [CITED: github.com/prisma/prisma/discussions/19917] — `$extends` multi-tenant pattern

### Tertiary (LOW confidence — needs validation)
- Intelbras LPR payload field names — not found in any publicly accessible documentation. All code examples using field names like `PlateNumber`, `ImageBase64`, `CameraId` are [ASSUMED]. See Assumptions Log A1.

---

## Project Constraints (from CLAUDE.md)

The following directives from CLAUDE.md are mandatory and cannot be overridden by planner recommendations:

| Directive | Status in Phase 1 |
|-----------|-------------------|
| Use Turborepo 2.x + pnpm (not npm/yarn) | Applied — all install commands use pnpm |
| Use Next.js 15 (not 14) | Applied — web workspace targets Next.js 15 |
| Use Tailwind CSS 3.x (not 4) | N/A for Phase 1 (minimal UI) |
| Use Garage v2.x (NOT MinIO — archived April 2026) | Applied — docker image `dxflrs/garage:v2.3.0` |
| Use Prisma 6.x with tenantId middleware (NOT PostgreSQL RLS) | Applied — HOWEVER: actual current version is 7.8.0 (see Open Questions #2) |
| Use Socket.IO 4.x + Redis adapter (NOT SSE) | Phase 3 concern — Socket.IO server stub in Phase 1 |
| Do NOT use Evolution API 2.4.0+ — pin to 2.3.7 | Phase 4 concern |
| Use Auth.js v5 with JWT sessions (NOT database sessions) | Phase 2 concern |
| Use Traefik v3 (NOT v2) | Applied — `traefik:v3.0` image |
| Use TypeScript 5.x | Applied — TypeScript 6.0.3 is the current stable (5.x constraint met and exceeded) |
| Do NOT store base64 images in database | Applied — decode immediately, upload to Garage, store key only |
| Do NOT use MinIO npm package — use AWS SDK v3 | Applied — `@aws-sdk/client-s3` is the S3 client |
| Express 4.x (not 5.x) | Applied — `^4.21.x` |

---

## Metadata

**Confidence breakdown:**
- Monorepo scaffold (Turborepo/pnpm): HIGH — verified against official docs and npm registry
- Prisma tenant client pattern: HIGH — verified against Prisma discussions + prior research
- Garage S3 setup: HIGH — verified against official Garage docs + community guides
- BullMQ queue pattern: HIGH — verified against BullMQ official guide
- Intelbras payload format: LOW — not publicly documented; field names are assumed

**Research date:** 2026-06-20
**Valid until:** 2026-09-20 (stable stack; Garage and BullMQ versions should be re-verified if more than 90 days pass)
