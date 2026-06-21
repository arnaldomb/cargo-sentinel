---
phase: "4"
plan: "03"
subsystem: "realtime / socket.io"
tags: [socket.io, realtime, cross-site, dto, typing, intel]
dependency_graph:
  requires:
    - "04-02: emitAlertaCrossSite stub em server.ts, alert-worker.ts com processAlertJob"
  provides:
    - "CrossSiteAlertDTO — tipo wire exportado de dto.ts para uso no frontend (Plan 04-04)"
    - "emitAlertaCrossSite(empresaId, payload: CrossSiteAlertDTO) — função tipada em server.ts"
    - "'feed:alerta-cross-site' no union de emitToEmpresa — tipo validado em compile time"
  affects:
    - "apps/api/src/realtime/dto.ts — novo tipo CrossSiteAlertDTO"
    - "apps/api/src/realtime/server.ts — union expandido + tipagem da função"
    - "apps/api/src/realtime/server.test.ts — 2 novos testes de room targeting"
    - "apps/api/src/jobs/alert-worker.ts — fix ordem args ioredis SET NX EX"
    - "apps/api/src/jobs/alert-worker.test.ts — assertions corrigidas para nova ordem"
tech_stack:
  added: []
  patterns:
    - "CrossSiteAlertDTO como type (não interface) — consistente com FeedItem e CameraStatusItem"
    - "import type from dto.ts em server.ts — zero custo runtime, tipagem em compile time"
    - "emitToEmpresa union expandido — TypeScript impede emissão de evento não declarado"
decisions:
  - "CrossSiteAlertDTO definido em dto.ts (não em alert-worker.ts) — única fonte de verdade para o contrato wire do frontend"
  - "emitAlertaCrossSite recebe empresaId separado do payload — consistente com emitEventoNovo/emitCameraStatus"
  - "ioredis SET order: 'EX', ttl, 'NX' (não 'NX', 'EX', ttl) — corrigido para match com tipagem ioredis"
key_files:
  created: []
  modified:
    - "apps/api/src/realtime/dto.ts"
    - "apps/api/src/realtime/dto.test.ts"
    - "apps/api/src/realtime/server.ts"
    - "apps/api/src/realtime/server.test.ts"
    - "apps/api/src/jobs/alert-worker.ts"
    - "apps/api/src/jobs/alert-worker.test.ts"
metrics:
  duration: "5 min"
  completed_date: "2026-06-21"
  tasks_completed: 2
  tasks_total: 2
  files_created: 0
  files_modified: 6
---

# Phase 4 Plan 03: Socket.IO Cross-Site Alert Emission Summary

**One-liner:** `CrossSiteAlertDTO` exportado de `dto.ts`, `emitAlertaCrossSite` tipada com o DTO em `server.ts`, e `'feed:alerta-cross-site'` adicionado ao union de `emitToEmpresa` — contrato wire entre backend e frontend (Plan 04-04) estabelecido.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Adicionar CrossSiteAlertDTO ao dto.ts | 7b5fa1a | apps/api/src/realtime/dto.ts, dto.test.ts |
| 2 | Implementar emitAlertaCrossSite tipada + testes | 792e5d3 | apps/api/src/realtime/server.ts, server.test.ts, jobs/alert-worker.ts, alert-worker.test.ts |

## Socket.IO Event Contract

### Evento emitido pelo servidor
```
Evento: 'feed:alerta-cross-site'
Room: 'empresa:{empresaId}'
Direção: servidor → cliente (nunca cliente → servidor)
```

### Payload — CrossSiteAlertDTO

Exportado de `apps/api/src/realtime/dto.ts`:

```typescript
export type CrossSiteAlertDTO = {
  empresaId: string;
  placaNumero: string;
  classificacao: 'SUSPEITO' | 'CRITICO';
  obraDetectadaId: string;
  obraDetectadaNome: string;    // nome da obra onde a placa foi detectada agora
  obraClassificacaoId: string;  // ID da obra onde foi originalmente classificada
  obraClassificacaoNome: string; // nome da obra de origem (para exibir no alerta)
  eventoId: string;
  timestamp: string;            // ISO 8601
};
```

