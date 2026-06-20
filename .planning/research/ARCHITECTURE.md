# Architecture Research — Cargo Sentinel

**Researched:** 2026-06-20
**Confidence:** HIGH (Turborepo/Prisma/Socket.IO/Traefik all verified against official sources)

---

## Monorepo Structure (recommended)

Turborepo 2.x uses `tasks` (not `pipeline`) in `turbo.json`. The `^build` prefix means "run build in all internal dependencies first." Build order is derived from the dependency graph, not from declaration order.

```
cargo-sentinel/
├── apps/
│   ├── web/                    # Next.js 14 — dashboard, admin, login
│   │   ├── src/
│   │   │   ├── app/            # App Router pages
│   │   │   ├── components/     # Page-level components (import from packages/ui)
│   │   │   └── lib/            # NextAuth config, API client, socket client
│   │   └── package.json
│   └── api/                    # Express + Socket.IO — LPR receiver, REST, WS
│       ├── src/
│       │   ├── routes/         # Express routers
│       │   ├── socket/         # Socket.IO setup (co-located with Express)
│       │   ├── services/       # Business logic: LPR ingestion, classification, alerts
│       │   ├── middleware/     # JWT auth, tenant scope, error handling
│       │   └── jobs/           # WhatsApp alert queue (Bull or simple queue)
│       └── package.json
├── packages/
│   ├── database/               # Prisma schema + generated client
│   │   ├── prisma/
│   │   │   └── schema.prisma
│   │   ├── src/
│   │   │   └── index.ts        # Re-exports PrismaClient singleton
│   │   └── package.json
│   ├── shared/                 # TypeScript types shared between web and api
│   │   ├── src/
│   │   │   ├── types/          # LprEvent, Plate, Classification, Role, etc.
│   │   │   └── constants/      # Classification levels, event types
│   │   └── package.json
│   └── ui/                     # Shared React components (opencheck style)
│       ├── src/
│       │   ├── components/     # Badge, Card, DataTable, AlertBanner, etc.
│       │   └── index.ts
│       └── package.json
├── turbo.json
├── docker-compose.yml
├── docker-compose.prod.yml
└── package.json
```

### turbo.json (correct 2.x syntax)

```json
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
    "lint": {
      "dependsOn": ["^build"]
    },
    "type-check": {
      "dependsOn": ["^build"]
    }
  }
}
```

**Build order enforced by graph:** `packages/shared` → `packages/database` → `packages/ui` → `apps/api` + `apps/web`

Both `apps/api` and `apps/web` declare `packages/database` and `packages/shared` as workspace dependencies in their `package.json`. Turborepo resolves the order automatically.

---

## Data Model (key entities and relationships)

### Core Entities

