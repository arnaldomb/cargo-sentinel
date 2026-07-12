<!-- GSD:project-start source:PROJECT.md -->
## Project

**Cargo Sentinel**

Plataforma SaaS multi-tenant de inteligência de perímetro logístico para canteiros de obra. Monitora entrada, saída e recorrência de veículos via câmeras LPR Intelbras, classificando cada placa em 5 níveis de risco (Liberado → Crítico) e cruzando eventos entre múltiplas obras da mesma empresa em tempo real.

Não é só um receptor LPR — é inteligência operacional para prevenção de furtos em construção civil.

**Core Value:** **Em 1 clique, o operador classifica um veículo suspeito. Na próxima leitura em qualquer obra da empresa, o alerta dispara automaticamente.**
<!-- GSD:project-end -->

<!-- GSD:stack-start source:research/STACK.md -->
## Technology Stack

## Recommended Stack
| Layer | Technology | Version | Rationale | Confidence |
|-------|-----------|---------|-----------|------------|
| Frontend | Next.js | **15** (not 14) | App Router stable, Turbopack passes all 8,298 integration tests, async params required for modern patterns | HIGH |
| Language | TypeScript | 5.x | Required for shared Prisma types across monorepo | HIGH |
| Styling | Tailwind CSS | 3.x (stay on 3, not 4) | Tailwind 4 is breaking — Evolution API dashboard already migrated away; v3 is the stable target for 2025 production | HIGH |
| Component icons | Lucide React | latest | Matches opencheck UI reference exactly | HIGH |
| Backend API | Node.js + Express | Express 4.x | Separate process needed for LPR webhook ingestion; Next.js server actions cannot handle persistent WebSocket | HIGH |
| ORM | Prisma | **7.x** (current stable as of 2026) | v7 is the current stable major; greenfield project starts on 7.x. Ships TypeScript/WASM query engine, 3.4x faster queries; `$extends` API unchanged from v6 | HIGH |
| Database | PostgreSQL | 16+ | Row-level security, `set_config()` for tenant context, full Prisma support | HIGH |
| Real-time | Socket.IO | 4.x + `@socket.io/redis-adapter` | Bidirectional required (server push + client ack); Redis adapter enables horizontal scaling | HIGH |
| Image storage | **Garage** | 2.x (v2.3+ stable) | MinIO archived April 2026 (entered maintenance mode Dec 2025); Garage is the community default replacement, single Go binary, Apache-compatible, Docker-ready | HIGH |
| Monorepo | Turborepo + pnpm | Turborepo 2.x | Unchanged recommendation; proven for Next.js + Express + shared packages | HIGH |
| Auth | Auth.js (NextAuth) | **v5** | v5 is current; JWT sessions for edge/Docker deploy; role embedded in token | HIGH |
| WhatsApp alerts | Z-API | REST HTTP API (per-instance) | Decisão revista (2026-07-12): substitui Evolution API — sem servidor próprio, sem licença externa, provisionamento por instância centralizado pelo SUPER_ADMIN | HIGH |
| Deploy | Docker Compose + Traefik | Traefik v3 | Native Docker provider; label-based routing; automatic Let's Encrypt; Hostinger VPS compatible | HIGH |
| Cache / pub-sub | Redis | 7.x | Required by Socket.IO Redis adapter; also serves rate limiting and alert deduplication | HIGH |
## Key Decisions
### 1. Next.js 15, not 14
### 2. Prisma v7 with tenantId middleware, NOT PostgreSQL RLS
- **PostgreSQL RLS policies** (database enforced via `current_setting()`) — maximum safety, complex setup, requires custom migration scripts, Prisma does not generate RLS DDL
- **Application-layer tenantId middleware** (Prisma client extension filtering) — simpler, Prisma-native, sufficient isolation when Express middleware sets tenant context before every request
### 3. Garage instead of MinIO
- Single Go binary, Docker image available
- Full S3 API compatibility (AWS SDK v3 works unchanged)
- AGPL v3 license (same as former MinIO community)
- Runs comfortably on a single VPS node
- Trade-off: no erasure coding (uses full replication), no S3 Object Lock
### 4. Socket.IO v4 + Redis adapter (not SSE)
- Server pushes LPR events to dashboards
- Client sends classification updates back (vehicle risk level changes)
- Server must broadcast that classification to all open sessions for that tenant
### 5. Z-API for WhatsApp alerts (replaces Evolution API)
**Decisão revista (2026-07-12): Z-API substitui Evolution API — provisionamento centralizado por superadmin, sem servidor de licença externo.**
- SUPER_ADMIN cadastra/valida a instância Z-API (instanceId + token + clientToken) por empresa em `/admin/empresas/[id]/whatsapp` — credenciais nunca ficam visíveis para o tenant
- Tenant (ADMIN_EMPRESA) só vê status/QR/grupos/config de envio/testar em `/configuracoes/whatsapp`
- Cliente HTTP simples (`apps/api/src/infra/zapi/zapi.service.ts`) — sem processo próprio, sem banco de dados dedicado, sem `docker-compose` service
### 6. Auth.js v5 with JWT sessions (not database sessions)
### 7. Turborepo monorepo structure
### 8. Traefik v3 routing strategy
- `web` — Next.js on port 3000, routed by domain root (`Host(\`app.yourdomain.com\`)`)
- `api` — Express on port 4000, routed by path prefix (`PathPrefix(\`/api\`)`) or subdomain
- `garage` — S3-compatible API on port 3900, routed by subdomain for signed URL access
## What NOT to Use (and Why)
| Technology | Why Not |
|-----------|---------|
| **MinIO** | Archived April 2026. Entered maintenance mode Dec 2025. Management UI stripped Feb 2025. Dead project for new self-hosted deployments. |
| **Next.js 14** | Not the current stable version. Starting on 14 means a near-term upgrade with async params breaking changes. Start on 15. |
| **PostgreSQL RLS at launch** | Correct concept, wrong timing. Prisma does not generate RLS DDL — you must manage migration SQL manually. The tenantId middleware pattern gives 95% of the safety with 10% of the complexity. Add real RLS in a hardening phase post-MVP. |
| **SSE (Server-Sent Events)** | Unidirectional only. Classification updates flow client → server, making SSE insufficient without a separate HTTP request channel. Socket.IO already handles both directions cleanly. |
| **Evolution API (any version)** | Replaced by Z-API (2026-07-12 decision). Required its own service (Docker container + Postgres/Redis integration), and v2.4.0+ required external license server activation before serving any traffic — self-hosted reliability became dependent on Evolution Foundation infrastructure uptime. Z-API is a plain REST HTTP API with no self-hosted process to run. |
| **Schema-per-tenant (separate PostgreSQL schemas)** | Prisma does not support schema-per-tenant natively — requires raw SQL for schema switching and breaks migrations. Row-level isolation is the Prisma-native approach. |
| **Prisma database sessions (NextAuth)** | Adds 1-2 DB queries per request. JWT sessions with tenantId embedded are stateless and work across API + web without shared session store. |
| **Tailwind CSS 4** | Breaking changes from v3. Evolution API itself migrated to Tailwind v4 in their new dashboard, which is evidence of active churn. For a production project starting now, stay on Tailwind v3 until the ecosystem (shadcn/ui, headlessui, etc.) fully migrates. |
| **RustFS** | Official docs explicitly say "DO NOT use in production environments" as of 2026. It's in alpha with an active CVE stream. |
| **Baileys (raw WhatsApp Web)** | Lower-level than Evolution API, requires more maintenance. Evolution API wraps Baileys — use the abstraction layer. |
## Version Notes
| Package | Pin To | Reason |
|---------|--------|--------|
| `next` | `^15.0.0` | 15 is stable; avoid 14 |
| `prisma` | `^7.8.0` | 7.x is current stable (as of 2026); greenfield project. WASM query engine, 3.4x faster; `$extends` API unchanged from v6 |
| `socket.io` | `^4.7.0` | Last major stable; Redis adapter compatible |
| `@socket.io/redis-adapter` | `^8.x` | Must match socket.io major version |
| `next-auth` / `auth.js` | `^5.0.0` | v5 is the current stable (was beta for 2 years, now stable) |
| `garage` (Docker tag) | `v2.3.0` or latest `v2` | Avoid `latest` tag; pin to major |
| `traefik` (Docker image) | `v3` | v3 is current stable; v2 is legacy |
| `tailwindcss` | `^3.4.x` | Stay on v3; do not upgrade to v4 until shadcn/ui fully supports it |
| `typescript` | `^5.4.x` | Required for Prisma v7 type inference |
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
<!-- GSD:stack-end -->

