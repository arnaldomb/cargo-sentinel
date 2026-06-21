---
phase: 03
plan: 02
subsystem: realtime
tags: [socket.io, auth, multitenancy, rooms, jwt]
dependency_graph:
  requires:
    - 02-02-PLAN.md  # decryptAuthToken + AUTH_COOKIE_NAMES de middleware/auth.ts
    - 03-01-PLAN.md  # index.ts com http.createServer já commitado
  provides:
    - Socket.IO server inicializado e exportado de index.ts
    - Autenticação de socket via cookie JWE
    - Rooms tenant-safe empresa:{empresaId}
    - Helpers emitEventoNovo, emitPlacaClassificada, emitCameraStatus
  affects:
    - apps/api/src/index.ts (já modificado no plano 03-01)
    - apps/api/src/routes/placas.ts (usa emitPlacaClassificada)
tech_stack:
  added: []
  patterns:
    - Socket.IO io.use() middleware para autenticação antes de aceitar conexão
    - Room nomeada empresa:{empresaId} derivada exclusivamente do JWT — browser não controla join
    - Singleton ioInstance acessível via getRealtimeServer()
key_files:
  created:
    - apps/api/src/realtime/auth.ts
    - apps/api/src/realtime/server.ts
    - apps/api/src/realtime/auth.test.ts
    - apps/api/src/realtime/server.test.ts
  modified:
    - apps/api/src/index.ts  # http.createServer + io exportados (commit 3c0bfb5, plano 03-01)
decisions:
  - SUPER_ADMIN sem empresaId tem conexão rejeitada — por ora não há caso de uso para SUPER_ADMIN no realtime; se necessário no futuro, criar room separada super:admin
  - Fallback Bearer token no header Authorization mantido para desenvolvimento/CLI
  - RealtimeUser estende AuthenticatedUser com empresaId garantidamente string (não null)
metrics:
  duration_minutes: 15
  completed_date: 2026-06-21
  tasks_completed: 4
  files_changed: 4
---

# Phase 03 Plan 02: Socket.IO + Auth de Tenant + Rooms Seguras Summary

Socket.IO integrado ao Express via http.Server compartilhado, com autenticação por cookie JWE reutilizando decryptAuthToken da Fase 2 e rooms fixas por empresaId que o browser jamais controla.

## Tasks Completed

| Task | Description | Commit | Files |
|------|-------------|--------|-------|
| 1 | Bootstrap http.Server + Socket.IO em index.ts | `3c0bfb5` (03-01) | apps/api/src/index.ts |
| 2 | Middleware de auth do socket (auth.ts) | `93b47a6` | apps/api/src/realtime/auth.ts |
| 3 | Módulo realtime tenant-safe (server.ts) | `785777b` | apps/api/src/realtime/server.ts |
| 4 | Testes de auth e server | `124dc81` | apps/api/src/realtime/auth.test.ts, server.test.ts |

## Implementation Notes

### Task 1 — Bootstrap do servidor

O `index.ts` já foi adaptado no plano 03-01 (commit `3c0bfb5`): `app.listen()` substituído por `http.createServer(app)`, e `createRealtimeServer(httpServer)` inicializa o Socket.IO. Ambos exportados como `httpServer` e `io`.

### Task 2 — Middleware de auth do socket

`realtime/auth.ts` lê o cookie de sessão (`authjs.session-token` ou `__Secure-authjs.session-token`) do handshake do socket, delega a decriptação para `decryptAuthToken` de `middleware/auth.ts` (sem duplicar lógica JWE/HKDF). Rejeita se `empresaId` for null — SUPER_ADMIN não tem acesso ao feed realtime neste momento.

### Task 3 — Módulo realtime tenant-safe

`realtime/server.ts` expõe:
- `createRealtimeServer(server)` — registra `io.use(authenticateSocket)` e `io.on('connection', handleRealtimeConnection)`
- `handleRealtimeConnection(socket)` — faz `socket.join('empresa:{empresaId}')` derivado do token
- `emitToEmpresa(io, empresaId, event, payload)` — única API de emissão; usa `io.to(room).emit()` **nunca** `io.emit()`
- `emitEventoNovo`, `emitPlacaClassificada`, `emitCameraStatus` — wrappers tipados para uso nas rotas

### Task 4 — Testes

7 testes cobrindo:
- Extração de token de cookies normal e `__Secure-` (HTTPS)
- Autenticação com empresaId presente → popula socket.data.user
- Rejeição de SUPER_ADMIN sem empresaId
- `buildEmpresaRoom` retorna formato correto
- `handleRealtimeConnection` chama `socket.join` com a room correta
- `emitToEmpresa` chama `io.to(room).emit()` e nunca bypassa a room

## Verification Results

```
pnpm --filter @cargo-sentinel/api test -- --run src/realtime
  Test Files  15 passed (15)
  Tests       55 passed (55)

pnpm --filter @cargo-sentinel/api build
  (sem erros de TypeScript)
```

## Acceptance Criteria Check

- [x] Toda conexão autenticada entra automaticamente em `empresa:{empresaId}`
- [x] Nenhuma API de emissão usa `io.emit()`
- [x] O browser não escolhe a room (join é feito no servidor via token)
- [x] Conexão sem token válido é rejeitada
- [x] Conexão com token sem empresaId é rejeitada

## Deviations from Plan

### Nota de ordem de execução

Task 1 (bootstrap do index.ts) foi executada como parte do plano 03-01 (commit `3c0bfb5`), pois o endpoint `/api/placas/:placaId/classificacao` já chamava `emitPlacaClassificada`. A task foi concluída corretamente; apenas o commit pertence ao plano anterior.

Nenhuma outra divergência — plano executado conforme especificado.

## Known Stubs

Nenhum.

## Threat Flags

| Flag | File | Description |
|------|------|-------------|
| threat_flag: broadcast | apps/api/src/realtime/server.ts | emitToEmpresa expõe path para emissão multi-tenant; qualquer chamador deve passar empresaId confiável (derivado do DB, não do cliente) |

## Self-Check: PASSED

- apps/api/src/realtime/auth.ts: FOUND
- apps/api/src/realtime/server.ts: FOUND
- apps/api/src/realtime/auth.test.ts: FOUND
- apps/api/src/realtime/server.test.ts: FOUND
- Commit 93b47a6: FOUND
- Commit 785777b: FOUND
- Commit 124dc81: FOUND