```prisma
// packages/database/prisma/schema.prisma

model Empresa {
  id        String   @id @default(cuid())
  nome      String
  cnpj      String?  @unique
  plano     Plano    @default(BASIC)
  ativo     Boolean  @default(true)
  createdAt DateTime @default(now())

  obras     Obra[]
  usuarios  Usuario[]
  placas    Placa[]   // vehicle registry is tenant-scoped
}

model Obra {
  id        String   @id @default(cuid())
  nome      String
  endereco  String?
  ativa     Boolean  @default(true)
  empresaId String
  createdAt DateTime @default(now())

  empresa   Empresa  @relation(fields: [empresaId], references: [id])
  cameras   Camera[]
  eventos   Evento[]

  @@index([empresaId])
}

model Camera {
  id        String   @id @default(cuid())
  codigoLpr String   @unique  // "LPR-0001" — must match Intelbras config
  nome      String?
  obraId    String
  empresaId String   // denormalized for fast tenant filtering
  ativa     Boolean  @default(true)
  createdAt DateTime @default(now())

  obra      Obra     @relation(fields: [obraId], references: [id])
  eventos   Evento[]

  @@index([obraId])
  @@index([empresaId])
  @@index([codigoLpr])
}

model Placa {
  id             String           @id @default(cuid())
  numero         String           // "ABC-1234"
  empresaId      String
  classificacao  Classificacao    @default(LIBERADO)
  observacao     String?
  updatedAt      DateTime         @updatedAt
  updatedBy      String?

  empresa        Empresa          @relation(fields: [empresaId], references: [id])
  eventos        Evento[]

  @@unique([numero, empresaId])   // same plate, different tenant = different record
  @@index([empresaId])
  @@index([numero])
}

model Evento {
  id            String        @id @default(cuid())
  timestamp     DateTime      @default(now())
  placaNumero   String
  direcao       Direcao?      // ENTRADA | SAIDA | null
  fotoUrl       String?       // MinIO object key (not full URL)
  fotoMinioKey  String?       // e.g. "eventos/2026/06/20/{id}.jpg"
  cameraId      String
  obraId        String
  empresaId     String        // denormalized — critical for cross-site queries
  classificacao Classificacao @default(LIBERADO)
  alertaDisparado Boolean     @default(false)
  rawPayload    Json?         // original Intelbras JSON for debugging

  camera        Camera        @relation(fields: [cameraId], references: [id])
  obra          Obra          @relation(fields: [obraId], references: [id])
  placa         Placa?        @relation(fields: [placaNumero, empresaId], references: [numero, empresaId])

  @@index([empresaId, timestamp])
  @@index([empresaId, placaNumero])
  @@index([obraId, timestamp])
  @@index([cameraId])
}

model Usuario {
  id        String   @id @default(cuid())
  email     String   @unique
  nome      String
  senha     String   // bcrypt
  role      Role
  empresaId String?  // null = Super Admin
  ativo     Boolean  @default(true)
  createdAt DateTime @default(now())

  empresa   Empresa? @relation(fields: [empresaId], references: [id])
}

enum Classificacao {
  LIBERADO
  VISITANTE
  ATENCAO
  SUSPEITO
  CRITICO
}

enum Direcao {
  ENTRADA
  SAIDA
}

enum Role {
  SUPER_ADMIN
  ADMIN_EMPRESA
  OPERADOR
}

enum Plano {
  BASIC
  PRO
  ENTERPRISE
}
```

### Key Design Decisions

**`empresaId` is denormalized into `Camera` and `Evento`.**
This is intentional. Cross-site intelligence queries (`WHERE empresaId = ? AND placaNumero = ?`) must be fast. Joining through Obra every time is expensive and error-prone. Accept the denormalization cost.

**`Placa` is per-tenant, not global.**
`@@unique([numero, empresaId])` means the same plate number exists separately per company. Company A classifying a plate as CRITICO has zero effect on Company B's records. This is correct for the domain — classification is based on each company's intelligence.

**`fotoMinioKey` stores the object key, not the full URL.**
Never store full URLs in the database. MinIO endpoint may change; presigned URLs are ephemeral. Store the key, generate the URL at query time.

**No PostgreSQL Row-Level Security in v1.**
Application-level `WHERE empresaId = tenantId` on every query is sufficient and simpler to debug. PostgreSQL RLS adds indirection that complicates Prisma middleware and onboarding. Revisit at scale if needed. Use a Prisma middleware wrapper instead:

```typescript
// packages/database/src/tenant-client.ts
export function createTenantClient(prisma: PrismaClient, empresaId: string) {
  return prisma.$extends({
    query: {
      $allModels: {
        async $allOperations({ args, query }) {
          if ('where' in args) {
            args.where = { ...args.where, empresaId }
          }
          return query(args)
        }
      }
    }
  })
}
```

---

## Data Flow (camera → api → db → socket → frontend)

```
Intelbras LPR Camera
        │
        │  POST /api/lpr/NotificationInfo/:action
        │  Body: { PlateNumber, ImageBase64, CameraId, Direction, ... }
        ▼
apps/api — LPR Ingestion Route
        │
        ├─► 1. Validate camera exists + resolve empresaId
        │       Camera.findUnique({ where: { codigoLpr } })
        │
        ├─► 2. Upload image to MinIO
        │       key = "eventos/{YYYY}/{MM}/{DD}/{uuid}.jpg"
        │       minioClient.putObject(bucket, key, buffer)
        │
        ├─► 3. Lookup plate classification for this tenant
        │       Placa.findUnique({ where: { numero_empresaId: { numero, empresaId } } })
        │
        ├─► 4. Create Evento record (with classification snapshot)
        │       Evento.create({ placaNumero, classificacao, fotoMinioKey, ... })
        │
        ├─► 5. Emit Socket.IO event to tenant room
        │       io.to(`empresa:${empresaId}`).emit('new-event', eventoPayload)
        │
        └─► 6. If classificacao >= SUSPEITO → trigger alert
                ├─ Emit high-priority socket event
                └─ Queue WhatsApp alert via Evolution API


Socket.IO (same Express server)
        │
        │  Client connects: WS /socket.io?token=<JWT>
        │
        ├─► Middleware: verify JWT, extract empresaId
        ├─► socket.join(`empresa:${empresaId}`)
        │   (optionally also: socket.join(`obra:${obraId}`) for obra-scoped views)
        │
        └─► Emits: 'new-event', 'plate-alert', 'classification-updated'


Next.js Frontend (apps/web)
        │
        ├─► NextAuth handles login → JWT with { sub, empresaId, role }
        ├─► API calls: fetch('/api/...') → proxied to Express
        └─► Socket: socket.io-client connects, joins empresa room automatically
```

