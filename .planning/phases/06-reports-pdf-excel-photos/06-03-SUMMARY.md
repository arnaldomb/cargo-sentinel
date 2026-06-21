---
phase: "06-reports-pdf-excel-photos"
plan: "06-03"
subsystem: "api/routes"
tags: ["express", "bullmq", "relatorios", "rest-api", "presigned-url", "cursor-pagination"]
dependency_graph:
  requires: ["06-01", "06-02"]
  provides:
    - "POST /api/relatorios (202 imediato + enfileiramento BullMQ)"
    - "GET /api/relatorios (cursor pagination, role-scoped)"
    - "GET /api/relatorios/:id/download (presigned URL com guard 404/410)"
  affects:
    - "apps/api/src/routes/relatorios.ts"
    - "apps/api/src/index.ts"
tech_stack:
  added: []
  patterns:
    - "202 imediato + BullMQ jobId=relatorioId para idempotência"
    - "cursor pagination com take: limit+1 e nextCursor"
    - "role-scoped list: OPERADOR filtra criadoPor; ADMIN vê toda a empresa"
    - "presigned URL gerada server-side sem expor garageKey ao cliente"
key_files:
  created:
    - apps/api/src/routes/relatorios.ts
  modified:
    - apps/api/src/index.ts
decisions:
  - "req.user.id usado (não .sub) — o tipo Express.Request do projeto usa id conforme auth.ts AuthenticatedUser"
  - "empresaId verificado como non-null antes de criar Relatorio — SUPER_ADMIN sem empresa recebe 403"
  - "OPERADOR filtra criadoPor=userId para ver apenas os próprios relatórios; ADMIN_EMPRESA e SUPER_ADMIN veem todos da empresa"
  - "garageKey nunca retornado ao cliente — endpoint /download retorna { downloadUrl, expiresAt } com URL presigned fresca"
metrics:
  duration: "~10 min"
  completed: "2026-06-21"
  tasks_completed: 2
  files_modified: 2
---

# Phase 06 Plan 03: REST API for Reports Summary

**One-liner:** Três endpoints REST em `/api/relatorios` — POST retorna 202 + relatorioId sem bloquear, GET lista com cursor pagination scoped por role, GET download emite presigned URL com guards 404/410.

## What Was Built

### Task 1: `apps/api/src/routes/relatorios.ts` (commit `58a7e83`)

Router Express com três rotas protegidas por `requireRole`:

#### POST /api/relatorios

