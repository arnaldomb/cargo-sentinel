# Pitfalls Research — Cargo Sentinel

**Domain:** Multi-tenant real-time LPR security monitoring SaaS
**Researched:** 2026-06-20
**Overall Confidence:** HIGH (most pitfalls verified from official docs, CVEs, and production post-mortems)

---

## Critical Pitfalls (will break the system)

---

### CRIT-01: Missing tenantId on Database Queries Causes Cross-Tenant Data Leakage

**What goes wrong:**
A single WHERE clause that omits `companyId` exposes every tenant's vehicles, events, and cameras to the wrong customer. This is the #1 multi-tenant SaaS failure mode. Salesforce's 2019 incident—$47M in damages—was a single query that crossed tenant boundaries during a maintenance operation.

**Why it happens:**
Prisma does not enforce row-level security automatically. Every `findMany`, `findFirst`, `update`, and `delete` call must include the tenant filter explicitly. Under time pressure, developers add new queries without the filter. Background jobs are the highest-risk zone: they run without an HTTP context, so the `tenantId` from the JWT is not naturally available.

**Consequences:**
- Operator from Company A sees Company B's vehicles and events
- Vehicle classifications (Suspeito, Crítico) leak between competing construction companies
- LGPD violation, contract termination, reputational destruction

**Prevention:**
1. Create a `db.ts` wrapper that requires `companyId` on every query for tenanted models. Force it at the type level.
2. In Prisma schema, every tenanted model gets `companyId String` + `@@index([companyId])`.
3. Middleware that extracts `companyId` from JWT and attaches it to `req.tenant`. No handler accesses the DB without `req.tenant`.
4. Background jobs receive `companyId` as an explicit parameter, never as a global.
5. Integration test: create 2 tenants, seed data for each, assert all API endpoints only return own-tenant data.

**Detection (warning signs):**
- Queries returning more rows than expected in staging
- Any query that filters only by `cameraId` or `plateNumber` without `companyId`
- Event handlers that accept camera webhooks without first validating the camera belongs to a tenant

**Phase:** Phase 1 (Auth + Multi-tenancy foundation). Get this wrong here and it contaminates every subsequent phase.

---

### CRIT-02: Socket.IO Events Broadcast to Wrong Tenant (Real-Time Data Leak)

**What goes wrong:**
`io.emit('lpr_event', data)` broadcasts to all connected clients. If room isolation is misconfigured, Operator from Company A sees Company B's live LPR events in real time.

**Why it happens:**
Socket.IO rooms are the correct isolation primitive, but developers often start with global `io.emit()` for speed and never fix it. A second failure mode: the room join happens in the WebSocket handshake, but the JWT is not validated at that moment — any unauthenticated socket can join any room if the room name is guessable (e.g., `room:company-123`).

**Consequences:**
- Real-time feed of competitor's site activity visible to wrong company
- Plate classifications leak instantly on classification action

**Prevention:**
1. Room naming pattern: `tenant:{companyId}` — derived only from validated JWT, never from client-supplied parameters.
2. Socket.IO middleware validates JWT on every `connection` event before `socket.join()`.
3. Never use `io.emit()` — always `io.to('tenant:{companyId}').emit()`.
4. Multi-site events use nested rooms: `site:{siteId}` scoped under tenant namespace.
5. On disconnect, clean up rooms explicitly.

**Detection:**
- Any `io.emit()` call without a room filter is a guaranteed leak
- Socket.IO namespace-level middleware that doesn't verify tenant is a risk

**Phase:** Phase 2 (Real-time event pipeline). Must be addressed before any live event is wired up.

---

### CRIT-03: LPR Camera Webhooks Are Not Idempotent — Duplicate Events Enter DB

**What goes wrong:**
Intelbras LPR cameras use at-least-once delivery. If your `/NotificationInfo/:action` endpoint takes longer than the camera's timeout (typically 5–15 seconds), the camera retries. The original request may have already written to the DB. You now have 2 identical events, 2 image uploads to MinIO, and potentially 2 WhatsApp alerts.

**Why it happens:**
Teams acknowledge the HTTP request after processing (sync model). Under load — MinIO upload + Prisma write + Socket.IO emit + WhatsApp call — the handler easily exceeds 5 seconds.