<!-- GSD:conventions-start source:CONVENTIONS.md -->
## Conventions

Conventions not yet established. Will populate as patterns emerge during development.
<!-- GSD:conventions-end -->

<!-- GSD:architecture-start source:ARCHITECTURE.md -->
## Architecture

Architecture not yet mapped. Follow existing patterns found in the codebase.
<!-- GSD:architecture-end -->

<!-- GSD:skills-start source:skills/ -->
## Project Skills

No project skills found. Add skills to any of: `.claude/skills/`, `.agents/skills/`, `.cursor/skills/`, or `.github/skills/` with a `SKILL.md` index file.
<!-- GSD:skills-end -->

<!-- GSD:workflow-start source:GSD defaults -->
## GSD Workflow Enforcement

Before using Edit, Write, or other file-changing tools, start work through a GSD command so planning artifacts and execution context stay in sync.

Use these entry points:
- `/gsd-quick` for small fixes, doc updates, and ad-hoc tasks
- `/gsd-debug` for investigation and bug fixing
- `/gsd-execute-phase` for planned phase work

Do not make direct repo edits outside a GSD workflow unless the user explicitly asks to bypass it.
<!-- GSD:workflow-end -->



<!-- GSD:profile-start -->
## Developer Profile

> Profile not yet configured. Run `/gsd-profile-user` to generate your developer profile.
> This section is managed by `generate-claude-profile` -- do not edit manually.
<!-- GSD:profile-end -->
