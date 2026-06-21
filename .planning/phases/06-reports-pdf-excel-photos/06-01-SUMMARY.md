---
phase: "06-reports-pdf-excel-photos"
plan: "06-01"
subsystem: "database, api/jobs"
tags: ["prisma", "bullmq", "reports", "schema", "queue"]
dependency_graph:
  requires: []
  provides: ["Relatorio model", "reportQueue", "ReportJobPayload type", "startReportWorker stub"]
  affects: ["packages/database", "apps/api/src/jobs"]
tech_stack:
  added: ["pdfkit@^5.x", "exceljs@^4.x", "@types/pdfkit"]
  patterns: ["BullMQ separate-connection pattern", "Prisma Json filtros field"]
key_files:
  created:
    - apps/api/src/jobs/report-worker.ts
  modified:
    - packages/database/prisma/schema.prisma
    - apps/api/src/jobs/queue.ts
    - apps/api/src/index.ts
    - apps/api/package.json
    - pnpm-lock.yaml
decisions:
  - "prisma db push usado (não migrate dev) — banco estava em drift sem histórico de migração; deploy usa prisma migrate deploy via docker-compose"
  - "formato armazenado como String ('PDF'|'XLSX') e não enum Prisma — evita future migration ao adicionar formatos"
  - "report-worker registrado via dynamic import() em index.ts (mesmo padrão do alert-worker)"
metrics:
  duration: "~10 min"
  completed: "2026-06-21"
  tasks_completed: 2
  files_modified: 5
---

# Phase 06 Plan 01: Schema + Report Queue Summary

**One-liner:** Model Relatorio com enum RelatorioStatus e fila BullMQ 'report-jobs' (concurrency 2) como infraestrutura assíncrona para geração de PDF/Excel.

## What Was Built

### Task 1: Model Relatorio no schema Prisma (commit `8f7d397`)

Adicionado ao `packages/database/prisma/schema.prisma`:

**Enum `RelatorioStatus`:**
- `PENDENTE` — job enfileirado, aguardando worker
- `PROCESSANDO` — worker iniciou processamento
- `PRONTO` — arquivo gerado e gravado no Garage
- `ERRO` — falha no processamento (detalhe em `erroMsg`)

**Model `Relatorio`:**
| Campo | Tipo | Descrição |
|-------|------|-----------|
| `id` | `String @id @default(cuid())` | Identificador único |
| `empresaId` | `String` | FK para Empresa (tenant-scoped) |
| `status` | `RelatorioStatus @default(PENDENTE)` | Ciclo de vida |
| `formato` | `String` | `"PDF"` ou `"XLSX"` |
| `filtros` | `Json` | `{ dataInicio?, dataFim?, obraId?, cameraId?, classificacao?, placa? }` |
| `garageKey` | `String?` | Path no Garage quando PRONTO: `reports/{empresaId}/{id}.pdf|.xlsx` |
| `expiresAt` | `DateTime?` | now() + 1h ao marcar PRONTO (REPORTS-07) |
| `erroMsg` | `String?` | Mensagem de erro quando status = ERRO |
| `criadoPor` | `String` | userId do solicitante (NOT NULL) |
| `criadoEm` | `DateTime @default(now())` | Timestamp de criação |
| `atualizadoEm` | `DateTime @updatedAt` | Timestamp de atualização |

**Índices:**
- `@@index([empresaId, criadoEm(sort: Desc)])` — listagem tenant-scoped paginada
- `@@index([criadoPor, criadoEm(sort: Desc)])` — filtrar por usuário

**Relações inversas adicionadas:**
- `Empresa.relatorios Relatorio[]`
- `User.relatorios Relatorio[] @relation("RelatoriosUsuario")`

**Aplicação:** `prisma db push` aplicado com sucesso. `prisma generate` rodado — client v7.8.0 regenerado.

> Nota de deploy: banco de desenvolvimento estava em drift (tabelas existentes sem histórico de migration). Foi usado `prisma db push` para sincronizar sem destruir dados. Em produção, usar `prisma migrate deploy` via docker-compose entrypoint com as migrations geradas.

### Task 2: reportQueue + report-worker.ts stub (commit `b7fcd45`)

