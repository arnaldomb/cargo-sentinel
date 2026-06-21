---
phase: "06-reports-pdf-excel-photos"
plan: "06-02"
subsystem: "api/jobs, api/services, api/realtime"
tags: ["pdfkit", "exceljs", "bullmq", "garage", "socket.io", "reports", "thumbnails"]
dependency_graph:
  requires: ["06-01"]
  provides:
    - "generatePDF com thumbnails embutidos e layout A4 landscape"
    - "generateXLSX com imagens em células e linhas coloridas"
    - "uploadReportToGarage (chave reports/{empresaId}/{id}.ext)"
    - "getReportPresignedUrl (TTL 3600s REPORTS-07)"
    - "report-worker completo substituindo stub do 06-01"
    - "RelatorioProntoDTO e emitRelatorioPronto via Socket.IO"
  affects:
    - "apps/api/src/services/report-generator.ts"
    - "apps/api/src/jobs/report-worker.ts"
    - "apps/api/src/realtime/dto.ts"
    - "apps/api/src/realtime/server.ts"
tech_stack:
  added: []
  patterns:
    - "_thumbnailBuffer pattern: worker pré-carrega Buffer antes de chamar generate*"
    - "fetch nativo Node 24 com AbortController timeout 5s (sem node-fetch)"
    - "Thumbnail concorrência limitada a 10 em paralelo (batch loop)"
    - "as any cast para ExcelJS ImageRange (tipos conflitantes no index.d.ts)"
key_files:
  created:
    - apps/api/src/services/report-generator.ts
  modified:
    - apps/api/src/jobs/report-worker.ts
    - apps/api/src/realtime/dto.ts
    - apps/api/src/realtime/server.ts
decisions:
  - "fetch nativo Node 24 usado em vez de node-fetch — Node 18+ tem fetch global, node-fetch desnecessário"
  - "_thumbnailBuffer como campo interno na ReportEvento — worker pré-carrega buffer antes de chamar generate*, evitando fetch assíncrono dentro do loop pdfkit (que usa callbacks/stream)"
  - "as any para ExcelJS addImage tl/br — index.d.ts tem declarações conflitantes de Anchor; cast controlado com comentário explicativo"
  - "classificacao cast para never no where Prisma — filtros.classificacao é string; Prisma espera enum Classificacao; cast evita import circular de tipos Prisma no worker"
metrics:
  duration: "~25 min"
  completed: "2026-06-21"
  tasks_completed: 2
  files_modified: 4
---

# Phase 06 Plan 02: Report Generation Worker (pdfkit + exceljs + Garage) Summary

**One-liner:** Worker BullMQ com geração real de PDF (pdfkit A4 landscape) e Excel (exceljs com imagens por célula), thumbnails embutidos via Buffer pré-carregado, upload ao Garage e notificação Socket.IO para o tenant correto.

## What Was Built

### Task 1: `report-generator.ts` — funções de geração (commit `41f23ef`)

**`apps/api/src/services/report-generator.ts`** — criado com 6 exports públicos:

| Export | Descrição |
|--------|-----------|
| `generatePDF(eventos, filtros, empresaNome)` | PDF A4 landscape com pdfkit: header, tabela com thumbnails, cores por classificação |
| `generateXLSX(eventos, filtros, empresaNome)` | Excel com ExcelJS: imagens em célula A, linhas coloridas, auto-filter |
| `uploadReportToGarage(buffer, empresaId, relatorioId, formato)` | Upload via S3 interno, chave `reports/{empresaId}/{id}.pdf|xlsx` |
| `getReportPresignedUrl(key)` | Assina com `GARAGE_SERVER_URL` público, TTL 3600s (REPORTS-07) |
| `fetchImageBuffer(presignedUrl)` | Download de thumbnail com fetch nativo, timeout 5s, falha silenciosa |
| `ReportEvento`, `ReportFiltrosDisplay` | Tipos compartilhados entre worker e funções de geração |