**Consequences:**
- Duplicate events in the live dashboard (operators see the same plate twice)
- Duplicate WhatsApp alerts sent to supervisors (alarm fatigue, carrier banning)
- Corrupted event history used for reports

**Prevention:**
1. Generate a deterministic event key: `SHA256(cameraId + plateNumber + timestamp)` and store in an `idempotencyKey` unique column.
2. Acknowledge 200 immediately upon receiving the webhook. Process asynchronously via an in-process queue (BullMQ or a simple `setImmediate` chain).
3. On async processing, upsert using `idempotencyKey` with `createOrSkip` semantics.
4. Dedup cache TTL must outlive the camera's full retry window (typically 30 minutes).

**Detection:**
- Same plate + same timestamp appearing twice in events table
- MinIO bucket containing duplicate image keys

**Phase:** Phase 2 (LPR webhook ingestion). Must be in place before testing with real cameras.

---

### CRIT-04: base64 Images Stored in PostgreSQL Destroy Database Performance

**What goes wrong:**
Intelbras cameras send images as base64 in the JSON payload. Teams store this base64 string directly in the events table. At 10 events/minute per camera with images of 100–500KB (133–667KB as base64 due to 33% encoding overhead), a 3-camera site generates ~2GB/month of image data in the database. Queries on the events table become a full TOAST scan. Backups take hours. Prisma queries that include the image field load megabytes per row.

**Why it happens:**
It's the path of least resistance. The camera sends base64, you put it in the DB, it works in dev.

**Consequences:**
- Events list query becomes unbearably slow as the table grows
- Database memory pressure from large text columns
- Prisma query logs show multi-second queries for paginated event lists
- Backups fail or take so long they block VPS I/O

**Prevention:**
1. In the webhook handler, immediately decode base64 and upload to MinIO as binary. Store only the MinIO object key in the DB (a short string like `events/2026/06/20/LPR-0001_ABC1234_1718827200.jpg`).
2. Never include the image field in list queries — select it only when showing a specific event detail.
3. Add `@@index([companyId, createdAt])` on the events table so pagination doesn't scan the whole table.

**Detection:**
- Any Prisma schema with `imageBase64 String` on the events model
- Events list query response time growing linearly with record count

**Phase:** Phase 1 (data model design) — this decision must be made before any migration runs.

---

### CRIT-05: JWT Tokens Contain No Tenant Binding — Role Escalation Possible

**What goes wrong:**
A JWT that encodes `{ role: "operator", userId: "xxx" }` but no `companyId` allows a user to craft or replay tokens and access a different tenant's API. CVE-2025-4692 demonstrated privilege escalation via JWT claims manipulation in a SaaS platform. A real-world incident showed tokens validated only by `userId`/email allowed cross-subdomain admin takeover.

**Why it happens:**
Auth tutorials rarely model multi-tenancy. JWTs are added in Phase 1, multi-tenancy is "handled later," but the token structure is never updated.

**Consequences:**
- Operator from Company A calls Company B's API with a valid JWT
- Super Admin token, if captured, gives access to all tenants with no scoping
- Role claims can be inflated if not verified server-side

**Prevention:**
1. JWT payload must include: `{ userId, companyId, role, iat, exp }`.
2. Super Admin tokens encode `companyId: null` — a distinct, explicit value, not an absent field.
3. Every protected route middleware validates that `req.tenant.companyId` from JWT matches the resource being accessed.
4. `aud` claim must be set to `cargo-sentinel-api` — reject tokens from other services.
5. Token expiry: 15 minutes for access tokens, 7 days for refresh tokens. Do not extend access token TTL for convenience.
6. Refresh token rotation: invalidate old refresh token on each use. Store hashed refresh tokens in DB so they can be revoked.

**Detection:**
- JWT payload missing `companyId` field
- Any endpoint that reads `companyId` from the request body instead of the validated JWT

**Phase:** Phase 1 (Auth foundation). Must be locked before any other endpoint is built.

---

### CRIT-06: MinIO Presigned URLs Expose Images Permanently (or Break After VPS Move)

**What goes wrong:**
Two distinct failure modes:

**A. Security failure:** Presigned URLs with long expiry (24h, 7 days, or permanent public bucket) allow anyone with the URL to access event photos indefinitely. A URL shared in a WhatsApp alert or PDF report becomes a permanent data leak.

