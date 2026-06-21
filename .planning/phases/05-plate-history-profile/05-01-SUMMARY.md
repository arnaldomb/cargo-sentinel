---
phase: "05"
plan: "01"
name: "Backend Plate Profile API"
subsystem: "api"
tags: [plate-history, cursor-pagination, multi-tenant, prisma-index]
status: complete

dependency_graph:
  requires:
    - "04-01: placas PATCH classification + ClassificacaoHistorico model"
    - "02-01: authMiddleware + tenantClient injection via protectedPipeline"
  provides:
    - "GET /api/placas/:numero/historico — cursor-paginated event history per plate"
    - "GET /api/placas/:numero/classificacoes — classification audit trail with user name"
    - "GET /api/eventos/buscar — cross-filter search with cursor pagination"
    - "Composite index on Evento for O(log n) plate history queries"
  affects:
    - "05-02: plate profile page (consumes /historico and /classificacoes)"
    - "05-03: search page (consumes /eventos/buscar)"

tech_stack:
  added: []
  patterns:
    - "Cursor pagination: take limit+1, hasMore=length>limit, nextCursor=page[last].id"
    - "Plate number normalised to uppercase before query to prevent capitalisation bypass"
    - "tenantClient auto-scopes all queries to JWT empresaId — no empresaId in request body"
    - "Composite Prisma index for keyset pagination without full-table scan"

key_files:
  created: []
  modified:
    - path: "packages/database/prisma/schema.prisma"
      change: "Added @@index([empresaId, placaId, timestamp(sort: Desc)]) to Evento model"
    - path: "apps/api/src/routes/placas.ts"
      change: "Added GET /:numero/historico and GET /:numero/classificacoes routes"
    - path: "apps/api/src/routes/eventos.ts"
      change: "Added GET /buscar route before /feed (static route first to avoid param collision)"
    - path: "apps/api/src/routes/placas.test.ts"
      change: "Added 7 test cases for /historico (200/404/pagination/filter/thumbnailUrl) and /classificacoes (200/404)"
    - path: "apps/api/src/routes/eventos.test.ts"
      change: "Added 5 test cases for /buscar (no-filter/placa-partial/obraId/nextCursor/cursor-passthrough)"

decisions:
  - "Route /buscar registered BEFORE /feed in eventos router — static routes must precede parametrised routes to avoid Express treating 'buscar' as an :id param"
  - "historico route returns placa metadata alongside items — avoids a second roundtrip from the profile page"
  - "classificacoes route returns full audit trail (no pagination) — audit trails are short by design and the existing @@index([placaId, createdAt(sort: Desc)]) already covers this"
  - "getPresignedUrl imported into placas.ts — presigned URL generation reused from the same Garage service used by eventos.ts"

metrics:
  duration_minutes: 15
  completed_date: "2026-06-21"
  tasks_completed: 3
  tasks_total: 3
  files_modified: 5
  tests_added: 12
  tests_total: 109
---

# Phase 05 Plan 01: Backend Plate Profile API Summary

**One-liner:** Three cursor-paginated API routes backed by a composite Prisma index that prevents full-table scans on 10k+ event datasets.

## Routes Created

### GET /api/placas/:numero/historico

```
Query params: limit (1–100, default 20), cursor, obraId, cameraId, dataInicio (ISO), dataFim (ISO)
Response: {
  placa: { id, numero, classificacao, empresaTransportadora, motorista, tipoVeiculo, observacao },
  items: [{ id, timestamp (ISO), direcao, classificacao, thumbnailUrl, obra, camera }],
  nextCursor: string | null
}
```

- Plate number normalised to uppercase before query
- 404 when plate not found in tenant
- Presigned URL generated per item when fotoGarageKey present
- Uses composite index `[empresaId, placaId, timestamp DESC]` for O(log n) access

### GET /api/placas/:numero/classificacoes

```
Response: {
  placa: { id, numero, classificacao },
  items: [{ id, createdAt (ISO), classificacaoDe, classificacaoPara, observacao, usuario: { id, nome } }]
}
```

- Full audit trail (no pagination) — covered by existing `@@index([placaId, createdAt(sort: Desc)])`
- 404 when plate not found in tenant

### GET /api/eventos/buscar

```
Query params: placa (partial, case-insensitive), obraId, cameraId, dataInicio (ISO), dataFim (ISO),
              limit (1–100, default 20), cursor
Response: {
  items: [{ id, timestamp (ISO), placaNumero, placaId, direcao, classificacao, thumbnailUrl, obra, camera }],
  nextCursor: string | null
}
```

- Partial plate search via Prisma `contains` with `mode: 'insensitive'`
- Without filters returns 20 most recent events for the tenant
- Registered before `/feed` in the router to avoid Express param collision

## Index Added

```prisma
// packages/database/prisma/schema.prisma — model Evento
@@index([empresaId, placaId, timestamp(sort: Desc)])
```

Applied via `prisma db push` — confirmed "Your database is now in sync with your Prisma schema."

## Filter Pattern for Reuse in 05-02 and 05-03

```typescript
// Cursor pagination pattern (established in 04, reinforced here):
const eventos = await req.tenantClient!.evento.findMany({
  where: { placaId, ...optionalFilters },
  take: limit + 1,
  ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
  orderBy: { timestamp: 'desc' },
  select: { ... },
});
const hasMore = eventos.length > limit;
const page = hasMore ? eventos.slice(0, limit) : eventos;
const nextCursor = hasMore ? page[page.length - 1]?.id ?? null : null;
```

```typescript
// Partial plate search (for 05-03 search page):
placa && { placaNumero: { contains: placa, mode: 'insensitive' } }
```

## Deviations from Plan

None — plan executed exactly as written.

## Known Stubs

None — all routes return real data from the database via tenantClient.

## Threat Flags

None — no new network endpoints beyond what the plan's threat model covers. All 3 routes are protected by `authMiddleware + tenantMiddleware + requireRole`. empresaId is always sourced from the verified JWT, never from the request.

## Self-Check: PASSED

- `packages/database/prisma/schema.prisma` — FOUND, contains `@@index([empresaId, placaId, timestamp(sort: Desc)])`
- `apps/api/src/routes/placas.ts` — FOUND, contains `/:numero/historico` and `/:numero/classificacoes`
- `apps/api/src/routes/eventos.ts` — FOUND, contains `/buscar`
- Commit `955e503` (schema index) — FOUND
- Commit `fe8fc85` (placas routes) — FOUND
- Commit `d7decb7` (eventos/buscar) — FOUND
- All 109 tests pass (`pnpm test` in `apps/api`)
- `pnpm -w build` completes with 0 TypeScript errors
