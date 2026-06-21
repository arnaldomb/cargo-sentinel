---
phase: 03-real-time-event-feed-classification
verified: 2026-06-21T09:35:00Z
status: human_needed
score: 15/15 must-haves verified
overrides_applied: 0
human_verification:
  - test: "Abrir duas sessoes autenticadas da mesma empresa, reclassificar uma placa em uma sessao e confirmar que a outra sessao atualiza sem reload"
    expected: "A segunda sessao exibe a nova classificacao em ate 2 segundos"
    why_human: "Comportamento de sincronizacao via Socket.IO nao e verificavel programaticamente sem servidor rodando"
  - test: "Disparar uma leitura LPR nova e verificar que o evento aparece no topo do feed em tempo real"
    expected: "Item novo aparece no topo e o feed faz auto-scroll se pinnedToTop=true"
    why_human: "Ciclo completo webhook→worker→Socket.IO→browser requer servidor e cliente reais rodando"
  - test: "Scrollar o feed para baixo e verificar que o auto-scroll para; o botao de 'N novos eventos' aparece"
    expected: "Ao scrollar manualmente, auto-scroll pausa; affordance de retorno aparece com contagem correta"
    why_human: "Comportamento de pinnedToTopRef e interacao com DOM nao e verificavel nos testes unitarios existentes"
---

# Phase 03: Real-Time Event Feed & Classification — Verification Report

**Phase Goal:** Entregar o nucleo operacional do produto: entidade Placa tenant-scoped com classificacao e auditoria, Socket.IO com isolamento de tenant, feed REST + status de cameras, dashboard ao vivo hidratado por REST e atualizado por WebSocket, e classificacao inline com confirmacao para niveis SUSPEITO/CRITICO.

**Verified:** 2026-06-21T09:35:00Z
**Status:** human_needed
**Re-verification:** Nao — verificacao inicial.

---

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|---------|
| 1 | Placa entity existe com unique(numero, empresaId) e default VISITANTE | VERIFIED | schema.prisma linhas 63-81: `@@unique([numero, empresaId])`, `classificacao @default(VISITANTE)` |
| 2 | PATCH /api/placas/:placaId/classificacao disponivel para ADMIN_EMPRESA e OPERADOR | VERIFIED | placas.ts: `requireRole('ADMIN_EMPRESA', 'OPERADOR')`, rota montada em index.ts linha 36 |
| 3 | Cada reclassificacao cria um registro ClassificacaoHistorico com usuarioId e transicao De/Para | VERIFIED | placas.ts linhas 47-63: `classificacaoHistorico.create` com `classificacaoDe`, `classificacaoPara`, `usuarioId` |
| 4 | Reclassificacao nao cruza tenants — placa de outro tenant retorna 404 | VERIFIED | placas.ts linha 26: `tenantClient.placa.findFirstOrThrow` (P2025 → 404 capturado na linha 80) |
| 5 | Novas placas detectadas pelo worker nascem com classificacao VISITANTE | VERIFIED | worker.ts linhas 33-44: `prisma.placa.upsert` com `create.classificacao: 'VISITANTE'` |
| 6 | Socket.IO server acoplado ao Express HTTP server | VERIFIED | index.ts linhas 40-41: `httpServer = createServer(app)`, `io = createRealtimeServer(httpServer)` |
| 7 | Toda conexao autenticada entra automaticamente em empresa:{empresaId} | VERIFIED | server.ts linhas 23-25: `handleRealtimeConnection` faz `socket.join(buildEmpresaRoom(...))` derivado do JWT |
| 8 | io.emit() nunca usado — apenas io.to(room).emit() | VERIFIED | grep de `io.emit(` em apps/api/src retornou zero matches |
| 9 | Conexao sem token valido ou sem empresaId e rejeitada | VERIFIED | auth.ts linhas 44-47: rejeita se sem token ou sem empresaId |
| 10 | GET /api/eventos/feed retorna lista paginada por cursor com joins de Obra, Camera e Placa | VERIFIED | eventos.ts: paginacao keyset (take limit+1, skip 1), select com obra e camera, ordenado por timestamp desc |
| 11 | GET /api/cameras/status retorna online/offline com janela de 5 minutos | VERIFIED | camera-status.ts: `ONLINE_WINDOW_MS = 5 * 60 * 1000`, calculo `now - ultimoEvento.getTime()` |
| 12 | Nenhum dado de evento vaza entre tenants — feed usa tenantClient | VERIFIED | eventos.ts linha 28: `req.tenantClient!.evento.findMany`; camera-status.ts linha 12: `req.tenantClient!.camera.findMany` |
| 13 | Dashboard assina feed:evento-novo, feed:placa-classificada e feed:camera-status | VERIFIED | dashboard-client.tsx linhas 85-103: tres handlers socket.on() corretamente conectados |
| 14 | Classificacao SUSPEITO e CRITICO exige confirmacao explicita | VERIFIED | dashboard.ts: `requiresCriticalConfirmation` retorna true para SUSPEITO/CRITICO; dashboard-client.tsx chama `setConfirmDialog`; CriticalConfirmDialog e um modal proprio (nao window.confirm) |
| 15 | Updates de classificacao aparecem no feed sem reload de pagina | VERIFIED | dashboard-client.tsx linhas 94-98: `feed:placa-classificada` chama `updateFeedClassification` que atualiza estado React |

