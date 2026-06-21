---
phase: 04-cross-site-intelligence-whatsapp-alerts
verified: 2026-06-21T00:00:00Z
status: human_needed
score: 5/5 must-haves verificados
overrides_applied: 0
re_verification: false
human_verification:
  - test: "Fluxo end-to-end: classificar placa como SUSPEITO em Obra A, então fazer câmera de Obra B detectar a mesma placa via webhook LPR"
    expected: "Overlay CrossSiteAlertOverlay aparece na tela do operador com placa, nível SUSPEITO, 'Detectada em Obra B' e 'Classificada originalmente em Obra A'. Ao mesmo tempo, mensagem WhatsApp chega no número configurado para Obra B."
    why_human: "Requer serviços ativos (Redis, BullMQ, Evolution API, Socket.IO) e fluxo de dados em tempo real que não é verificável via grep/static analysis."
  - test: "Dedup: enviar evento LPR da mesma placa SUSPEITO/CRITICO duas vezes dentro de 5 minutos"
    expected: "WhatsApp enviado apenas uma vez. Segunda detecção dentro da janela silenciosa não gera nova mensagem. A partir de 5 min + 1s (SUSPEITO) ou 15 min + 1s (CRITICO) um novo envio deve ocorrer."
    why_human: "Requer controle preciso de timing e verificação de log de envio da Evolution API — não verificável via análise estática."
  - test: "Admin EMPRESA acessa /configuracoes/alertas, adiciona número +5511999999999 para uma obra e confirma que aparece na lista"
    expected: "Número salvo, listado na UI, e disponível via GET /api/configuracoes-alerta?obraId={id}."
    why_human: "Requer login autenticado como ADMIN_EMPRESA e interação com UI no browser."
  - test: "OPERADOR tenta acessar /configuracoes/alertas diretamente pela URL"
    expected: "Redirecionado para '/' sem ver a página de configuração."
    why_human: "Requer login autenticado como OPERADOR e teste de proteção de rota no browser."
---

# Phase 4: Cross-Site Intelligence + WhatsApp Alerts — Verification Report

**Phase Goal:** Quando uma placa classificada como Suspeito ou Critico é detectada em qualquer obra da empresa, um alerta full-screen dispara no dashboard do operador e uma mensagem WhatsApp é enviada para os números configurados — com deduplicação prevenindo spam.
**Verified:** 2026-06-21
**Status:** human_needed
**Re-verification:** No — verificação inicial

---

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | Placa SUSPEITO/CRITICO detectada em obra diferente da obraClassificacaoId → job `alert:cross-site` enfileirado no BullMQ | ✓ VERIFIED | `worker.ts` linhas 56–116: lógica `isCrossSite` exata; `alertQueue.add('alert:cross-site', ...)` executado |
| 2 | Overlay exibe: placa, classificação, obra detectada, obra de classificação original | ✓ VERIFIED | `cross-site-alert-overlay.tsx`: renderiza `alert.placaNumero`, `nivelLabel`, `alert.obraDetectadaNome`, `alert.obraClassificacaoNome` |
| 3 | WhatsApp enviado via BullMQ concurrency=1, nunca diretamente do webhook | ✓ VERIFIED | `alert-worker.ts` linha 176: `concurrency: 1`; `worker.ts` apenas enfileira via `alertQueue.add`; webhook não chama `sendAlertaWhatsApp` diretamente |
| 4 | Dedup Redis TTL: 300s SUSPEITO, 900s CRITICO — chave `alert:dedup:{empresaId}:{placa}` | ✓ VERIFIED | `alert-worker.ts` linhas 33–54: `DEDUP_TTL = { SUSPEITO: 300, CRITICO: 900 }`; SET com EX+NX |
| 5 | Admin pode configurar números WhatsApp por obra com validação E.164, isolado por tenant | ✓ VERIFIED | `configuracoes-alerta.ts`: regex `/^\+\d{10,15}$/`, `requireRole('ADMIN_EMPRESA')` nos 3 endpoints, `tenantClient.obra.findFirstOrThrow` garante isolamento |

**Score: 5/5 truths verificadas**

---

### Deferred Items

Nenhum item deferidado para fases posteriores.

---

### Required Artifacts

