# Stack Research — Cargo Sentinel

**Researched:** 2026-06-20
**Overall confidence:** HIGH (all critical decisions verified against official docs and 2025-2026 sources)

---

## Recommended Stack

| Layer | Technology | Version | Rationale | Confidence |
|-------|-----------|---------|-----------|------------|
| Frontend | Next.js | **15** (not 14) | App Router stable, Turbopack passes all 8,298 integration tests, async params required for modern patterns | HIGH |
| Language | TypeScript | 5.x | Required for shared Prisma types across monorepo | HIGH |
| Styling | Tailwind CSS | 3.x (stay on 3, not 4) | Tailwind 4 is breaking — Evolution API dashboard already migrated away; v3 is the stable target for 2025 production | HIGH |
| Component icons | Lucide React | latest | Matches opencheck UI reference exactly | HIGH |
| Backend API | Node.js + Express | Express 4.x | Separate process needed for LPR webhook ingestion; Next.js server actions cannot handle persistent WebSocket | HIGH |
| ORM | Prisma | **6.x** | v6.9+ ships TypeScript/WASM query engine (1.6MB vs 14MB, 3.4x faster queries); full production-ready | HIGH |
| Database | PostgreSQL | 16+ | Row-level security, `set_config()` for tenant context, full Prisma support | HIGH |
| Real-time | Socket.IO | 4.x + `@socket.io/redis-adapter` | Bidirectional required (server push + client ack); Redis adapter enables horizontal scaling | HIGH |
| Image storage | **Garage** | 2.x (v2.3+ stable) | MinIO archived April 2026 (entered maintenance mode Dec 2025); Garage is the community default replacement, single Go binary, Apache-compatible, Docker-ready | HIGH |
| Monorepo | Turborepo + pnpm | Turborepo 2.x | Unchanged recommendation; proven for Next.js + Express + shared packages | HIGH |
| Auth | Auth.js (NextAuth) | **v5** | v5 is current; JWT sessions for edge/Docker deploy; role embedded in token | HIGH |
| WhatsApp alerts | Evolution API | **v2.3.7** (pin, do NOT upgrade to 2.4.0-rc) | v2.4.0 requires external license server activation — self-hosted SLAs break when licensing endpoint is down | MEDIUM |
| Deploy | Docker Compose + Traefik | Traefik v3 | Native Docker provider; label-based routing; automatic Let's Encrypt; Hostinger VPS compatible | HIGH |
| Cache / pub-sub | Redis | 7.x | Required by Socket.IO Redis adapter; also serves rate limiting and alert deduplication | HIGH |

---

## Key Decisions

### 1. Next.js 15, not 14

Next.js 14 reached end of active development. Next.js 15 is the current stable release (all integration tests pass with Turbopack). The breaking changes (async `params`, async `searchParams`, fetch uncached by default) are manageable with codemods and are actually desirable behaviour for a real-time dashboard that must not serve stale cached data. Start on 15 — do not start on 14 and plan to migrate.

**Breaking change to know:** `searchParams` and route `params` are now Promises. Await them in page components.

### 2. Prisma v6 with tenantId middleware, NOT PostgreSQL RLS

Two valid approaches exist for row-level multi-tenancy with Prisma:

- **PostgreSQL RLS policies** (database enforced via `current_setting()`) — maximum safety, complex setup, requires custom migration scripts, Prisma does not generate RLS DDL
- **Application-layer tenantId middleware** (Prisma client extension filtering) — simpler, Prisma-native, sufficient isolation when Express middleware sets tenant context before every request

**Recommendation: use Prisma Client Extensions** (`Prisma.defineExtension()`) to create a `forTenant(tenantId)` scoped client that automatically appends `where: { tenantId }` to every query. This is the standard pattern for 2025 and avoids PostgreSQL RLS complexity. Add PostgreSQL RLS as a safety net in Phase 2 only if a pentest requires it.

Implementation pattern:
```typescript
// packages/db/src/tenant-client.ts
export function tenantClient(prisma: PrismaClient, tenantId: string) {
  return prisma.$extends({
    query: {
      $allModels: {
        async $allOperations({ args, query }) {
          args.where = { ...args.where, tenantId };
          return query(args);
        },
      },
    },
  });
}
```

