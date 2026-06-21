---
phase: "4"
plan: "02"
subsystem: "cross-site intelligence + alert queue"
tags: [bullmq, redis, dedup, whatsapp, socket.io, worker, cross-site]
dependency_graph:
  requires:
    - "04-01: Placa.obraClassificacaoId, ConfiguracaoAlerta, sendAlertaWhatsApp()"
  provides:
    - "alertQueue 'alert-jobs' — fila BullMQ separada para processamento de alertas"
    - "alert-worker.ts — processAlertJob, checkAndSetDedup, formatWhatsAppMessage"
    - "Cross-site detection em worker.ts — detecta SUSPEITO/CRITICO em obra diferente"
    - "obraClassificacaoId update em placas.ts — registrado via último evento"
  affects:
    - "apps/api/src/jobs/worker.ts — lógica cross-site inserida após Placa upsert"
    - "apps/api/src/jobs/queue.ts — alertQueue adicionada"
    - "apps/api/src/realtime/server.ts — emitAlertaCrossSite stub adicionado"
    - "apps/api/src/routes/placas.ts — PATCH classificacao atualiza obraClassificacaoId"
    - "apps/api/src/index.ts — alert-worker importado no bootstrap"
tech_stack:
  added: []
  patterns:
    - "processAlertJob exportada separadamente do Worker — testável sem instanciar BullMQ"
    - "alertWorker = null em NODE_ENV=test — sem conexão Redis em testes"
    - "Redis SET NX EX — dedup atômico sem race condition"
    - "Deps injection no processAlertJob (emitCrossSite + redis) — mocking sem módulo override"
    - "obraClassificacaoId inferido via último evento — melhor esforço, sem dependência de body"
key_files:
  created:
    - "apps/api/src/jobs/alert-worker.ts"
    - "apps/api/src/jobs/alert-worker.test.ts"
  modified:
    - "apps/api/src/jobs/queue.ts"
    - "apps/api/src/jobs/worker.ts"
    - "apps/api/src/jobs/worker.test.ts"
    - "apps/api/src/routes/placas.ts"
    - "apps/api/src/routes/placas.test.ts"
    - "apps/api/src/realtime/server.ts"
    - "apps/api/src/index.ts"
decisions:
  - "processAlertJob recebe deps (emitCrossSite, redis) via injeção — evita mock de módulo em teste e facilita reutilização"
  - "alertWorker = null em test (não new Worker) — sem Redis no CI"
  - "obraClassificacaoId inferido via evento mais recente da placa (não via body) — mais robusto quando frontend não envia obraId"
  - "emitAlertaCrossSite adicionado como stub em realtime/server.ts — expandido em Plan 04-03"
  - "eventoId usa idempotencyKey como placeholder no crossSitePayload — evento.id real disponível após upsert em Plan 04-03"
metrics:
  duration: "10 min"
  completed_date: "2026-06-21"
  tasks_completed: 2
  tasks_total: 2
  files_created: 2
  files_modified: 7
---

# Phase 4 Plan 02: Cross-Site Detection + BullMQ Alert Queue Summary

**One-liner:** Detecção cross-site implementada no worker LPR (SUSPEITO/CRITICO em obra diferente de obraClassificacaoId) com fila BullMQ `alert-jobs`, alert-worker com dedup Redis 300s/900s e dispatch WhatsApp sequencial com concorrência 1.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Criar queue de alertas e alert-worker.ts | ca3cd79 | apps/api/src/jobs/queue.ts, alert-worker.ts, alert-worker.test.ts, realtime/server.ts |
| 2 | Modificar worker.ts — lógica cross-site + enfileiramento | ca74caa | apps/api/src/jobs/worker.ts, worker.test.ts, routes/placas.ts, placas.test.ts, index.ts |

## Cross-Site Detection Logic

Condição implementada em `worker.ts` após o `prisma.placa.upsert`:

```typescript
const isHighRisk =
  placa.classificacao === 'SUSPEITO' || placa.classificacao === 'CRITICO';

const isCrossSite =
  isHighRisk &&
  placa.obraClassificacaoId !== null &&
  placa.obraClassificacaoId !== camera.obraId;
```

**Casos tratados:**

| Cenário | Ação |
|---------|------|
| SUSPEITO/CRITICO + obraClassificacaoId diferente de camera.obraId | Enfileira `alert:cross-site` + `alert:whatsapp` |
| SUSPEITO/CRITICO + obraClassificacaoId === null (sem classificação registrada) | Enfileira apenas `alert:whatsapp` |
| SUSPEITO/CRITICO + mesma obra (obraClassificacaoId === camera.obraId) | Sem alerta cross-site |
| LIBERADO/VISITANTE/ATENCAO (qualquer obra) | Sem alerta |

## Alert Worker — Fluxo de Processamento