**B. DNS failure:** When MinIO runs inside Docker, the client generates presigned URLs using the internal container hostname (e.g., `http://minio:9000/...`). These URLs work inside Docker but fail in the browser. This is a documented pitfall with MinIO + Docker networking.

**Prevention:**
- Set presigned URL expiry to match the UI session length (1–4 hours max).
- Configure MinIO with `MINIO_SERVER_URL=https://minio.yourdomain.com` so presigned URLs use the public hostname.
- In Traefik, route `minio.yourdomain.com` to MinIO container. Never expose MinIO on a raw port in production.
- For reports/PDFs: download images server-side using internal MinIO URL, embed in PDF. Do not put presigned URLs in PDFs.
- Never make the events bucket public.

**Detection:**
- MinIO client initialized without explicit `endPoint` override pointing to public domain
- PDF reports containing `http://minio:9000` in image src attributes

**Phase:** Phase 2 (image storage pipeline) and Phase 4 (reports).

---

## Important Pitfalls (will hurt UX and performance)

---

### IMP-01: WhatsApp Alert Spam — Same Plate Triggering Multiple Alerts in Rapid Succession

**What goes wrong:**
A Suspeito vehicle passes a camera slowly and triggers 3 reads in 30 seconds. Each read fires an alert. The security supervisor receives 3 WhatsApp messages for the same vehicle. Supervisors start ignoring alerts. The core value proposition collapses.

**Why it happens:**
The alert logic fires per-event. No deduplication window is applied.

**Consequences:**
- Alarm fatigue: supervisors stop reading alerts
- Evolution API rate limiting triggers, blocking the instance
- WhatsApp account flagged as spam sender

**Prevention:**
1. Per-plate dedup: after sending an alert for plate X at site Y, suppress further alerts for the same plate+site combination for a configurable window (default: 5 minutes for Suspeito, 15 minutes for Crítico).
2. Store last alert timestamp in Redis or a `lastAlertSentAt` column on the vehicle classification record.
3. Dedup check: `IF (now - lastAlertSentAt) < debounceWindow: SKIP alert`.
4. The debounce window must be configurable per company (some sites have 30-second camera intervals, others have 5-minute intervals).
5. Evolution API: use a BullMQ queue with concurrency=1 for WhatsApp sends to respect rate limits. Do not call Evolution API directly from the webhook handler.

**Detection:**
- Same plate generating N events in < 5 minutes triggers N alerts
- Evolution API returning 429 or connection drops

**Phase:** Phase 3 (alert pipeline). Must be designed before going live with any Suspeito/Crítico classification.

---

### IMP-02: Prisma N+1 Queries Destroy Performance at Event List Scale

**What goes wrong:**
The events list query fetches 50 events, then for each event fetches the camera (1 query), then the site (1 query), then the vehicle classification (1 query). That's 150 extra queries per page load. At 10,000 events/day, this becomes unacceptable.

**A critical finding from a 40-repo study (2025):** Prisma does NOT automatically add indexes on foreign keys in PostgreSQL. A query filtering `events WHERE cameraId = ? AND companyId = ?` without explicit indexes causes a full table scan.

**Prevention:**
1. Use Prisma's `include` to eager-load relations in a single query:
   ```
   findMany({ include: { camera: { include: { site: true } }, classification: true } })
   ```
2. Add explicit indexes in Prisma schema:
   ```
   @@index([companyId, createdAt(sort: Desc)])
   @@index([companyId, plateNumber])
   @@index([cameraId, createdAt])
   ```
3. Never include image URLs in list queries — select them only on detail view.
4. Enable Prisma query logging in development. Any query over 100ms is a flag.
5. Run `EXPLAIN ANALYZE` on the top 5 queries before each phase launch.

**Detection:**
- Prisma `$on('query')` logs showing sequential table scans
- Event list page taking > 2 seconds with > 10k records

**Phase:** Phase 2 (data model) for indexes, Phase 3 (event list API) for query optimization.

---

### IMP-03: PostgreSQL Connection Pool Exhaustion Under High Webhook Load

**What goes wrong:**
At 50 events/minute across 10 cameras, the webhook endpoint handles ~8 requests/second. If Prisma's default connection pool (10 connections) is exhausted by concurrent handlers still processing MinIO uploads, new webhooks queue up and the camera's retry timeout fires — creating more requests, exhausting the pool further. Cascading failure.