**Layout PDF (pdfkit):**
- A4 landscape, margem 30px
- Cabeçalho: título, empresa, filtros ativos, contagem total
- Colunas: Foto (40x37px) | Placa | Obra | Câmera | Direção | Classificação | Horário
- Fundo de linha colorido por classificação (cores Tailwind)
- Paginação automática quando `doc.y > page.height - 80`

**Layout Excel (exceljs):**
- 3 linhas de cabeçalho (título, filtros, contagem)
- Row 4: cabeçalho da tabela com fundo azul `#003366`
- Rows 5+: dados com `row.height = 55`, cor de fundo por classificação
- Coluna A: imagem JPEG embutida via `wb.addImage`
- Auto-filter na row 4

**Cores por classificação:**
| Classificação | Fundo | Texto |
|--------------|-------|-------|
| LIBERADO | `#dcfce7` | `#15803d` |
| VISITANTE | `#f3f4f6` | `#374151` |
| ATENCAO | `#fef9c3` | `#92400e` |
| SUSPEITO | `#ffedd5` | `#9a3412` |
| CRITICO | `#fee2e2` | `#991b1b` |

### Task 2: `report-worker.ts` completo + DTO + Socket.IO (commit `1a91321`)

**`apps/api/src/jobs/report-worker.ts`** — substituiu o stub do 06-01:

Fluxo completo do worker:
1. Valida tenant: `relatorio.empresaId !== empresaId` → throw (T-06-04)
2. Atualiza status `PROCESSANDO`
3. Busca `empresa.nome` + resolve nomes de obra/câmera para o display
4. Constrói `where` idêntico ao route de eventos (REPORTS-04)
5. `findMany` com `take: 1000, orderBy: timestamp desc` (REPORTS-05)
6. Loop de thumbnails em batches de 10 com concorrência limitada (T-06-05)
7. Chama `generatePDF` ou `generateXLSX` com eventos + buffers pré-carregados
8. `uploadReportToGarage` → obtém `garageKey`
9. Atualiza `status: PRONTO, garageKey, expiresAt: now+1h` (REPORTS-07)
10. `getReportPresignedUrl` + `emitRelatorioPronto` via Socket.IO (REPORTS-06)
11. Em caso de erro: atualiza `status: ERRO, erroMsg` + re-throw para BullMQ

**`apps/api/src/realtime/dto.ts`** — adicionado:
```typescript
export type RelatorioProntoDTO = {
  relatorioId: string;
  formato: 'PDF' | 'XLSX';
  downloadUrl: string;   // presigned URL 1h
  expiresAt: string;     // ISO string
};
```

**`apps/api/src/realtime/server.ts`** — alterações:
- `emitToEmpresa` event union expandido com `'report:pronto'`
- Import de `RelatorioProntoDTO` adicionado
- `emitRelatorioPronto(empresaId, payload)` adicionado — room-scoped (nunca global)

## Decisions Made

1. **`fetch` nativo do Node 24 em vez de `node-fetch`** — Node 18+ inclui `fetch` global. O plano sugeria `node-fetch` mas o projeto usa Node 24. Eliminamos a dependência extra. `AbortController` com `setTimeout` implementa o timeout de 5s.

2. **`_thumbnailBuffer` pré-carregado no worker antes de chamar `generate*`** — pdfkit opera com stream (callbacks síncronos/assíncronos misturados). Pré-carregar todos os buffers antes de entrar no loop do PDF evita problemas de interleaving assíncrono dentro do Promise de stream do pdfkit.

3. **`as any` nos tipos do ExcelJS `addImage`** — O `index.d.ts` do ExcelJS v4 tem declarações de interface duplicadas para `ImageRange.tl/br` (`Anchor` e `{ col, row }`), criando uma interseção impossível de satisfazer sem cast. O cast é localizado, comentado e não afeta o comportamento em runtime.

4. **`classificacao: filtros.classificacao as never`** — `filtros.classificacao` é `string` (vem do JSON do Redis). Prisma infere o tipo do campo como `Classificacao` (enum). O cast `as never` evita import circular do tipo Prisma no worker — aceitável pois a validação do valor já acontece no route handler (plan 06-03).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Typo `events.push` em vez de `eventos.push` no worker do plano**
- **Found during:** Task 2 (leitura do plano)
- **Issue:** O código do plano tinha `events.push({...})` mas a variável acumuladora era `eventos`
- **Fix:** Implementação correta usa `eventos.push({...})` consistentemente
- **Files modified:** `apps/api/src/jobs/report-worker.ts`
- **Commit:** `1a91321`