**Score:** 15/15 truths verified

---

## Required Artifacts

| Artifact | Esperado | Status | Detalhes |
|----------|---------|--------|---------|
| `packages/database/prisma/schema.prisma` | Placa, ClassificacaoHistorico, relacao Evento.placaId | VERIFIED | Todos os modelos presentes com constraints e indices corretos |
| `apps/api/src/routes/placas.ts` | PATCH /:placaId/classificacao com RBAC e auditoria | VERIFIED | Implementacao completa, 87 linhas, emite feed:placa-classificada |
| `apps/api/src/realtime/auth.ts` | Autenticacao do socket via cookie JWE | VERIFIED | Leitura de cookie + fallback Bearer + rejeicao sem empresaId |
| `apps/api/src/realtime/server.ts` | Rooms por tenant, helpers de emissao, sem io.emit() | VERIFIED | emitToEmpresa usa `io.to(room).emit()` exclusivamente |
| `apps/api/src/realtime/dto.ts` | FeedItem e CameraStatusItem DTO builders | VERIFIED | eventoToFeedItem, calcCameraStatus com janela de 5 min |
| `apps/api/src/routes/eventos.ts` | GET /feed paginado por cursor com joins | VERIFIED | Paginacao keyset real, thumbnailUrl via presigned URL |
| `apps/api/src/routes/camera-status.ts` | GET /status com online/offline | VERIFIED | groupBy + _max para query agregada, calculo deterministico |
| `apps/api/src/jobs/worker.ts` | Upsert Placa + emissao evento-novo e camera-status | VERIFIED | upsert idempotente, emitEventoNovo e emitCameraStatus chamados |
| `apps/api/src/index.ts` | http.createServer, Socket.IO inicializado, rotas montadas | VERIFIED | Todas as 5 rotas protegidas montadas sob protectedPipeline |
| `apps/web/src/app/page.tsx` | Dashboard autenticado com redirect para /login | VERIFIED | Server component com auth(), redirect se sem sessao, monta DashboardClient |
| `apps/web/src/components/dashboard-client.tsx` | Feed ao vivo, sidebar cameras, popover, auto-scroll | VERIFIED | 315 linhas, todos os comportamentos implementados |
| `apps/web/src/components/classification-badge.tsx` | Badge colorida por enum | VERIFIED | Componente puro com Tailwind |
| `apps/web/src/components/classification-popover.tsx` | Seletor inline com close em Escape e clique externo | VERIFIED | useEffect para clickOutside e Escape corretamente implementados |
| `apps/web/src/components/critical-confirm-dialog.tsx` | Modal de confirmacao para niveis criticos | VERIFIED | Modal proprio com foco gerenciado, Escape para cancelar, impacto operacional explicito |
| `apps/web/src/lib/dashboard.ts` | requiresCriticalConfirmation, updateFeedClassification, paleta | VERIFIED | requiresCriticalConfirmation retorna true para SUSPEITO e CRITICO; paleta SUSPEITO=orange, CRITICO=red |