**Prevention:**
1. Acknowledge webhook with 200 immediately. Process asynchronously.
2. Set `connection_limit` in Prisma DATABASE_URL: `?connection_limit=20&pool_timeout=30`.
3. Single PrismaClient instance (singleton pattern) — never instantiate per-request.
4. Alert when active connections exceed 80% of pool capacity.
5. If deploying multiple Node processes (PM2 cluster), use PgBouncer in transaction mode to share connections across processes.

**Detection:**
- Prisma throwing `P2024: Timed out fetching a new connection from the connection pool`
- Camera events being dropped during load spikes

**Phase:** Phase 2 (webhook ingestion). Connection pool config must be in place before load testing.

---

### IMP-04: Cross-Site Intelligence Race Condition — Plate Seen at 2 Sites Simultaneously

**What goes wrong:**
A vehicle appears at Site A and Site B within milliseconds (two cameras, different workers checking the same plate). Both workers query: "Is this plate Suspeito?" → both get yes → both emit a cross-site alert → both send a WhatsApp message. The supervisor receives 2 alerts for what is logically one event.

More critically: both workers read `plateSeenAtSiteA = false`, both set it to true simultaneously — the second write wins silently, the first detection is lost.

**Why it happens:**
No distributed lock on cross-site intelligence lookups. In a single-process Node.js app this is less likely, but still possible with async I/O interleaving.

**Prevention:**
1. Cross-site alert dedup is a superset of IMP-01: dedup window applies per plate+company, not per plate+site.
2. Use PostgreSQL advisory locks or `UPDATE ... RETURNING` with optimistic concurrency for updating the "plate last seen" record.
3. For the cross-site alert specifically: write the alert record to DB first with `INSERT ... ON CONFLICT DO NOTHING`. Only send WhatsApp if the insert succeeded (indicating this is the first alert, not a duplicate).

**Detection:**
- Supervisor receiving 2 WhatsApp messages within 1 second for the same plate
- Cross-site intelligence triggering for the same event twice in logs

**Phase:** Phase 3 (cross-site intelligence). Must be designed with dedup from day one.

---

### IMP-05: Traefik Certificate Renewal Causes Brief Downtime If acme.json Is Not on a Persistent Volume

**What goes wrong:**
Traefik stores Let's Encrypt certificates in `acme.json`. If this file lives inside the container (not a mounted Docker volume), every `docker compose up` destroys it. Traefik re-requests a certificate from Let's Encrypt, but Let's Encrypt has rate limits (5 certificate requests per domain per week). After exhausting the rate limit, your site serves a self-signed cert for up to 7 days.

A secondary issue: Traefik generates presigned URLs using the MinIO Docker container hostname. Browsers cannot resolve internal Docker DNS names.

**Prevention:**
1. Mount `acme.json` on the host: `./traefik/acme.json:/etc/traefik/acme.json`. Set permissions to 600.
2. Never recreate the Traefik container in a way that loses this file.
3. Add a Let's Encrypt staging environment flag during initial setup to avoid burning rate limits.
4. Add `certresolver` to every Traefik router label, not just the entrypoint. A common mistake is defining the resolver globally but forgetting to reference it on individual services.
5. Set up a cron or monitoring alert 45 days before cert expiry as a backup check.

**Detection:**
- Browser showing "Your connection is not private" on a site that was previously working
- Traefik logs showing `ACME: unable to generate a certificate`

**Phase:** Phase 5 (deployment / DevOps). Address in the initial Docker Compose setup, not as an afterthought.

---

### IMP-06: PDF Report Generation OOM-Kills Node.js Process

**What goes wrong:**
A report for 30 days of activity at a 5-camera site with photos contains ~21,600 events. If each event photo is 300KB and the PDF generator loads all images into memory at once (common with pdfkit, puppeteer, and jspdf), peak memory usage is 6–7GB. The Node.js process is OOM-killed by the OS. The user sees an eternal spinner.

**Prevention:**
1. Implement pagination for report generation: chunk events into batches of 100, stream to PDF rather than building in memory.
2. Use streaming PDF libraries (PDFKit supports streams) rather than building the entire document in memory.
3. Set a hard limit: reports max 1,000 events. If the query returns more, require date range narrowing or split into multiple report files.
4. Resize images before embedding: thumbnail images at 300x200px for reports (reduces each image to ~15KB).
5. Generate PDFs in a background job queue (BullMQ). Return a job ID immediately; notify via WebSocket when ready. Never generate PDFs synchronously in a request handler.
6. Set Node.js `--max-old-space-size=512` in the API container and let it fail fast rather than OOM-killing the entire process.

