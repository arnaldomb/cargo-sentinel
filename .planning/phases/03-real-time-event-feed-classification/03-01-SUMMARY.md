---
phase: 03
plan: "01"
title: "Modelo Placa + Auditoria + Reclassificação"
subsystem: backend-domain
tags:
  - prisma
  - domain-model
  - audit-trail
  - tenant-isolation
  - lpr-pipeline
dependency_graph:
  requires:
    - 02-04-PLAN.md  # protectedPipeline, authMiddleware, tenantMiddleware
  provides:
    - Placa model (tenant-scoped)
    - ClassificacaoHistorico model (audit trail)
    - PATCH /api/placas/:placaId/classificacao
    - Placa upsert no pipeline LPR
  affects:
    - 03-02 e posteriores (feed em tempo real e alertas usarão Placa como fonte de verdade)
tech_stack:
  added:
    - Prisma model Placa com unique([numero, empresaId])
    - Prisma model ClassificacaoHistorico
    - emitPlacaClassificada via Socket.IO (feed:placa-classificada)
  patterns:
    - tenantClient.placa.findFirstOrThrow -> isolamento cross-tenant via P2025
    - prisma.placa.upsert com update:{} -> upsert idempotente no worker
    - ClassificacaoHistorico -> log de auditoria com usuarioId, classificacaoDe/Para
key_files:
  created:
    - apps/api/src/routes/placas.ts
    - apps/api/src/jobs/worker.test.ts
    - apps/api/src/routes/placas.test.ts
  modified:
    - packages/database/prisma/schema.prisma
    - apps/api/src/jobs/worker.ts
    - apps/api/src/index.ts
decisions:
  - "findFirstOrThrow via tenantClient garante isolamento cross-tenant sem verificação manual de empresaId"
  - "upsert com update:{} no worker é idempotente: replays do BullMQ não sobrescrevem classificacao existente"
  - "ClassificacaoHistorico registra classificacaoDe nullable para primeira reclassificação após criação automática"
metrics:
  duration: ~30min (código pré-existente de run interrompida; revisão + commit)
  completed: 2026-06-21
  tasks_completed: 4
  files_modified: 6
---

# Phase 03 Plan 01: Modelo Placa + Auditoria + Reclassificação

**One-liner:** Entidade Placa tenant-scoped com auditoria em ClassificacaoHistorico e endpoint PATCH autenticado para reclassificação, integrando o pipeline LPR como fonte de verdade de classificação.

## What Was Built

### Task 1 — Schema Prisma expandido (commit f4a12dc)

Adicionado ao `packages/database/prisma/schema.prisma`:

- **model Placa**: unique([numero, empresaId]), classificacao default VISITANTE, relação com Empresa, Evento[] e ClassificacaoHistorico[]
- **model ClassificacaoHistorico**: rastreio completo com placaId, empresaId, classificacaoDe (nullable), classificacaoPara, usuarioId e timestamps
- **model Evento**: campo placaId (String?) e relação `placa Placa?` para JOIN eficiente
- Índices adicionados: `@@index([empresaId, classificacao])` em Placa e três índices em ClassificacaoHistorico para queries por placa, empresa e usuário

Schema validado (`prisma validate`) e aplicado ao banco (`prisma db push` — banco já estava sincronizado).

### Task 2 — Pipeline LPR com upsert de Placa (commit 76264b3)

Ajustado `apps/api/src/jobs/worker.ts`:

- `prisma.placa.upsert` por `(numero, empresaId)` antes de criar Evento
- Placa nova criada com `classificacao: 'VISITANTE'`
- `placaId` e `placa.classificacao` salvo no Evento como snapshot no momento da leitura
- empresaId sempre resolvido via `camera.empresaId` (fonte confiável do DB)

### Task 3 — Rota de classificação (commit 3c0bfb5)

Criado `apps/api/src/routes/placas.ts`:

- `PATCH /api/placas/:placaId/classificacao`
- Roles permitidas: `ADMIN_EMPRESA` e `OPERADOR` (via `requireRole`)
- Validação de enum antes de qualquer query (400 early-return)
- `tenantClient.placa.findFirstOrThrow` — P2025 → 404 garante isolamento cross-tenant
- `tenantClient.placa.update` atualiza classificacao e observacao
- `tenantClient.classificacaoHistorico.create` grava linha de auditoria com usuarioId e transição de/para
- Emite `feed:placa-classificada` via Socket.IO para dashboards em tempo real
- Montado em `/api/placas` com `protectedPipeline` em `apps/api/src/index.ts`

### Task 4 — Testes (commit 733919f)

**`apps/api/src/jobs/worker.test.ts`** (2 testes):
- Cobre criação automática de Placa com VISITANTE e gravação de placaId em Evento
- Cobre remoção de ImageBase64 do rawPayload antes de persistir (LPR-04)

**`apps/api/src/routes/placas.test.ts`** (3 testes):
- Reclassificação dentro do tenant com verificação de auditoria completa (classificacaoDe/Para, usuarioId)
- 404 quando placa não pertence ao tenant (P2025 via tenantClient isolado)
- 400 para classificação inválida sem chamar nenhuma query

**Resultado:** 55 testes passando, 15 arquivos de teste.

## Deviations from Plan

Nenhuma. O código já estava implementado de uma execução anterior interrompida. Esta execução verificou a conformidade com o plano, rodou todas as verificações e comitou atomicamente por tarefa.

## Acceptance Criteria Verification

- [x] Nova placa detectada é criada tenant-scoped com classificação VISITANTE
- [x] Placa é única por (numero + empresaId) — constraint `@@unique`
- [x] Reclassificação atualiza `Placa.classificacao`
- [x] Cada reclassificação cria 1 linha em `ClassificacaoHistorico`
- [x] Rota não cruza tenant — `findFirstOrThrow` via `tenantClient` com P2025 → 404

## Self-Check: PASSED

Arquivos verificados:
- packages/database/prisma/schema.prisma — FOUND
- apps/api/src/jobs/worker.ts — FOUND
- apps/api/src/routes/placas.ts — FOUND
- apps/api/src/routes/placas.test.ts — FOUND
- apps/api/src/jobs/worker.test.ts — FOUND
- apps/api/src/index.ts — FOUND (rota montada em /api/placas)

Commits verificados:
- f4a12dc — feat(03-01): expandir schema Prisma — FOUND
- 76264b3 — feat(03-01): ajustar pipeline LPR — FOUND
- 3c0bfb5 — feat(03-01): criar rota PATCH — FOUND
- 733919f — test(03-01): adicionar testes — FOUND