---

## Key Link Verification

| From | To | Via | Status | Detalhes |
|------|----|-----|--------|---------|
| worker.ts | realtime/server.ts | emitEventoNovo, emitCameraStatus | WIRED | Linhas 75 e 93 do worker.ts |
| placas.ts | realtime/server.ts | emitPlacaClassificada | WIRED | Linha 65 do placas.ts, importado na linha 3 |
| dashboard-client.tsx | /api/eventos/feed | fetch com credentials:include | WIRED | Linha 56 do dashboard-client.tsx |
| dashboard-client.tsx | /api/cameras/status | fetch com credentials:include | WIRED | Linha 57 do dashboard-client.tsx |
| dashboard-client.tsx | /api/placas/:id/classificacao | fetch PATCH | WIRED | Linha 115 do dashboard-client.tsx |
| dashboard-client.tsx | Socket.IO server | io() com withCredentials | WIRED | Linha 79-83 do dashboard-client.tsx |
| index.ts | realtime/server.ts | createRealtimeServer(httpServer) | WIRED | Linha 41 do index.ts |

---

## Data-Flow Trace (Level 4)

| Artifact | Variavel de Dados | Fonte | Produz Dados Reais | Status |
|----------|------------------|-------|---------------------|--------|
| dashboard-client.tsx `feed` | `useState<FeedItem[]>` | `GET /api/eventos/feed` → `tenantClient.evento.findMany` | Sim — query DB real | FLOWING |
| dashboard-client.tsx `cameras` | `useState<CameraStatusItem[]>` | `GET /api/cameras/status` → `tenantClient.camera.findMany` + `groupBy` | Sim — query DB real agregada | FLOWING |
| eventos.ts | `items` | `req.tenantClient!.evento.findMany` com joins | Sim — query com select campos reais | FLOWING |
| camera-status.ts | `items` | `tenantClient.camera.findMany` + `tenantClient.evento.groupBy` | Sim — query agregada por cameraId | FLOWING |

---

## Behavioral Spot-Checks

| Comportamento | Comando | Resultado | Status |
|--------------|---------|-----------|--------|
| API build TypeScript | `pnpm --filter @cargo-sentinel/api build` | tsc — exit 0 sem erros | PASS |
| Web build TypeScript | `pnpm --filter @cargo-sentinel/web build` | Compiled successfully, Route / = 16.4 kB | PASS |
| Suite de testes API | `pnpm --filter @cargo-sentinel/api test --run` | 16 test files, 69 tests — todos passando | PASS |
| Suite de testes Web | `pnpm --filter @cargo-sentinel/web exec vitest run` | 5 test files, 28 tests — todos passando | PASS |
| io.emit() global ausente | `grep -r "io\.emit(" apps/api/src` | Nenhum match — apenas `io.to(room).emit()` | PASS |

---

## Requirements Coverage