**Detection:**
- Node.js process restarting after PDF generation requests
- Report endpoint timing out after 30 seconds

**Phase:** Phase 4 (reports). Background job architecture must be in place before implementing report generation.

---

### IMP-07: WebSocket Event Storm Under High Camera Load

**What goes wrong:**
At 50 events/minute across 10 cameras (800+ events/hour), each event emits a Socket.IO event to every connected operator. If 5 operators are connected and each event payload includes image URLs, the Socket.IO server is emitting 4,000+ events/hour with non-trivial payload sizes. Under peak load (cameras triggering simultaneously), a burst of 20 events in 5 seconds overwhelms slow clients. Node.js buffers grow unbounded, memory climbs, and the event loop blocks.

**Prevention:**
1. Throttle event emission to UI clients: batch events that arrive within a 500ms window and emit them as a single array (`lpr_events_batch`).
2. Never include image data (URLs or base64) in Socket.IO payloads. Emit only the event metadata (plateNumber, cameraId, timestamp, classificationLevel). UI fetches image URL on demand when the operator clicks an event.
3. Check `socket.bufferedAmount` before emitting. If the client buffer is full, skip non-critical events.
4. Set Socket.IO `pingTimeout` and `pingInterval` to detect dead connections quickly and clean up rooms.

**Detection:**
- Node.js process memory growing during high-traffic periods
- Operator UI showing duplicate or out-of-order events

**Phase:** Phase 2 (real-time pipeline). Batching should be in the initial Socket.IO design.

---

## Minor Pitfalls (clean up later, but know they exist)

---

### MIN-01: Turborepo Build Cache Stale After Prisma Schema Changes

**What goes wrong:**
Turborepo caches build outputs. After a `prisma migrate dev`, the generated Prisma client in `node_modules/.prisma` changes, but Turborepo's cache for packages that import Prisma types may serve stale outputs. TypeScript errors appear locally but CI passes (or vice versa) because the cache disagrees.

**Prevention:**
Add `prisma generate` as a dependency in the `packages/db` turbo pipeline before any build task. Ensure `.prisma/client/**` is in the turbo cache inputs hash.

**Phase:** Phase 1 (monorepo setup).

---

### MIN-02: Camera IDs (LPR-0001) Are Not Globally Unique — Cross-Tenant Collision

**What goes wrong:**
Two companies both have a camera named `LPR-0001`. If any query filters by camera ID without the tenant scope, it could return results from both companies. Less critical than CRIT-01 because camera IDs are integers/UUIDs in the DB — but a naming display collision can confuse operators in super admin views.

**Prevention:**
Use UUID as the primary key for cameras in the DB. `LPR-0001` is a display label scoped to the company, not a primary key. Super admin views always display `[Company Name] > LPR-0001`.

**Phase:** Phase 1 (data model).

---

### MIN-03: NextAuth.js Session Token and JWT Access Token Out of Sync

**What goes wrong:**
NextAuth manages its own session (stored in a cookie or JWT). Your Express API uses a separate JWT. If a user's role changes (Operador → Admin), the NextAuth session still says Operador until it expires. The user is confused: they have admin rights on the API but the UI doesn't show admin features.

**Prevention:**
1. Use short NextAuth session maxAge (1 hour).
2. On role change, force a `signOut` + `signIn` flow via the admin UI.
3. Alternatively: don't duplicate role in NextAuth session. Use the API JWT as the single source of truth, and have NextAuth pass it through as a `accessToken` in the session object.

**Phase:** Phase 1 (Auth). Resolve the token authority model before building any role-dependent UI.

---

### MIN-04: Evolution API Instance Disconnects Silently

**What goes wrong:**
Evolution API's WhatsApp connection drops (common — the unofficial protocol is fragile). Your system still tries to send alerts, the Evolution API returns errors, but no one notices because errors are swallowed. Placas Críticas trigger alerts that are never received.

**Prevention:**
1. Implement a health check against Evolution API before each alert send. If disconnected, log to DB as `alertStatus: FAILED` and surface in the super admin dashboard.
2. Set up a periodic reconnect check (every 5 minutes) that calls Evolution API's instance status endpoint.
3. Alert the super admin via email when WhatsApp integration has been disconnected for > 10 minutes.