### Job `alert:cross-site`
1. Chama `emitAlertaCrossSite(empresaId, payload)` via Socket.IO
2. Captura exceção se socket não inicializado (não falha o job — BullMQ retenta se necessário)

### Job `alert:whatsapp`
1. Verifica dedup Redis: `SET alert:dedup:{empresaId}:{placa} 1 NX EX {ttl}`
2. Se chave já existe (`null` retornado) → skip (janela ativa)
3. Busca `ConfiguracaoAlerta` ativos para `obraId` + `empresaId` da obra detectada
4. Para cada número: chama `sendAlertaWhatsApp(telefone, mensagem)`
5. Falha em 1 número não cancela os demais — log de erro e continua

## TTLs de Deduplicação (ALERTS-04)

| Classificação | TTL Redis | Janela |
|---------------|-----------|--------|
| SUSPEITO | 300 segundos | 5 minutos |
| CRITICO | 900 segundos | 15 minutos |

Chave: `alert:dedup:{empresaId}:{placaNumero}`

## obraClassificacaoId — Como é Setado

Em `apps/api/src/routes/placas.ts`, PATCH `/:placaId/classificacao`:

```typescript
// Quando classificado como SUSPEITO ou CRITICO:
const ultimoEvento = await req.tenantClient!.evento.findFirst({
  where: { placaId },
  orderBy: { timestamp: 'desc' },
  select: { obraId: true },
});
if (ultimoEvento) {
  obraClassificacaoUpdate = { obraClassificacaoId: ultimoEvento.obraId };
}
```

Estratégia: infer da obra do evento mais recente — robusto mesmo quando frontend não envia `obraId` no body.

## Nomes dos Jobs na Fila

| Job name | Queue | Processado por |
|----------|-------|----------------|
| `alert:cross-site` | `alert-jobs` | `processAlertJob` → `emitAlertaCrossSite` |
| `alert:whatsapp` | `alert-jobs` | `processAlertJob` → `sendAlertaWhatsApp` |

## Teste Coverage

```
Tests  16 passed (16)
  alert-worker.test.ts — 10 testes
    checkAndSetDedup
      ✓ returns true on first call (key not set)
      ✓ returns false when key already exists
      ✓ uses 900s TTL for CRITICO
    formatWhatsAppMessage
      ✓ includes plate, classification, and both obra names
      ✓ uses CRITICO label for level 5
    processAlertJob — alert:cross-site
      ✓ calls emitCrossSite with correct payload
      ✓ does not throw when emitCrossSite throws (socket not initialized)
    processAlertJob — alert:whatsapp
      ✓ skips sending when dedup key exists
      ✓ sends to all active configured numbers when dedup passes
      ✓ continues sending to remaining numbers when one fails
  worker.test.ts — 3 testes (existentes, todos passando)
  placas.test.ts — 3 testes (existentes, todos passando)
```

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing Critical] emitAlertaCrossSite stub em realtime/server.ts**
- **Found during:** Task 1 — alert-worker.ts faz dynamic import de `emitAlertaCrossSite` de realtime/server
- **Issue:** A função não existia (prevista para Plan 04-03) — TypeScript e runtime falhariam
- **Fix:** Adicionado stub funcional `emitAlertaCrossSite` em server.ts que faz `emitToEmpresa` com evento `feed:alerta-cross-site`. Plan 04-03 expande com tipagem `CrossSiteAlertPayload`
- **Files modified:** `apps/api/src/realtime/server.ts`
- **Commit:** ca3cd79

## Known Stubs

| Stub | File | Line | Reason |
|------|------|------|--------|
| `eventoId: idempotencyKey` | apps/api/src/jobs/worker.ts | ~85 | evento.id real só disponível após `prisma.evento.upsert` (após o cross-site check). Plan 04-03 reestrutura para passar o eventoId real no payload |

O stub não impede o funcionamento — `idempotencyKey` é único por evento e serve como identificador temporário até Plan 04-03.

## Threat Flags

Nenhum novo threat surface introduzido além do que está no `<threat_model>` do plano.

- T-04-05: `empresaId` no payload vem de `camera.empresaId` (source DB — nunca do payload externo)
- T-04-06: dedup Redis 300s/900s implementado — máximo 1 WhatsApp por janela por (empresa, placa)
- T-04-08: `console.log` com `telefone` e `messageId` em cada envio

## Self-Check: PASSED

- `apps/api/src/jobs/alert-worker.ts` — FOUND
- `apps/api/src/jobs/alert-worker.test.ts` — FOUND, 10/10 testes passando
- `apps/api/src/jobs/queue.ts` — FOUND, `alertQueue` exportada
- `apps/api/src/jobs/worker.ts` — FOUND, `alert:cross-site` presente
- `apps/api/src/index.ts` — FOUND, `import('./jobs/alert-worker')` presente
- Commits: ca3cd79, ca74caa — presentes em `git log`