| Artifact | Provided | Status | Details |
|----------|----------|--------|---------|
| `packages/database/prisma/schema.prisma` | `obraClassificacaoId` em Placa + model `ConfiguracaoAlerta` | ✓ VERIFIED | Campo `obraClassificacaoId String?` presente; `model ConfiguracaoAlerta` com `@@unique([obraId, telefone])` e `@@index([empresaId])` |
| `docker-compose.yml` | Evolution API v2.3.7 service | ✓ VERIFIED | `image: atendai/evolution-api:2.3.7` hard-pinned; sem labels Traefik (acesso apenas interno); volume `evolution-instances` declarado |
| `apps/api/src/services/whatsapp.ts` | Wrapper sendAlertaWhatsApp | ✓ VERIFIED | Exporta `sendAlertaWhatsApp` e `normalizePhone`; nunca lança exceção; retorna `WhatsAppSendResult` |
| `apps/api/src/jobs/alert-worker.ts` | BullMQ Worker + processAlertJob | ✓ VERIFIED | Exporta `alertWorker` (concurrency:1), `processAlertJob`, `checkAndSetDedup`, `formatWhatsAppMessage`; `alertWorker = null` em `NODE_ENV=test` |
| `apps/api/src/jobs/worker.ts` | Lógica cross-site após upsert de Placa | ✓ VERIFIED | Condição `isCrossSite` nas linhas 63–66; enfileiramento condicional de `alert:cross-site` + `alert:whatsapp` |
| `apps/api/src/jobs/queue.ts` | alertQueue `alert-jobs` | ✓ VERIFIED | `export const alertQueue = new Queue('alert-jobs', ...)` com `defaultJobOptions.attempts: 3` |
| `apps/api/src/realtime/server.ts` | emitAlertaCrossSite | ✓ VERIFIED | Função exportada na linha 84; usa `emitToEmpresa` com `'feed:alerta-cross-site'`; `'feed:alerta-cross-site'` no union de `emitToEmpresa` |
| `apps/api/src/realtime/dto.ts` | CrossSiteAlertDTO | ✓ VERIFIED | Type exportado com todos os campos obrigatórios: `empresaId`, `placaNumero`, `classificacao`, `obraDetectadaId`, `obraDetectadaNome`, `obraClassificacaoId`, `obraClassificacaoNome`, `eventoId`, `timestamp` |
| `apps/api/src/routes/configuracoes-alerta.ts` | CRUD de alertas + requireRole | ✓ VERIFIED | GET/POST/DELETE com `requireRole('ADMIN_EMPRESA')`; validação E.164; isolamento via `tenantClient` |
| `apps/web/src/components/cross-site-alert-overlay.tsx` | Overlay full-screen | ✓ VERIFIED | `fixed inset-0 z-[100]`; countdown com `useRef`; auto-dismiss; botão Dispensar; cores SUSPEITO=`bg-orange-500`, CRITICO=`bg-red-700` |
| `apps/web/src/components/dashboard-client.tsx` | Socket listener feed:alerta-cross-site | ✓ VERIFIED | `socket.on('feed:alerta-cross-site', (incoming) => setCrossSiteAlert(incoming))` na linha 113; `<CrossSiteAlertOverlay>` renderizado condicionalmente |
| `apps/web/src/app/(admin)/configuracoes/alertas/page.tsx` | Página admin protegida | ✓ VERIFIED | `auth()` + verificação `session.user.role !== 'ADMIN_EMPRESA'` → `redirect('/')` |
| `apps/web/src/app/(admin)/configuracoes/alertas/alertas-client.tsx` | CRUD UI de números WhatsApp | ✓ VERIFIED | Fetch para `/api/obras` e `/api/configuracoes-alerta`; validação E.164 no frontend; POST/DELETE com `credentials: 'include'` |

---

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `worker.ts` | `queue.ts` | `alertQueue.add('alert:cross-site', payload)` | ✓ WIRED | Import `alertQueue` na linha 7; chamada nas linhas 101 e 115 |
| `alert-worker.ts` | `services/whatsapp.ts` | `import { sendAlertaWhatsApp }` | ✓ WIRED | Import estático na linha 4; chamada na linha 136 (`sendAlertaWhatsApp(config.telefone, mensagem)`) |
| `alert-worker.ts` (BullMQ handler) | `realtime/server.ts` | `await import('../realtime/server')` → `emitAlertaCrossSite` | ✓ WIRED | Dynamic import na linha 162; `emitCrossSite: emitAlertaCrossSite` passado como dep |
| `dashboard-client.tsx` | `cross-site-alert-overlay.tsx` | `socket.on('feed:alerta-cross-site') → setCrossSiteAlert → <CrossSiteAlertOverlay>` | ✓ WIRED | Import na linha 20; listener na 113; renderização condicional na linha 303 |
| `alertas-client.tsx` | `routes/configuracoes-alerta.ts` | `fetch POST/DELETE /api/configuracoes-alerta` | ✓ WIRED | Fetch para `/api/configuracoes-alerta` (GET, POST, DELETE) com `credentials: 'include'` |
| `index.ts` | `jobs/alert-worker.ts` | `import('./jobs/alert-worker')` | ✓ WIRED | Linha 50 do `index.ts`: bootstrap registra alert-worker no startup |
| `routes/placas.ts` | schema `obraClassificacaoId` | `obraClassificacaoUpdate` no `placa.update` | ✓ WIRED | Linhas 33–50: update condicional do campo ao classificar SUSPEITO/CRITICO via último evento |