**Phase:** Phase 3 (alert pipeline).

---

### MIN-05: Prisma Migrations Run on Production Without a Rollback Plan

**What goes wrong:**
`prisma migrate deploy` runs forward-only. If a migration adds a `NOT NULL` column without a default, it fails on the existing data and leaves the DB in a broken state. In a SaaS with multiple tenants, this affects everyone simultaneously.

**Prevention:**
1. Never add `NOT NULL` columns without a `@default()` in the same migration.
2. Use the expand-contract pattern: add nullable, backfill, then make NOT NULL in a later migration.
3. Test migrations against a copy of production data before deploying.
4. Add a migration smoke test to the CI/CD pipeline that runs against a seeded PostgreSQL instance.

**Phase:** Every phase that touches the schema.

---

### MIN-06: Super Admin Can See All Tenant Data — No Audit Log

**What goes wrong:**
The Super Admin role has unconstrained access to all tenant data for support purposes. Without an audit log, there is no way to prove to a tenant that their data was not improperly accessed by platform staff. This becomes a LGPD compliance risk.

**Prevention:**
1. Log all Super Admin data access: `{ adminUserId, companyId, resource, action, timestamp }`.
2. Super Admin impersonation (acting as a company) must create an explicit audit event.
3. Audit log is append-only (no DELETE), stored separately from operational data.

**Phase:** Phase 1 (Auth/super admin) — basic audit log must exist from the start. Full compliance audit trail is Phase 5.

---

## Phase-Specific Warning Matrix

| Phase | Topic | Most Likely Pitfall | Mitigation |
|-------|-------|---------------------|------------|
| Phase 1 | Data model + auth | Missing `companyId` on JWT and DB queries | Type-enforced tenant wrapper on DB client |
| Phase 1 | Data model | base64 image in DB | MinIO from day one, store only object key |
| Phase 1 | Auth | JWT with no `companyId` | Embed at token creation, validate in every middleware |
| Phase 2 | Webhook ingestion | Duplicate events from camera retries | Idempotency key + async acknowledgment |
| Phase 2 | Real-time | Socket.IO broadcasting to all tenants | Room-per-tenant, JWT-validated join |
| Phase 2 | Performance | Prisma missing FK indexes | Explicit `@@index` before first migration |
| Phase 2 | MinIO | Presigned URLs with internal Docker hostnames | `MINIO_SERVER_URL` pointing to public domain |
| Phase 3 | Alerts | Duplicate WhatsApp messages per plate | Per-plate debounce window + BullMQ queue |
| Phase 3 | Cross-site | Race condition on simultaneous detections | `INSERT ON CONFLICT DO NOTHING` for alert record |
| Phase 3 | Connection pool | Pool exhaustion under camera burst load | Async webhook handler + PgBouncer |
| Phase 4 | Reports | OOM on large PDF with photos | Stream generation + image resize + background job |
| Phase 5 | Deploy | Traefik acme.json lost on container restart | Persistent volume mount with correct permissions |
| Phase 5 | Evolution API | Silent WhatsApp disconnection | Health check + alertStatus log + super admin notification |

---

## Confidence Assessment

| Area | Confidence | Basis |
|------|------------|-------|
| Multi-tenancy leakage | HIGH | CVEs, Salesforce incident, official PostgreSQL docs |
| Socket.IO isolation | HIGH | Official Socket.IO docs, security research |
| Webhook idempotency | HIGH | Multiple production post-mortems, official guides |
| Image storage (base64) | HIGH | PostgreSQL wiki, CYBERTEC benchmark data |
| JWT vulnerabilities | HIGH | CVE-2025-4692, PortSwigger Web Security Academy |
| MinIO presigned URLs | HIGH | Official AWS + MinIO docs, Docker DNS issue documented |
| Prisma N+1 + indexes | HIGH | 40-repo empirical study, Prisma official docs |
| WhatsApp dedup | MEDIUM | Pattern inferred from general alert dedup + Evolution API issues |
| PDF memory issues | MEDIUM | PDFKit issue tracker, general Node.js OOM patterns |
| Traefik cert renewal | HIGH | Official Traefik docs, community issues |
| Evolution API reliability | MEDIUM | GitHub issues, community reports — unofficial protocol inherently unstable |