**Para o frontend (Plan 04-04):**
```typescript
import type { CrossSiteAlertDTO } from '../../api/src/realtime/dto';
// ou via pacote shared se monorepo expor o tipo

socket.on('feed:alerta-cross-site', (payload: CrossSiteAlertDTO) => {
  // payload.obraDetectadaNome: "onde está agora"
  // payload.obraClassificacaoNome: "onde foi classificado originalmente"
  // payload.classificacao: 'SUSPEITO' | 'CRITICO'
});
```

## Função emitAlertaCrossSite

```typescript
// apps/api/src/realtime/server.ts
export function emitAlertaCrossSite(empresaId: string, payload: CrossSiteAlertDTO): void {
  emitToEmpresa(getRealtimeServer(), empresaId, 'feed:alerta-cross-site', payload);
}
```

Chamada pelo alert-worker via dynamic import:
```typescript
// apps/api/src/jobs/alert-worker.ts (Plan 04-02)
const { emitAlertaCrossSite } = await import('../realtime/server');
emitAlertaCrossSite(data.payload.empresaId, data.payload);
```

## emitToEmpresa — Union Expandido

```typescript
export function emitToEmpresa(
  io: IoLike,
  empresaId: string,
  event: 'feed:evento-novo' | 'feed:placa-classificada' | 'feed:camera-status' | 'feed:alerta-cross-site',
  payload: unknown,
): void
```

TypeScript agora rejeita em tempo de compilação qualquer string de evento não declarada neste union.

## Test Results

```
Tests  21 passed (21)

  realtime/server.test.ts — 9 testes (7 existentes + 2 novos)
    emitAlertaCrossSite via emitToEmpresa
      ✓ emite feed:alerta-cross-site para a room empresa:{empresaId}
      ✓ nunca emite para room de outra empresa ao disparar alerta cross-site

  realtime/dto.test.ts — 8 testes (6 existentes + 2 novos)
    CrossSiteAlertDTO
      ✓ aceita objeto com todos os campos obrigatórios de alerta cross-site
      ✓ aceita classificacao CRITICO

  realtime/auth.test.ts — 4 testes (existentes, todos passando)

tsc --noEmit: zero erros
```

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Ordem de argumentos ioredis SET NX EX em alert-worker.ts**
- **Found during:** Task 2 — `tsc --noEmit` revelou erro TS2769 em `alert-worker.ts:52` após limpar o erro de `server.ts`
- **Issue:** `redis.set(key, '1', 'NX', 'EX', ttl)` — ioredis exige ordem `'EX', ttl, 'NX'`; erro pré-existente do Plan 04-02 mascarado pelo erro de `server.ts`
- **Fix:** Alterada a ordem para `redis.set(key, '1', 'EX', ttl, 'NX')` e atualizadas as assertions dos testes correspondentes
- **Files modified:** `apps/api/src/jobs/alert-worker.ts`, `apps/api/src/jobs/alert-worker.test.ts`
- **Commit:** 792e5d3
- **Comportamento em runtime:** Inalterado — Redis aceita ambas as ordens; o fix resolve apenas o erro de tipagem TypeScript

## Known Stubs

Nenhum — este plano implementa tipagem e função de emissão. O `eventoId: idempotencyKey` stub documentado no Plan 04-02 permanece em `worker.ts` (fora do escopo deste plano).

## Threat Flags

Nenhum novo threat surface introduzido.

- T-04-10 (Tampering): verificado — servidor apenas emite para `'feed:alerta-cross-site'`, nunca processa eventos deste canal vindos do cliente. Socket.IO rooms são server-controlled.
- T-04-09 (Information Disclosure): aceito — `obraClassificacaoId` no payload é ID interno não sensível, necessário para o frontend construir o link "Ver obra".

## Self-Check: PASSED

- `apps/api/src/realtime/dto.ts` — FOUND, `CrossSiteAlertDTO` exportado
- `apps/api/src/realtime/server.ts` — FOUND, `emitAlertaCrossSite` exportada, `'feed:alerta-cross-site'` no union
- `apps/api/src/realtime/server.test.ts` — FOUND, 2 novos testes passando
- `apps/api/src/jobs/alert-worker.ts` — FOUND, ordem ioredis corrigida
- `tsc --noEmit` — zero erros
- `vitest run src/realtime/` — 21/21 testes passando
- Commits: 7b5fa1a, 792e5d3 — presentes em `git log`