### Cross-Site Intelligence (multisite alert) Flow

```
New Evento created with placaNumero = "ABC-1234", empresaId = "empresa-X"
        │
        ▼
Query: SELECT classificacao FROM Placa
       WHERE numero = 'ABC-1234' AND empresaId = 'empresa-X'
        │
        ├─ classificacao = SUSPEITO or CRITICO?
        │         YES → emit 'plate-alert' to ALL obra rooms in empresa-X
        │               io.to(`empresa:empresa-X`).emit('plate-alert', { ... })
        │
        └─ No match (first time seen) → create Placa with LIBERADO default
```

This is the core value prop: a single `io.to(empresaRoom).emit()` call broadcasts to all operators across all sites of that company.

---

## Service Architecture (Docker Compose services)

```yaml
# docker-compose.yml (production)

services:

  traefik:
    image: traefik:v3.0
    command:
      - "--providers.docker=true"
      - "--providers.docker.exposedbydefault=false"
      - "--entrypoints.web.address=:80"
      - "--entrypoints.websecure.address=:443"
      - "--certificatesresolvers.letsencrypt.acme.email=arnaldomb@gmail.com"
      - "--certificatesresolvers.letsencrypt.acme.storage=/letsencrypt/acme.json"
      - "--certificatesresolvers.letsencrypt.acme.tlschallenge=true"
    ports: ["80:80", "443:443"]
    volumes:
      - /var/run/docker.sock:/var/run/docker.sock:ro
      - traefik-certs:/letsencrypt

  web:
    build: ./apps/web
    labels:
      - "traefik.enable=true"
      # All traffic to sentinel.domain.com goes to Next.js
      - "traefik.http.routers.web.rule=Host(`sentinel.domain.com`)"
      - "traefik.http.routers.web.priority=1"
      - "traefik.http.routers.web.tls.certresolver=letsencrypt"
      - "traefik.http.services.web.loadbalancer.server.port=3000"
    environment:
      - NEXTAUTH_URL=https://sentinel.domain.com
      - API_URL=http://api:3001  # internal Docker network
      - NEXT_PUBLIC_SOCKET_URL=https://sentinel.domain.com  # goes through Traefik → api

  api:
    build: ./apps/api
    labels:
      - "traefik.enable=true"
      # /api/* routes to Express (higher priority than web)
      - "traefik.http.routers.api.rule=Host(`sentinel.domain.com`) && PathPrefix(`/api`)"
      - "traefik.http.routers.api.priority=10"
      - "traefik.http.routers.api.tls.certresolver=letsencrypt"
      - "traefik.http.services.api.loadbalancer.server.port=3001"
      # Socket.IO also under /api path → same service
      - "traefik.http.middlewares.stickyapi.sticky.cookie.name=io"
      - "traefik.http.middlewares.stickyapi.sticky.cookie.secure=true"
    environment:
      - DATABASE_URL=postgresql://postgres:${POSTGRES_PASSWORD}@postgres:5432/sentinel
      - MINIO_ENDPOINT=minio
      - MINIO_PORT=9000
      - MINIO_PUBLIC_URL=https://sentinel.domain.com/media
      - JWT_SECRET=${JWT_SECRET}
      - EVOLUTION_API_URL=${EVOLUTION_API_URL}
    depends_on:
      - postgres
      - minio

  postgres:
    image: postgres:16-alpine
    environment:
      POSTGRES_DB: sentinel
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD}
    volumes:
      - postgres-data:/var/lib/postgresql/data
    # NOT exposed to Traefik — internal only

  minio:
    image: minio/minio:latest
    command: server /data --console-address ":9001"
    environment:
      MINIO_ROOT_USER: ${MINIO_USER}
      MINIO_ROOT_PASSWORD: ${MINIO_PASSWORD}
      MINIO_SERVER_URL: https://sentinel.domain.com/media
      MINIO_BROWSER_REDIRECT_URL: https://sentinel.domain.com/minio-console
    labels:
      - "traefik.enable=true"
      # MinIO API under /media
      - "traefik.http.routers.minio.rule=Host(`sentinel.domain.com`) && PathPrefix(`/media`)"
      - "traefik.http.routers.minio.priority=20"
      - "traefik.http.services.minio.loadbalancer.server.port=9000"
      # MinIO console (optional, can be disabled in prod)
      - "traefik.http.routers.minio-console.rule=Host(`sentinel.domain.com`) && PathPrefix(`/minio-console`)"
      - "traefik.http.services.minio-console.loadbalancer.server.port=9001"
    volumes:
      - minio-data:/data

volumes:
  postgres-data:
  minio-data:
  traefik-certs:
```