Middleware in Express sets `req.tenantClient = tenantClient(prisma, req.user.tenantId)`.

### 3. Garage instead of MinIO

MinIO entered maintenance mode in December 2025 and archived its open-source repo in April 2026. The web management console was stripped from the community edition in February 2025. **Do not start a new project on MinIO.**

**Garage** (v2.3+) is the community-recommended replacement:
- Single Go binary, Docker image available
- Full S3 API compatibility (AWS SDK v3 works unchanged)
- AGPL v3 license (same as former MinIO community)
- Runs comfortably on a single VPS node
- Trade-off: no erasure coding (uses full replication), no S3 Object Lock

For Cargo Sentinel on a single VPS, Garage is the correct choice. The S3 client code (AWS SDK) does not change — only the endpoint URL and credentials change.

### 4. Socket.IO v4 + Redis adapter (not SSE)

SSE (Server-Sent Events) is unidirectional (server → client only). Cargo Sentinel needs bidirectional communication:
- Server pushes LPR events to dashboards
- Client sends classification updates back (vehicle risk level changes)
- Server must broadcast that classification to all open sessions for that tenant

Socket.IO v4 with `@socket.io/redis-adapter` satisfies all three. It also handles reconnection, fallback to long-polling, and namespace-based tenant isolation.

**Namespace strategy:** one Socket.IO namespace per tenant (`/tenant-${tenantId}`). This prevents cross-tenant event leakage at the transport layer.

### 5. Evolution API v2.3.7 — pin and monitor

Evolution API v2.4.0-rc introduces a mandatory external license server activation. Until the Foundation proves licensing server uptime SLAs, **pin to v2.3.7** in `docker-compose.yml`. Upgrade path: only after v2.4.0 stable is released AND the licensing endpoint has a documented uptime guarantee.

Risk: Evolution API reliability in production is MEDIUM confidence. It depends on WhatsApp Web session stability (not the official Meta API). Disconnections require re-scanning QR codes. For Cargo Sentinel v1, this is acceptable (alerts are enhancement, not core feature). For v2, evaluate migrating to official WhatsApp Business API (Meta Cloud API) for production SLAs.

### 6. Auth.js v5 with JWT sessions (not database sessions)

JWT sessions avoid a database round-trip on every request. Embed `tenantId`, `role`, and `userId` in the JWT payload. Verify and decode in Express middleware using the same secret. This keeps the API stateless without a session store.

```typescript
// JWT payload shape
{
  sub: userId,
  tenantId: string,
  role: "SUPER_ADMIN" | "ADMIN" | "OPERATOR",
  exp: number
}
```

NextAuth v5 (Auth.js) supports custom JWT callbacks for this exactly.

### 7. Turborepo monorepo structure

```
apps/
  web/          ← Next.js 15 (dashboard + admin UI)
  api/          ← Express (LPR webhook receiver + WebSocket)
packages/
  db/           ← Prisma schema + generated client + tenantClient()
  types/        ← Shared TypeScript types (LPR events, vehicle risk, etc.)
  ui/           ← Shared React components (cards, alerts, tables)
  config/       ← Shared ESLint, TypeScript, Tailwind configs
```

The `api` app must be a separate Express process — it receives LPR camera HTTP POSTs at `/NotificationInfo/:action`, decodes base64 images, stores to Garage (S3), writes to PostgreSQL, and broadcasts via Socket.IO. None of this belongs in Next.js route handlers.

### 8. Traefik v3 routing strategy

Three services exposed via Traefik:
- `web` — Next.js on port 3000, routed by domain root (`Host(\`app.yourdomain.com\`)`)
- `api` — Express on port 4000, routed by path prefix (`PathPrefix(\`/api\`)`) or subdomain
- `garage` — S3-compatible API on port 3900, routed by subdomain for signed URL access

Traefik v3 uses the same Docker label syntax as v2 for most configurations. No breaking changes relevant to this setup.

---

## What NOT to Use (and Why)