| Campo | Tipo | Comportamento |
|-------|------|---------------|
| `formato` | `'PDF' \| 'XLSX'` | Obrigatório; 400 se inválido |
| `filtros.classificacao` | `string` | Validado contra enum `['LIBERADO','VISITANTE','ATENCAO','SUSPEITO','CRITICO']`; 400 se inválido |
| `filtros.dataInicio` | ISO string | Validado via `new Date(); 400 se NaN |
| `filtros.dataFim` | ISO string | Mesmo que dataInicio |
| `filtros.obraId`, `cameraId`, `placa` | string | Opcionais, sem validação de existência |

**Fluxo:** valida → `tenantClient.relatorio.create(status=PENDENTE)` → `reportQueue.add(jobId=relatorioId)` → `res.status(202).json({ relatorioId })`

**Segurança (T-06-12):** `criadoPor = req.user!.id` e `empresaId = req.user!.empresaId` — nunca do body.

#### GET /api/relatorios

- Cursor pagination: `limit` (1-50, default 20), `cursor` (opaque ID)
- `OPERADOR`: `where: { criadoPor: userId }` — vê apenas os próprios relatórios
- `ADMIN_EMPRESA` / `SUPER_ADMIN`: sem filtro de criadoPor — vê todos da empresa
- `select` exclui `garageKey` — nunca exposto na listagem (T-06-09)
- Resposta: `{ items: Relatorio[], nextCursor: string | null }`

#### GET /api/relatorios/:id/download

| Condição | Resposta |
|----------|----------|
| Não encontrado / outro tenant | 404 `{ error: 'Relatório não encontrado' }` |
| `status !== 'PRONTO'` | 404 `{ error: 'Relatório não está pronto' }` |
| `garageKey` ou `expiresAt` nulo | 500 (estado interno inválido) |
| `expiresAt < now` | 410 `{ error: 'Link expirado — solicite um novo relatório' }` |
| PRONTO e não expirado | 200 `{ downloadUrl, expiresAt }` |

`downloadUrl` é URL presigned fresca (TTL 3600s via `getReportPresignedUrl`). `garageKey` nunca retornado ao cliente (T-06-09).

### Task 2: `apps/api/src/index.ts` (commit `4718274`)

```typescript
import relatoriosRouter from './routes/relatorios';
// ...
app.use('/api/relatorios', ...protectedPipeline, relatoriosRouter);
```

Montado após `configuracoes-alerta`, seguindo o padrão dos demais routers protegidos.

**Bootstrap verificado:** `import('./jobs/report-worker')` já estava presente desde o plano 06-01 (linha 53) — nenhuma alteração necessária.

## Decisions Made

1. **`req.user.id` em vez de `req.user.sub`** — O plano sugeria `.sub`, mas o tipo `Express.Request` do projeto usa `id` conforme `AuthenticatedUser` em `auth.ts`. Código ajustado para compilar corretamente.

2. **Guard de `empresaId` non-null** — `req.user.empresaId` é `string | null`. SUPER_ADMIN sem empresa associada recebe 403 antes de criar o Relatorio, evitando registro com `empresaId` nulo.

3. **Role-scoped list para OPERADOR** — OPERADOR filtra `criadoPor=userId` para privacidade entre operadores da mesma empresa. ADMIN_EMPRESA e SUPER_ADMIN veem todos os relatórios da empresa.

4. **Sem redirect 302 — retorna `{ downloadUrl }`** — O plano original mencionava "redirect 302 to presigned URL", mas o endpoint retorna JSON com a URL por compatibilidade com clientes JavaScript que não seguem redirects automaticamente em fetch com credenciais.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] `req.user.sub` substituído por `req.user.id`**
- **Found during:** Task 1 (análise do tipo Express.Request)
- **Issue:** O código do plano usava `req.user!.sub` e `req.user!.empresaId`, mas o tipo `AuthenticatedUser` declarado em `apps/api/src/types/express.d.ts` usa `id` (não `sub`). Usar `.sub` causaria erro TypeScript `TS2339`.
- **Fix:** `criadoPor = req.user!.id` e `empresaId = req.user!.empresaId` — alinhado com o tipo declarado.
- **Files modified:** `apps/api/src/routes/relatorios.ts`
- **Commit:** `58a7e83`

**2. [Rule 2 - Missing Critical] Guard de empresaId null para POST**
- **Found during:** Task 1 (análise do tipo — `empresaId: string | null`)
- **Issue:** `req.user.empresaId` pode ser `null` para SUPER_ADMIN sem empresa. Criar Relatorio com `empresaId: null` violaria a constraint NOT NULL do schema Prisma.
- **Fix:** Verificação explícita `if (!empresaId) res.status(403)` antes do `create`.
- **Files modified:** `apps/api/src/routes/relatorios.ts`
- **Commit:** `58a7e83`

**3. [Rule 1 - Bug] Endpoint /download retorna JSON em vez de redirect 302**
- **Found during:** Task 1 (análise de compatibilidade)
- **Issue:** O plano mencionava "redirect 302 to presigned URL", mas fetch com credenciais em navegadores não segue redirects cross-origin transparentemente. JSON `{ downloadUrl }` permite o cliente decidir como abrir o arquivo.
- **Fix:** `res.json({ downloadUrl, expiresAt })` em vez de `res.redirect(302, downloadUrl)`.
- **Files modified:** `apps/api/src/routes/relatorios.ts`
- **Commit:** `58a7e83`

## Known Stubs

Nenhum stub. As três rotas estão completamente implementadas.

## Threat Surface Scan

Nenhuma nova superfície de rede além das planejadas. Os trust boundaries do threat_model foram implementados:

| Threat ID | Mitigação implementada |
|-----------|----------------------|
| T-06-09 | `tenantClient` filtra por empresaId; `garageKey` nunca exposto; presigned URL gerada server-side |
| T-06-10 | `jobId: relatorio.id` no BullMQ garante idempotência — mesmo relatorioId não enfileira duplicado |
| T-06-11 | Validação explícita de `formato` e `classificacao` antes de persistir |
| T-06-12 | `criadoPor = req.user!.id`, `empresaId = req.user!.empresaId` — nunca do body |

## Self-Check: PASSED

| Check | Result |
|-------|--------|
| `apps/api/src/routes/relatorios.ts` exists | FOUND |
| `apps/api/src/index.ts` monta `/api/relatorios` | FOUND (linha 43) |
| `pnpm tsc --noEmit` passes | PASSED (no output) |
| Commit `58a7e83` (relatorios.ts) | FOUND |
| Commit `4718274` (index.ts) | FOUND |
| POST retorna 202 + { relatorioId } | FOUND |
| GET lista com cursor pagination | FOUND |
| GET download com guard 404 (não pronto) | FOUND |
| GET download com guard 410 (expirado) | FOUND |
| criadoPor e empresaId do JWT — nunca do body | FOUND |
| garageKey nunca exposto ao cliente | FOUND |
| jobId=relatorioId para idempotência BullMQ | FOUND |