### Priority routing rules

| Priority | Path | Service | Notes |
|----------|------|---------|-------|
| 20 | `/media/*` | MinIO | Image serving and presigned URLs |
| 10 | `/api/*` | Express | REST API + Socket.IO handshake |
| 1 | `/*` | Next.js | Catch-all (dashboard, login, admin) |

**Critical Traefik/MinIO issue:** When MinIO is behind a reverse proxy, presigned URL signatures must be generated with the public external URL, not the internal Docker service URL. Set `MINIO_SERVER_URL` to the public URL so signatures match. Failure to do this causes `SignatureDoesNotMatch` errors on every presigned GET.

---

## Component Boundaries

### apps/api owns:
- LPR webhook endpoint (`POST /api/lpr/NotificationInfo/:action`)
- All REST API endpoints (CRUD for obras, cameras, placas, eventos)
- Socket.IO server (same HTTP server instance — no separate service needed for v1)
- Image upload to MinIO (the API converts base64 → buffer → MinIO)
- Presigned URL generation (API generates, never the frontend directly)
- JWT verification middleware
- WhatsApp alert dispatch (Evolution API calls)
- Multi-site intelligence logic (cross-obra queries within a tenant)

**apps/api does NOT own:**
- Authentication session management (NextAuth handles that in apps/web)
- Image serving (MinIO/Traefik handles that directly, bypassing Express)
- Static assets

### apps/web owns:
- All user-facing UI (dashboard, event feed, plate registry, reports, admin)
- NextAuth session: login, JWT issuance for web sessions, callback
- Socket.IO client (connects to Express WS endpoint)
- Server-side data fetching via Next.js API routes (which proxy to apps/api)

**apps/web does NOT own:**
- Any business logic (it calls apps/api for everything)
- Database access (never imports packages/database directly)
- File uploads (all images flow through apps/api → MinIO)

### packages/database owns:
- Single Prisma schema (source of truth for all models)
- PrismaClient singleton export
- Tenant-scoped client helper (`createTenantClient`)
- Migration files

**Only apps/api imports packages/database directly.**
apps/web never touches the database — this is a hard boundary. All data flows through the API.

### packages/shared owns:
- TypeScript interfaces for API request/response shapes
- Socket.IO event payload types (both server and client import these)
- Classification enum values and label maps
- Constants (plate regex, max file size, etc.)

### packages/ui owns:
- Reusable React components styled with opencheck color tokens
- No business logic — pure presentation
- Exports: `ClassificationBadge`, `EventCard`, `AlertBanner`, `DataTable`, `CameraStatusDot`, `PlateHistoryDrawer`

---

## JWT Strategy

Single JWT token carries `{ sub: userId, empresaId, role, iat, exp }`.

```typescript
// Token payload (packages/shared)
export interface JwtPayload {
  sub: string          // userId
  empresaId: string | null  // null for SUPER_ADMIN
  role: 'SUPER_ADMIN' | 'ADMIN_EMPRESA' | 'OPERADOR'
  iat: number
  exp: number
}
```

**NextAuth config in apps/web:**
```typescript
// apps/web/src/lib/auth.ts
callbacks: {
  jwt({ token, user }) {
    if (user) {
      token.empresaId = user.empresaId
      token.role = user.role
    }
    return token
  },
  session({ session, token }) {
    session.user.empresaId = token.empresaId
    session.user.role = token.role
    return session
  }
}
```

