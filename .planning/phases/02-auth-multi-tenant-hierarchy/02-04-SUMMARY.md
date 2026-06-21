---
phase: 02-auth-multi-tenant-hierarchy
plan: 04
subsystem: api-routes
tags: [crud, multi-tenant, rbac, obras, cameras, soft-delete, tdd]
dependency_graph:
  requires: [02-01, 02-02, 02-03]
  provides: [obras-crud-api, cameras-crud-api, protected-pipeline-module]
  affects: [apps/api/src/index.ts, packages/database/prisma/schema.prisma]
tech_stack:
  added: []
  patterns: [protectedPipeline-spread, mergeParams-subrouter, findFirstOrThrow-tenant-isolation, soft-delete-ativo-false, P2025-to-404, P2002-to-409, vi.hoisted-mock-pattern]
key_files:
  created:
    - apps/api/src/middleware/pipeline.ts
    - apps/api/src/routes/obras.ts
    - apps/api/src/routes/cameras.ts
    - apps/api/src/routes/obras.test.ts
    - apps/api/src/routes/cameras.test.ts
  modified:
    - packages/database/prisma/schema.prisma
    - apps/api/src/index.ts
decisions:
  - protectedPipeline extracted to middleware/pipeline.ts to break circular import (index imports routers; routers cannot import index)
  - mergeParams:true in camerasRouter to inherit :obraId from parent app.use mount
  - schema ativo field added via direct ALTER TABLE (postgres not exposed on host port; docker exec used)
  - vi.hoisted() required for mockRequireRole — vi.mock factory is hoisted above variable declarations
metrics:
  duration_seconds: 326
  completed_date: "2026-06-21"
  tasks_completed: 2
  files_created: 5
  files_modified: 2
---

# Phase 02 Plan 04: CRUD Obra/Camera (TENANT-05, TENANT-06) Summary

**One-liner:** Express CRUD para Obras e Cameras com isolamento de tenant via `req.tenantClient`, RBAC por role, soft-delete (`ativo=false`), e proteção centralizada via `protectedPipeline` sem dependencia circular.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | pipeline.ts + schema ativo + obras CRUD | e3eecad | middleware/pipeline.ts, routes/obras.ts, schema.prisma |
| 2 | cameras CRUD + 11 tests + index.ts registration | b9abb7a | routes/cameras.ts, obras.test.ts, cameras.test.ts, index.ts |

## What Was Built

### middleware/pipeline.ts
Modulo dedicado que exporta `protectedPipeline = [authMiddleware, tenantMiddleware] as const`. Resolve o problema de dependencia circular: `index.ts` importa os routers, e routers importam o pipeline deste modulo — nunca de `index`.

### schema.prisma — campo `ativo`
Campo `ativo Boolean @default(true)` adicionado em `Obra` e `Camera`. Suporta soft-delete sem migration destrutiva (default true preserva todos os registros existentes). Aplicado via `ALTER TABLE ... ADD COLUMN IF NOT EXISTS` diretamente no container Docker (porta 5432 nao exposta ao host). `prisma generate` executado para regenerar o client.

### routes/obras.ts
- `GET /api/obras` — OPERADOR+, lista obras ativas (`ativo: true`) do tenant via `tenantClient.obra.findMany`
- `POST /api/obras` — ADMIN_EMPRESA+, empresaId extraido de `req.user.empresaId` (nunca do body — T-02-22)
- `PUT /api/obras/:id` — ADMIN_EMPRESA+, `findFirstOrThrow` verifica pertencimento ao tenant antes de mutar; P2025 → 404
- `DELETE /api/obras/:id` — ADMIN_EMPRESA+, soft-delete via `update({ data: { ativo: false } })`

### routes/cameras.ts
- `Router({ mergeParams: true })` — herda `:obraId` do parent mount em `index.ts`
- `GET /api/obras/:obraId/cameras` — OPERADOR+, verifica obra via `obra.findFirstOrThrow` antes de listar cameras
- `POST /api/obras/:obraId/cameras` — ADMIN_EMPRESA+, verifica obra, cria camera com `empresaId` do token; P2002 → 409 (codigoLpr unico)
- `PUT /api/obras/:obraId/cameras/:id` — ADMIN_EMPRESA+, verifica obra E camera separadamente (dupla barreira — T-02-21)
- `DELETE /api/obras/:obraId/cameras/:id` — ADMIN_EMPRESA+, soft-delete