**2. [Rule 2 - Missing Critical] Substituído `node-fetch` por `fetch` nativo**
- **Found during:** Task 1 (verificação do ambiente)
- **Issue:** O plano previa `pnpm add node-fetch` mas Node v24 tem `fetch` global nativo
- **Fix:** Usado `fetch` global com `AbortController` para timeout. Sem dependência nova.
- **Files modified:** `apps/api/src/services/report-generator.ts`, `apps/api/src/jobs/report-worker.ts`
- **Commit:** `41f23ef`, `1a91321`

**3. [Rule 1 - Bug] Cast necessário para compatibilidade de tipos ExcelJS**
- **Found during:** Task 1 (compilação TypeScript)
- **Issue:** `TS2322` e `TS2740` — ExcelJS `Image.buffer` e `ImageRange.tl/br` têm definições conflitantes no index.d.ts que impedem atribuição direta
- **Fix:** `as any` com comentário explicativo em ambos os locais
- **Files modified:** `apps/api/src/services/report-generator.ts`
- **Commit:** `41f23ef`

## Edge Cases Tratados

| Situação | Comportamento |
|----------|---------------|
| Thumbnail indisponível (Garage offline, key nula, HTTP não-2xx) | Buffer `null` → linha sem imagem no PDF/Excel; relatório continua |
| Imagem corrompida na célula do Excel | `try/catch` silencioso ao chamar `wb.addImage` |
| Imagem corrompida no PDF | `try/catch` silencioso ao chamar `doc.image` |
| Relatório com 0 eventos | PDF/Excel gerados com apenas cabeçalho e contagem "0 eventos" |
| Tenant mismatch (relatorioId de outra empresa) | `throw` antes de qualquer query de dados (T-06-04) |
| Erro durante geração | `status: ERRO, erroMsg` gravado; re-throw → BullMQ tenta novamente (até 2x) |
| `writeBuffer` do ExcelJS retorna `ArrayBuffer` | `Buffer.isBuffer` guard normaliza para `Buffer` |

## Known Stubs

Nenhum stub neste plano. O worker do 06-01 foi completamente substituído.

## Threat Surface Scan

Nenhuma nova superfície de rede introduzida. Os trust boundaries já documentados no threat_model do plano foram tratados:

- T-06-04: validação de tenant implementada (linha 1 do processador)
- T-06-05: concorrência de thumbnails limitada a 10 (batch loop com `THUMB_CONCURRENCY`)
- T-06-06: `emitRelatorioPronto` usa `emitToEmpresa` — room-scoped por design
- T-06-07: buffer em memória, sem filesystem temp
- T-06-08: `concurrency: 2` no worker + `take: 1000` nos eventos

## Self-Check: PASSED

| Check | Result |
|-------|--------|
| `apps/api/src/services/report-generator.ts` exists | FOUND |
| `apps/api/src/jobs/report-worker.ts` exists | FOUND |
| `apps/api/src/realtime/dto.ts` has `RelatorioProntoDTO` | FOUND |
| `apps/api/src/realtime/server.ts` has `emitRelatorioPronto` | FOUND |
| `pnpm tsc --noEmit` passes | PASSED (no output = success) |
| Commit `41f23ef` (report-generator) | FOUND |
| Commit `1a91321` (worker + dto + server) | FOUND |
| `report-worker.ts` valida tenant match | FOUND (linha ~65) |
| Worker atualiza PROCESSANDO → PRONTO ou ERRO | FOUND |
| Chave Garage usa padrão `reports/{empresaId}/{id}.ext` | FOUND |
| Presigned URL TTL 3600s | FOUND (`getReportPresignedUrl`) |
| Socket.IO emite apenas para room do tenant | FOUND (`emitRelatorioPronto`) |
| MAX_EVENTS = 1000 respeitado | FOUND (`take: MAX_EVENTS`) |