**Express middleware in apps/api:**
```typescript
// apps/api/src/middleware/auth.ts
export function requireAuth(req: Request, res: Response, next: NextFunction) {
  const token = req.headers.authorization?.split(' ')[1]
  const payload = jwt.verify(token, process.env.JWT_SECRET) as JwtPayload
  req.user = payload
  req.empresaId = payload.empresaId  // set once, used everywhere
  next()
}
```

Every database query in apps/api then uses `req.empresaId` as the tenant scope. A SUPER_ADMIN with `empresaId = null` receives a special middleware path that allows cross-tenant queries.

---

## Socket.IO Architecture

**Decision: Socket.IO co-located with Express in apps/api. No separate service.**

Rationale: LPR event ingestion already happens in apps/api. Emitting a socket event immediately after writing to the database (same process) is simpler and eliminates network hops. A separate socket service would require inter-service messaging (Redis pub/sub) for no benefit at v1 scale (single VPS, <1000 concurrent connections).

```typescript
// apps/api/src/socket/index.ts
export function setupSocket(server: http.Server) {
  const io = new Server(server, {
    cors: { origin: process.env.WEB_URL, credentials: true },
    path: '/api/socket.io'  // matches Traefik /api prefix
  })

  io.use(async (socket, next) => {
    const token = socket.handshake.auth.token
    const payload = jwt.verify(token, process.env.JWT_SECRET) as JwtPayload
    socket.data.empresaId = payload.empresaId
    socket.data.role = payload.role
    next()
  })

  io.on('connection', (socket) => {
    const { empresaId } = socket.data
    if (empresaId) {
      socket.join(`empresa:${empresaId}`)
    }
  })

  return io
}
```

**Tenant isolation via rooms, not namespaces.**
Rooms are sufficient. Namespaces add complexity (separate connection per namespace) with no benefit here — all tenants use the same `/` namespace, separated by `empresa:{id}` rooms. This also simplifies the authentication middleware (one place to verify JWT).

**Emitting from route handlers:**
The `io` instance is attached to the Express app: `app.set('io', io)`. Route handlers retrieve it: `const io = req.app.get('io')`. This avoids circular imports.

---

## MinIO Integration

**Storage pattern:**
```
bucket: sentinel-eventos   (private)

object key pattern:
  eventos/{year}/{month}/{day}/{eventoId}.jpg

example:
  eventos/2026/06/20/clx1a2b3c4d5e6f7.jpg
```

**Never store full URLs in the database. Store only the object key.**

**Serving images — two strategies:**

| Strategy | When to use | Implementation |
|----------|------------|----------------|
| Presigned GET URL | In-dashboard event feed, plate detail | API endpoint generates URL on demand (5-minute TTL) |
| Direct public bucket | Not recommended in v1 | Avoid — leaks all images if key is guessed |

```typescript
// apps/api/src/services/minio.service.ts
export async function getPresignedUrl(key: string): Promise<string> {
  return minioClient.presignedGetObject(
    process.env.MINIO_BUCKET,
    key,
    5 * 60  // 5 minutes TTL
  )
}
```

Frontend fetches presigned URL from API, uses it in `<img src={presignedUrl}>`. The presigned URL hits MinIO directly through Traefik (`/media/*` route), bypassing Express entirely — no base64 round-trips to the frontend.

**MinIO client config in apps/api:**
```typescript
const minioClient = new Minio.Client({
  endPoint: process.env.MINIO_ENDPOINT,   // 'minio' (Docker service name)
  port: 9000,
  useSSL: false,                          // internal Docker network = no SSL
  accessKey: process.env.MINIO_USER,
  secretKey: process.env.MINIO_PASSWORD
})
```

**The `MINIO_SERVER_URL` environment variable must be set to the public HTTPS URL** (e.g., `https://sentinel.domain.com/media`). Without this, MinIO generates presigned URLs with its internal Docker hostname, which Signature V4 validation rejects when the client hits the public URL.

---

## Build Order (phase dependencies)