| Technology | Why Not |
|-----------|---------|
| **MinIO** | Archived April 2026. Entered maintenance mode Dec 2025. Management UI stripped Feb 2025. Dead project for new self-hosted deployments. |
| **Next.js 14** | Not the current stable version. Starting on 14 means a near-term upgrade with async params breaking changes. Start on 15. |
| **PostgreSQL RLS at launch** | Correct concept, wrong timing. Prisma does not generate RLS DDL — you must manage migration SQL manually. The tenantId middleware pattern gives 95% of the safety with 10% of the complexity. Add real RLS in a hardening phase post-MVP. |
| **SSE (Server-Sent Events)** | Unidirectional only. Classification updates flow client → server, making SSE insufficient without a separate HTTP request channel. Socket.IO already handles both directions cleanly. |
| **Evolution API v2.4.0+** | v2.4.0 requires external license server activation before serving any traffic. Self-hosted reliability becomes dependent on Evolution Foundation infrastructure uptime. Pin to v2.3.7 until licensing SLAs are documented. |
| **Schema-per-tenant (separate PostgreSQL schemas)** | Prisma does not support schema-per-tenant natively — requires raw SQL for schema switching and breaks migrations. Row-level isolation is the Prisma-native approach. |
| **Prisma database sessions (NextAuth)** | Adds 1-2 DB queries per request. JWT sessions with tenantId embedded are stateless and work across API + web without shared session store. |
| **Tailwind CSS 4** | Breaking changes from v3. Evolution API itself migrated to Tailwind v4 in their new dashboard, which is evidence of active churn. For a production project starting now, stay on Tailwind v3 until the ecosystem (shadcn/ui, headlessui, etc.) fully migrates. |
| **RustFS** | Official docs explicitly say "DO NOT use in production environments" as of 2026. It's in alpha with an active CVE stream. |
| **Baileys (raw WhatsApp Web)** | Lower-level than Evolution API, requires more maintenance. Evolution API wraps Baileys — use the abstraction layer. |

---

## Version Notes

| Package | Pin To | Reason |
|---------|--------|--------|
| `next` | `^15.0.0` | 15 is stable; avoid 14 |
| `prisma` | `^6.9.0` | WASM query engine is production-ready from 6.9+; 3.4x faster |
| `socket.io` | `^4.7.0` | Last major stable; Redis adapter compatible |
| `@socket.io/redis-adapter` | `^8.x` | Must match socket.io major version |
| `next-auth` / `auth.js` | `^5.0.0` | v5 is the current stable (was beta for 2 years, now stable) |
| `evolution-api` (Docker tag) | `2.3.7` | Pin hard; do NOT use `latest` — v2.4.0 has breaking license activation |
| `garage` (Docker tag) | `v2.3.0` or latest `v2` | Avoid `latest` tag; pin to major |
| `traefik` (Docker image) | `v3` | v3 is current stable; v2 is legacy |
| `tailwindcss` | `^3.4.x` | Stay on v3; do not upgrade to v4 until shadcn/ui fully supports it |
| `typescript` | `^5.4.x` | Required for Prisma v6 type inference |

---

## Sources

- Next.js 15 production readiness: https://nextjs.org/blog/next-15
- Prisma v6.9.0 WASM engine: https://www.prisma.io/blog/prisma-6-9-0-release
- Prisma multi-tenancy approaches: https://zenstack.dev/blog/multi-tenant
- Prisma RLS implementation: https://atlasgo.io/guides/orms/prisma/row-level-security
- MinIO maintenance mode / archived: https://productimpossible.com/articles/self-hosted-s3-after-minio/
- Garage as MinIO alternative: https://rilavek.com/resources/self-hosted-s3-compatible-object-storage-2026
- Socket.IO scaling with Redis: https://socket.io/docs/v4/tutorial/step-9
- Socket.IO vs SSE comparison: https://www.index.dev/skill-vs-skill/socketio-vs-websockets-vs-server-sent-events
- Evolution API v2.3.7 release notes: https://github.com/EvolutionAPI/evolution-api/releases
- Evolution API v2.4.0 license activation breaking change: https://wasenderapi.com/blog/evolution-api-problems-2025-issues-errors-best-alternative-wasenderapi
- Auth.js v5 RBAC: https://authjs.dev/guides/role-based-access-control
- Traefik v3 Docker Compose: https://www.simplehomelab.com/udms-18-traefik-docker-compose-guide/
- Turborepo + Next.js patterns: https://turborepo.dev/docs/guides/frameworks/nextjs