### index.ts
Importa `protectedPipeline` de `./middleware/pipeline` (nao re-exporta mais). Registra rotas com spread:
```
app.use('/api/obras', ...protectedPipeline, obrasRouter)
app.use('/api/obras/:obraId/cameras', ...protectedPipeline, camerasRouter)
```

### Tests (11 tests, all green)
- obras.test.ts: 6 testes (GET com OPERADOR, POST bloqueado por OPERADOR, POST com ADMIN, validacao de body, P2025→404, soft-delete)
- cameras.test.ts: 5 testes (GET com obraId, POST bloqueado, POST com empresaId do token, P2002→409, soft-delete)
- Pattern: `vi.hoisted()` para `mockRequireRole`, `vi.mock` para pipeline e rbac, `buildTenantClient()` com vi.fn(), `buildApp()` injetando req.user e req.tenantClient
- lpr.test.ts continua verde (Phase 1 nao quebrada)

## Verification Results

```
Test Files  3 passed (3)
Tests  16 passed (16)
TypeScript: 0 errors (tsc --noEmit)
```

## Security (Threat Model Coverage)

| Threat ID | Mitigation Applied |
|-----------|-------------------|
| T-02-20 | IDOR obras: findFirstOrThrow via tenantClient antes de PUT/DELETE; P2025→404 generico |
| T-02-21 | IDOR cameras: verifica obra E camera separadamente antes de mutar |
| T-02-22 | empresaId lido de req.user.empresaId; campo do body ignorado completamente |
| T-02-23 | requireRole('ADMIN_EMPRESA','SUPER_ADMIN') em POST/PUT/DELETE → 403 antes de DB |
| T-02-24 | P2025 retorna 404 sem revelar existencia do registro de outro tenant |
| T-02-25 | P2002 capturado → 409 Conflict |

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] PostgreSQL nao acessivel via localhost:5432**
- **Found during:** Task 1 — `prisma db push` falhou com P1001
- **Issue:** Docker Compose nao expoe porta 5432 ao host; container esta na rede `sentinel` interna
- **Fix:** Executado `ALTER TABLE "Obra" ADD COLUMN IF NOT EXISTS ativo BOOLEAN NOT NULL DEFAULT true` e idem para Camera via `docker compose exec postgres psql`; depois `prisma generate` para regenerar o client
- **Files modified:** packages/database/prisma/schema.prisma (schema atualizado); schema DB via docker exec
- **Commit:** e3eecad

**2. [Rule 1 - Bug] vi.hoisted necessario para mockRequireRole**
- **Found during:** Task 2 — TDD RED falhou com "Cannot access 'mockRequireRole' before initialization"
- **Issue:** `vi.mock` factory eh hoisted pelo Vitest antes das declaracoes de variaveis; `mockRequireRole = vi.fn()` nao estava disponivel quando a factory executou
- **Fix:** Envolvido em `vi.hoisted(() => { const mockRequireRole = vi.fn(); return { mockRequireRole }; })` — mesmo padrao do tenant.test.ts
- **Files modified:** obras.test.ts, cameras.test.ts
- **Commit:** b9abb7a

## Known Stubs

None — todas as rotas estao implementadas e testadas com comportamento real.

## Threat Flags

None — nenhuma superficie nova alem do documentado no threat_model do plano.

## Self-Check: PASSED

- [x] `apps/api/src/middleware/pipeline.ts` — EXISTS
- [x] `apps/api/src/routes/obras.ts` — EXISTS
- [x] `apps/api/src/routes/cameras.ts` — EXISTS
- [x] `apps/api/src/routes/obras.test.ts` — EXISTS
- [x] `apps/api/src/routes/cameras.test.ts` — EXISTS
- [x] Commit e3eecad — EXISTS (git log confirmed)
- [x] Commit b9abb7a — EXISTS (git log confirmed)
- [x] 16 tests pass — CONFIRMED
- [x] tsc --noEmit — 0 errors CONFIRMED
