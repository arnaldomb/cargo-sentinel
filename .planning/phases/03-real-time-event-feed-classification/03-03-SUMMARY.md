---
phase: 03
plan: 03
title: Feed REST + Status de Câmeras + Emissão Realtime
status: complete
completed: 2026-06-21
duration_minutes: 20
subsystem: api
tags: [rest, feed, camera-status, realtime, dto, pagination, tenant-isolation]
requirements: [REALTIME-03, REALTIME-05, REALTIME-07]

dependency_graph:
  requires:
    - 03-01-PLAN.md
    - 03-02-PLAN.md
  provides:
    - GET /api/eventos/feed (cursor-based pagination)
    - GET /api/cameras/status (online/offline)
    - FeedItem + CameraStatusItem DTOs
    - feed:evento-novo, feed:placa-classificada, feed:camera-status emissões
  affects:
    - apps/api/src/realtime/
    - apps/api/src/routes/

tech_stack:
  added: []
  patterns:
    - cursor-based keyset pagination (take limit+1, skip 1)
    - DTO builder functions centralizando mapeamento de modelo para wire type
    - calcCameraStatus com janela determinística de 5 min para online/offline

key_files:
  created:
    - apps/api/src/realtime/dto.ts
    - apps/api/src/realtime/dto.test.ts
    - apps/api/src/routes/eventos.ts
    - apps/api/src/routes/eventos.test.ts
    - apps/api/src/routes/camera-status.ts
    - apps/api/src/routes/camera-status.test.ts
  modified:
    - apps/api/src/realtime/server.test.ts

decisions:
  - cursor keyset via id campo (take limit+1 + skip 1) — evita offset instável em lista ordenada por timestamp
  - calcCameraStatus aceita `now: Date` como parâmetro para facilitar testes determinísticos
  - dto.ts centraliza FeedItem e CameraStatusItem — única fonte da verdade para REST e Socket.IO

metrics:
  tasks_completed: 5
  files_created: 6
  files_modified: 1
  tests_added: 14
  tests_total: 69
---

# Phase 03 Plan 03: Feed REST + Status de Câmeras + Emissão Realtime Summary

**One-liner:** Feed REST paginado por cursor com presigned thumbnails, status online/offline de câmeras e DTO builders centralizados para REST e Socket.IO tenant-scoped.

## What Was Built

### Task 1 — DTO builders (`apps/api/src/realtime/dto.ts`)
Tipos e funções de mapeamento estáveis para o wire layer:
- `FeedItem` e `CameraStatusItem` — tipos exportados usados por REST e Socket.IO
- `eventoToFeedItem(evento, thumbnailUrl)` — mapeia row Prisma para FeedItem
- `calcCameraStatus(camera, ultimoEvento, now?)` — calcula online/offline com janela de 5 min; aceita `now` para testes determinísticos

### Task 2 — Feed REST (`apps/api/src/routes/eventos.ts`)
`GET /api/eventos/feed?limit=50&cursor=<eventoId>`
- Paginação cursor-based: `take limit+1` detecta próxima página; `cursor: { id }` + `skip: 1` pula o item âncora
- Joins com `obra` e `camera`; `thumbnailUrl` gerada via `getPresignedUrl` apenas quando `fotoGarageKey` não é null
- `nextCursor` é o `id` do último item da página atual; null quando não há mais páginas
- Isolamento garantido pelo `req.tenantClient` — nunca passa `empresaId` no filtro explícito

### Task 3 — Status REST de câmeras (`apps/api/src/routes/camera-status.ts`)
`GET /api/cameras/status`
- `groupBy(['cameraId'])` + `_max: { timestamp }` — um único SELECT agregado para todos as câmeras
- `online` = `now - ultimoEvento <= 300_000ms`; `offline` caso contrário ou sem evento registrado
- Câmeras com `ativo: false` excluídas do resultado

### Task 4 — Wiring de emissões (já implementado em 03-01/03-02)
- `worker.ts`: emite `feed:evento-novo` e `feed:camera-status` após persistir evento
- `placas.ts`: emite `feed:placa-classificada` após reclassificação
- `index.ts`: monta `/api/eventos` e `/api/cameras` sob `protectedPipeline`

### Task 5 — Testes
- `dto.test.ts`: eventoToFeedItem com todos campos, thumbnailUrl null, placaId null; calcCameraStatus online/offline/sem evento/limite exato
- `eventos.test.ts`: shape esperado, cross-tenant isolation, nextCursor presente/ausente, passagem de cursor para findMany, thumbnailUrl null quando sem foto
- `server.test.ts`: emit helpers verificam room `empresa:{empresaId}` para os 3 eventos; garante não emitir para room de outro tenant

## Verification Results

```
Tests:  69 passed (69) — 16 test files
Build:  tsc — exit 0
```

## Deviations from Plan

### Auto-additions (Rule 2)

**1. [Rule 2 - Missing] Cursor pagination não estava implementada no eventos.ts existente**
- **Found during:** Task 2
- **Issue:** O arquivo `eventos.ts` vindo do plano anterior retornava `nextCursor: null` sem lógica real de cursor
- **Fix:** Implementada paginação keyset com `take limit+1`, `cursor: { id }`, `skip: 1` e detecção de `hasMore`
- **Files modified:** `apps/api/src/routes/eventos.ts`

**2. [Rule 2 - Missing] Testes de eventos ausentes para cursor e cross-tenant**
- **Found during:** Task 5
- **Issue:** O teste existente só verificava o shape básico — sem cursor, sem isolamento cross-tenant
- **Fix:** Adicionados 4 novos cenários de teste em `eventos.test.ts`

## Known Stubs

None — todos os endpoints retornam dados reais do banco via tenantClient.

## Self-Check: PASSED

| Item | Result |
|------|--------|
| `apps/api/src/realtime/dto.ts` | FOUND |
| `apps/api/src/routes/eventos.ts` | FOUND |
| `apps/api/src/routes/camera-status.ts` | FOUND |
| commit 10d0c53 (feat dto.ts) | FOUND |
| commit c7c9012 (feat eventos feed) | FOUND |
| commit 590ff83 (feat camera-status) | FOUND |
| commit 43d58cb (test cobertura) | FOUND |