**`apps/api/src/jobs/queue.ts`** — `reportQueue` adicionado ao final:
- Nome da fila: `'report-jobs'`
- Conexão Redis independente (padrão Pitfall 5 do projeto)
- `defaultJobOptions`: attempts 2, backoff exponencial 3s, removeOnComplete 1h, removeOnFail 24h

**`apps/api/src/jobs/report-worker.ts`** — criado como stub compilável:
- Exporta `ReportJobPayload` (tipo do payload da fila)
- Exporta `startReportWorker()` — instancia Worker com concurrency 2
- `processReportJob` stub: loga e lança `Error('stub: não implementado ainda')`
- Singleton pattern (`workerInstance`) evita múltiplas instâncias
- Event listeners: `completed` e `failed` logam status

**`apps/api/src/index.ts`** — dynamic import adicionado no bootstrap:
```typescript
import('./jobs/report-worker'); // REPORTS-01: report worker stub, concurrency 2
```

### Dependências instaladas (commit `98a6ebc`)

| Pacote | Versão | Uso |
|--------|--------|-----|
| `pdfkit` | ^5.x | Geração de PDF com imagens (fotos LPR) |
| `exceljs` | ^4.x | Geração de planilhas XLSX |
| `@types/pdfkit` | latest | Tipagem TypeScript para pdfkit |

## Decisions Made

1. **`prisma db push` em vez de `migrate dev`** — O banco local estava em drift (tabelas existentes sem histórico de migration Prisma). `migrate dev` requer reset destrutivo. `db push` sincroniza sem perda de dados, adequado para desenvolvimento. Produção usa `migrate deploy`.

2. **`formato` como `String` e não enum Prisma** — Evita migration futura caso novos formatos sejam adicionados. Validação do enum feito na camada de aplicação (route handler no plano 06-03).

3. **`criadoPor` NOT NULL** — Relatórios sempre têm dono identificado. Super Admin sem `empresaId` ainda tem `userId` válido; o `empresaId` do relatório vem do JWT do solicitante.

4. **Dynamic import no index.ts** — Segue o padrão já estabelecido para `alert-worker`. O `startReportWorker()` não é chamado explicitamente — o módulo auto-inicia via efeito colateral do import (padrão consistente com o restante da API).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocker] prisma migrate dev bloqueado por drift do banco**
- **Found during:** Task 1
- **Issue:** `prisma migrate dev` detectou drift entre banco e histórico de migration, exigindo `migrate reset` (destrutivo). O plano previa `migrate dev` mas também documentava `prisma generate` como fallback.
- **Fix:** Usado `prisma db push` (mencionado nas key_decisions do plano) para sincronizar sem reset. Client regenerado com `prisma generate`.
- **Files modified:** apenas comportamento de execução; schema não alterado
- **Commit:** `8f7d397`

## Known Stubs

| Stub | File | Line | Reason |
|------|------|------|--------|
| `processReportJob` throws always | `apps/api/src/jobs/report-worker.ts` | ~30 | Implementação completa no plano 06-02 |

Estes stubs são intencionais — plano 06-01 cria apenas infraestrutura. O plano 06-02 implementa a lógica de geração real.

## What Plan 06-02 Needs from This Plan

- `ReportJobPayload` type importado de `./report-worker`
- `reportQueue` importado de `./queue` para enfileirar jobs
- `Relatorio` model via Prisma client com todos os campos acima
- Nome da fila: `'report-jobs'` (constante hardcoded em ambos os arquivos)
- Concurrência do worker: 2

## Self-Check: PASSED

| Check | Result |
|-------|--------|
| `packages/database/prisma/schema.prisma` exists | FOUND |
| `apps/api/src/jobs/queue.ts` exists | FOUND |
| `apps/api/src/jobs/report-worker.ts` exists | FOUND |
| `apps/api/src/index.ts` exists | FOUND |
| Commit `8f7d397` (schema) | FOUND |
| Commit `b7fcd45` (queue + worker) | FOUND |
| Commit `98a6ebc` (dependencies) | FOUND |
| `pnpm prisma validate` | PASSED |
| `pnpm tsc --noEmit` (apps/api) | PASSED (no output = success) |