---

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produz Dados Reais | Status |
|----------|---------------|--------|-------------------|--------|
| `cross-site-alert-overlay.tsx` | `alert: CrossSiteAlertDTO` | Prop vinda de `dashboard-client.tsx` via `setCrossSiteAlert(incoming)` | Payload vem do Socket.IO emitido pelo `alert-worker` que leu do BullMQ job | ✓ FLOWING |
| `alertas-client.tsx` | `configs: ConfiguracaoAlerta[]` | Fetch para `/api/configuracoes-alerta?obraId={id}` | Rota faz `prisma.configuracaoAlerta.findMany({ where: { obraId, ativo: true } })` | ✓ FLOWING |
| `alertas-client.tsx` | `obras: Obra[]` | Fetch para `/api/obras` | Rota existente retorna obras da empresa do tenant | ✓ FLOWING |

---

### Behavioral Spot-Checks

Verificações estáticas realizadas — serviços em runtime não disponíveis para spot-checks ao vivo.

| Comportamento | Verificação Estática | Status |
|---------------|---------------------|--------|
| `concurrency: 1` no BullMQ worker | `alert-worker.ts` linha 176: `concurrency: 1` explícito | ✓ PASS |
| TTL 300s SUSPEITO / 900s CRITICO | `DEDUP_TTL = { SUSPEITO: 300, CRITICO: 900 }` + `redis.set(key, '1', 'EX', ttl, 'NX')` | ✓ PASS |
| Evolution API tag hard-pinned | `docker-compose.yml`: `atendai/evolution-api:2.3.7` (não `latest`) | ✓ PASS |
| Sem labels Traefik na Evolution API | `evolution-api` service sem bloco `labels:` | ✓ PASS |
| ADMIN_EMPRESA enforced nos 3 endpoints | `requireRole('ADMIN_EMPRESA')` em GET, POST e DELETE | ✓ PASS |
| Overlay z-index máximo | `className="fixed inset-0 z-[100]..."` | ✓ PASS |

---

### Requirements Coverage

| Requisito | Plano Fonte | Descrição | Status | Evidência |
|-----------|------------|-----------|--------|-----------|
| INTEL-01 | 04-01, 04-02 | A cada evento LPR, sistema consulta classificação da placa no nível da empresa | ✓ SATISFIED | `worker.ts`: `placa.classificacao` vem do `prisma.placa.upsert` com chave `(numero, empresaId)` — classificação é sempre no nível empresa |
| INTEL-02 | 04-01, 04-02 | Placa Suspeito/Critico detectada em obra diferente → alerta cross-site | ✓ SATISFIED | `isCrossSite = isHighRisk && placa.obraClassificacaoId !== null && placa.obraClassificacaoId !== camera.obraId` |
| INTEL-03 | 04-02, 04-03, 04-04 | Alerta exibe: placa, classificação, obra detectada, obra de classificação original | ✓ SATISFIED | `CrossSiteAlertDTO` contém todos os campos; overlay renderiza todos eles |
| INTEL-04 | 04-03 | Alerta transmitido via Socket.IO para sala da empresa inteira | ✓ SATISFIED | `emitAlertaCrossSite` usa `io.to(buildEmpresaRoom(empresaId)).emit(...)` — nunca `io.emit()` global |
| INTEL-05 | 04-04 | Overlay de alerta em tela cheia para níveis 4 e 5 com botão dispensar | ✓ SATISFIED | `fixed inset-0 z-[100]`; botão Dispensar com `data-testid="dismiss-btn"`; auto-dismiss 30s |
| ALERTS-01 | 04-01 | Evolution API v2.3.7 hard-pinned em container Docker | ✓ SATISFIED | `image: atendai/evolution-api:2.3.7` no docker-compose.yml |
| ALERTS-02 | 04-02 | Alertas WhatsApp apenas para níveis 4 (Suspeito) e 5 (Critico) | ✓ SATISFIED | `isHighRisk = placa.classificacao === 'SUSPEITO' \|\| placa.classificacao === 'CRITICO'` — só esses enfileiram `alert:whatsapp` |
| ALERTS-03 | 04-02 | Envio via BullMQ (concorrência 1) — nunca direto do webhook | ✓ SATISFIED | `concurrency: 1` no alertWorker; webhook apenas enfileira via `alertQueue.add` |
| ALERTS-04 | 04-02, 04-03 | Dedup por placa: janela 5 min Suspeito, 15 min Critico | ✓ SATISFIED | `checkAndSetDedup`: TTL 300s/900s com Redis SET NX EX; chave `alert:dedup:{empresaId}:{placa}` |
| ALERTS-05 | 04-01 | `INSERT ON CONFLICT DO NOTHING` para evitar duplicação em race conditions | ✓ SATISFIED | `@@unique([obraId, telefone])` no schema + handler P2002 no POST retornando 409 |
| ALERTS-06 | 04-04 | Admin configura lista de números WhatsApp por obra | ✓ SATISFIED | CRUD completo em `/api/configuracoes-alerta` com `requireRole('ADMIN_EMPRESA')`; UI em `/configuracoes/alertas` |