| Requisito | Plano | Descricao | Status | Evidencia |
|-----------|-------|-----------|--------|----------|
| PLACA-01 | 03-01 | Placa com unique(numero, empresaId) | SATISFIED | schema.prisma `@@unique([numero, empresaId])` |
| PLACA-02 | 03-01 | Classificacao default VISITANTE para placas novas | SATISFIED | schema.prisma `@default(VISITANTE)` + worker.ts upsert |
| PLACA-03 | 03-01 | PATCH /api/placas/:id/classificacao para ADMIN_EMPRESA e OPERADOR | SATISFIED | placas.ts `requireRole('ADMIN_EMPRESA', 'OPERADOR')` |
| PLACA-04 | 03-01 | Cada reclassificacao cria uma ClassificacaoHistorico | SATISFIED | placas.ts `classificacaoHistorico.create` com transicao completa |
| PLACA-05 | 03-04 | Classificacao aparece no feed sem reload | SATISFIED | dashboard-client.tsx `feed:placa-classificada` → `updateFeedClassification` |
| PLACA-06 | 03-04 | SUSPEITO/CRITICO exige confirmacao explicita | SATISFIED | `requiresCriticalConfirmation` + `CriticalConfirmDialog` com modal proprio |
| PLACA-07 | 03-01 | Classificacao nao cruza tenants | SATISFIED | `tenantClient.placa.findFirstOrThrow` — P2025 → 404 |
| REALTIME-01 | 03-02 | Socket.IO acoplado ao Express HTTP server | SATISFIED | `createServer(app)` + `createRealtimeServer(httpServer)` |
| REALTIME-02 | 03-02 | Conexao autenticada entra em empresa:{empresaId} automaticamente | SATISFIED | `handleRealtimeConnection` → `socket.join(buildEmpresaRoom(...))` |
| REALTIME-03 | 03-03 | GET /api/eventos/feed retorna FeedItem paginado com joins | SATISFIED | eventos.ts com paginacao keyset, joins obra/camera, thumbnailUrl |
| REALTIME-04 | 03-04 | Dashboard assina feed:evento-novo, feed:placa-classificada, feed:camera-status | SATISFIED | dashboard-client.tsx tres handlers socket.on() |
| REALTIME-05 | 03-03 | Camera status online/offline por janela de 5 minutos | SATISFIED | camera-status.ts `ONLINE_WINDOW_MS = 5 * 60 * 1000` |
| REALTIME-06 | 03-04 | Novos eventos fazem auto-scroll ao topo quando usuario nao scrollou | SATISFIED | dashboard-client.tsx `pinnedToTopRef`, `scrollTop = 0` ao receber evento |
| REALTIME-07 | 03-03 | Nenhum evento vaza entre tenants | SATISFIED | tenantClient em todos os endpoints; emissao por room empresa:{id} |

---

## Anti-Patterns Found

| Arquivo | Linha | Padrao | Severidade | Impacto |
|---------|-------|--------|-----------|---------|
| dashboard-client.tsx | 256 | `'Sem foto'` quando thumbnailUrl e null | Info | Placeholder intencional documentado no SUMMARY — Garage S3 em fase posterior |

Nenhum blocker ou warning encontrado. O unico anti-pattern identificado e um placeholder intencional e documentado.

---

## Human Verification Required

### 1. Sincronizacao cross-session de classificacao em tempo real

**Test:** Abrir duas abas autenticadas com o mesmo usuario (ou dois usuarios do mesmo tenant). Reclassificar uma placa em uma aba como ATENCAO ou superior.
**Expected:** A segunda aba exibe a nova classificacao em ate 2 segundos, sem reload.
**Why human:** O ciclo Socket.IO `server → client` requer servidor rodando, conexao WebSocket ativa e dois clientes conectados — nao e verificavel com grep ou tsc.

### 2. Evento novo aparece no topo do feed em tempo real

**Test:** Com o servidor e o worker LPR rodando, disparar uma leitura LPR (ou injetar diretamente uma job no BullMQ) e observar o dashboard.
**Expected:** O novo evento aparece no topo do feed em ate 2 segundos, sem reload de pagina.
**Why human:** Ciclo completo webhook → BullMQ worker → `emitEventoNovo` → Socket.IO → React state exige servidor real.

### 3. Auto-scroll pausa quando usuario navega historico

**Test:** Com o feed carregado, scrollar manualmente para baixo. Aguardar chegada de novos eventos.
**Expected:** Auto-scroll nao forca o scroll para o topo; o botao "N novos eventos" aparece com a contagem correta; clicar no botao restaura o scroll ao topo e retoma o auto-scroll.
**Why human:** Comportamento de `pinnedToTopRef` e interacao com `scrollTop` depende do DOM real — os testes unitarios existentes nao cobrem este cenario de integracao.

---

## Gaps Summary

Nenhum gap encontrado. Todos os 15 requisitos verificados estao implementados de forma substantiva, conectada e com dados fluindo. Os 3 itens de verificacao humana acima sao comportamentos de integracao em tempo real que nao podem ser validados programaticamente sem um servidor rodando.

---

_Verified: 2026-06-21T09:35:00Z_
_Verifier: Claude (gsd-verifier)_