```
Phase 1: Foundation
  └─ packages/database (schema, migrations, PrismaClient)
  └─ packages/shared (TypeScript types)
      Must be stable before any app development starts.

Phase 2: API Core
  └─ apps/api
      Depends on: packages/database, packages/shared
      First: auth middleware, LPR webhook, MinIO upload
      Then: REST CRUD endpoints

Phase 3: Socket Layer
  └─ apps/api (extend)
      Socket.IO setup, tenant rooms, event emission
      Depends on: LPR ingestion being stable (Phase 2)

Phase 4: Frontend
  └─ packages/ui (component library)
  └─ apps/web
      Depends on: packages/shared (types), packages/ui (components)
      Requires: apps/api running (for real data during dev)

Phase 5: Intelligence + Alerts
  └─ apps/api (extend)
      Multi-site alert logic, WhatsApp integration
      Depends on: Placa classification model (Phase 2), Socket.IO (Phase 3)

Phase 6: Infrastructure
  └─ docker-compose.yml, Traefik config, MinIO bucket setup
      Can be prepared in parallel with Phase 1-2
      Must be validated before Phase 4 frontend development
```

### Dependency graph (simplified)

```
packages/shared
      │
      ├──────────────┐
      ▼              ▼
packages/database  packages/ui
      │              │
      ▼              ▼
  apps/api        apps/web
      │              │
      └──────────────┘
         (API calls)
```

**The critical path is:** `packages/shared` → `packages/database` → `apps/api` → validate LPR ingestion → `apps/web`.

Do not start frontend development before the LPR ingestion endpoint and Socket.IO are working. The real-time event feed is the core UI and requires live data to design correctly.

---

## Critical Architecture Warnings

**1. Traefik sticky sessions for Socket.IO.**
Socket.IO long-polling falls back requires the same server instance. On a single VPS this is not an issue, but if you ever add a second API container (even for zero-downtime deploys), you need Traefik sticky sessions or the WebSocket upgrade will fail for load-balanced clients. Configure it from the start even on single containers (it has zero cost and prevents surprises).

**2. base64 image payload size.**
Intelbras LPR cameras send plate images as base64 in the JSON body. A 100KB image becomes ~133KB in base64. With many cameras firing simultaneously, Express `express.json({ limit: '2mb' })` is needed. Convert to buffer immediately on receipt; never store base64 in the database.

**3. Prisma Client singleton.**
In development, Next.js hot reload creates multiple PrismaClient instances, exhausting the connection pool. The standard fix is to cache the client on the global object:
```typescript
// packages/database/src/index.ts
const globalForPrisma = globalThis as unknown as { prisma: PrismaClient }
export const prisma = globalForPrisma.prisma ?? new PrismaClient()
if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma
```

**4. Next.js API routes as BFF proxy, not business logic.**
Do not put real business logic in `apps/web/src/app/api/` routes. Use them only as a proxy/session-aware wrapper for apps/api calls. This keeps the Express API as the single source of truth and makes the frontend swappable.

**5. MINIO_SERVER_URL signature mismatch.**
This is the most common MinIO-behind-Traefik failure mode. Presigned URLs must be generated with the public URL that clients will actually use. If `MINIO_SERVER_URL` is not set, MinIO defaults to the internal `http://minio:9000` and the signature never validates on the public HTTPS URL.

---

## Sources

- Turborepo 2.x task syntax: https://jsonic.io/guides/turbo-json
- Turborepo build pipeline discussion: https://github.com/vercel/turborepo/discussions/1347
- Prisma multi-tenancy row-level security: https://dev.to/whoffagents/multi-tenant-saas-data-isolation-row-level-security-tenant-scoping-and-plan-enforcement-with-1gd4
- Prisma + PostgreSQL RLS: https://medium.com/@francolabuschagne90/securing-multi-tenant-applications-using-row-level-security-in-postgresql-with-prisma-orm-4237f4d4bd53
- Multi-tenant SaaS 2026 patterns: https://gsoftconsulting.com/en/blog/building-multi-tenant-saas-2026
- Socket.IO rooms and namespaces: https://deepwiki.com/socketio/socket.io/2.1-namespaces-and-rooms
- Socket.IO scaling: https://ably.com/topic/scaling-socketio
- MinIO presigned URLs (Node.js): https://deepwiki.com/minio/minio-js/4.3-presigned-urls
- MinIO behind Traefik: https://github.com/minio/minio/discussions/20593
- MinIO Node.js Express integration: https://casual-programming.com/node-server-upload-images-minio/
- Traefik path-based routing: https://doc.traefik.io/traefik/expose/docker/basic/
- JWT multi-tenant claims: https://medium.com/@v4sooraj/building-a-multi-tenant-application-with-single-database-and-token-based-authentication-e86cf1f08dfc
- NextAuth multi-tenant middleware: https://strapi.io/blog/nextauth-js-secure-authentication-next-js-guide