**Cobertura: 11/11 requisitos satisfeitos (análise estática)**

---

### Anti-Patterns Found

| Arquivo | Linha | Pattern | Severidade | Impacto |
|---------|-------|---------|-----------|---------|
| `apps/api/src/jobs/worker.ts` | 85 | `eventoId: idempotencyKey` — placeholder documentado (evento.id real apenas disponível após upsert posterior) | ℹ️ Info | Nenhum: `idempotencyKey` é único por evento; funciona como identificador temporário. O overlay não usa `eventoId` para navegação em v1 |

Nenhum blocker ou warning encontrado. O único anti-pattern detectado é um placeholder conhecido e documentado nos SUMMARYs de Plans 02 e 03, sem impacto funcional.

---

### Human Verification Required

#### 1. Fluxo End-to-End Cross-Site

**Teste:** Fazer login como OPERADOR, abrir o dashboard. Em outro terminal, classificar uma placa (ex: `ABC1234`) como SUSPEITO na Obra A via PATCH `/api/placas/{id}/classificacao`. Então enviar um evento LPR simulado para uma câmera pertencente à Obra B com a mesma placa.
**Esperado:** O overlay `CrossSiteAlertOverlay` aparece imediatamente no dashboard com: placa `ABC1234`, nível SUSPEITO (fundo laranja), "Detectada em: Obra B", "Classificada originalmente em: Obra A", countdown regressivo de 30s. Mensagem WhatsApp chega no número configurado para Obra B.
**Por que humano:** Requer serviços ativos (Redis, BullMQ, Evolution API, Socket.IO) e fluxo de dados em tempo real. A cadeia completa LPR webhook → BullMQ → alert-worker → Socket.IO → browser não é verificável via análise estática.

#### 2. Deduplicação de Alertas WhatsApp

**Teste:** Com a mesma placa SUSPEITO detectada em duas obras diferentes, enviar dois eventos LPR para Obra B dentro de uma janela de 4 minutos.
**Esperado:** WhatsApp enviado apenas na primeira detecção. Segunda mensagem suprimida. Log do alert-worker deve mostrar "dedup: pulando WhatsApp para [placa] (janela ativa)". Após 5 minutos + 1 segundo, uma nova detecção deve gerar novo envio.
**Por que humano:** Verificar timing de TTL do Redis e logs do worker requer ambiente de execução ativo.

#### 3. CRUD Admin de Números WhatsApp

**Teste:** Login como ADMIN_EMPRESA, navegar para `/configuracoes/alertas`, selecionar uma obra no dropdown, adicionar `+5511999999999`, confirmar que aparece na lista, então clicar Remover.
**Esperado:** Número adicionado à lista (GET retorna o item). Após Remover, lista fica vazia. Tentar adicionar `5511999999999` (sem +) deve mostrar alerta de validação.
**Por que humano:** Requer autenticação real e interação com browser.

#### 4. Proteção de Rota por Role

**Teste:** Login como OPERADOR, tentar acessar `/configuracoes/alertas` diretamente.
**Esperado:** Redirecionado para `/` sem renderizar a página de configuração. Endpoint `POST /api/configuracoes-alerta` deve retornar 403 para requisições de OPERADOR.
**Por que humano:** Requer sessions autenticadas reais para cada role.

---

### Gaps Summary

Nenhuma lacuna encontrada. Todos os 5 must-haves e 11 requisitos foram verificados como implementados e conectados no código. Os 4 itens acima são de verificação humana obrigatória (comportamento em runtime, fluxo real de dados, interação com browser), não representam ausência de implementação.

---

_Verified: 2026-06-21T00:00:00Z_
_Verifier: Claude (gsd-verifier)_
