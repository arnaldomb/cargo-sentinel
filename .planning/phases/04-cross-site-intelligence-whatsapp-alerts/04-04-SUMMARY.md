---
phase: "4"
plan: "04"
subsystem: "frontend / realtime / admin"
tags: [overlay, socket.io, whatsapp, admin-ui, crud, e164, intel-05, alerts-06]
dependency_graph:
  requires:
    - "04-03: CrossSiteAlertDTO, emitAlertaCrossSite, feed:alerta-cross-site event"
    - "04-02: ConfiguracaoAlerta model em Prisma schema"
  provides:
    - "CrossSiteAlertOverlay — componente de overlay full-screen no dashboard"
    - "feed:alerta-cross-site socket listener em dashboard-client.tsx"
    - "GET/POST/DELETE /api/configuracoes-alerta — CRUD de numeros WhatsApp"
    - "/configuracoes/alertas — pagina admin para gerenciar numeros por obra"
  affects:
    - "apps/web/src/components/cross-site-alert-overlay.tsx"
    - "apps/web/src/components/cross-site-alert-overlay.test.tsx"
    - "apps/web/src/components/dashboard-client.tsx"
    - "apps/web/src/components/sidebar.tsx"
    - "apps/web/src/app/(admin)/configuracoes/alertas/page.tsx"
    - "apps/web/src/app/(admin)/configuracoes/alertas/alertas-client.tsx"
    - "apps/api/src/routes/configuracoes-alerta.ts"
    - "apps/api/src/index.ts"
tech_stack:
  added: []
  patterns:
    - "useRef para countdown — evita closure stale em setInterval sem depender de state updater"
    - "onDismissRef pattern — ref sempre atualizada para evitar stale closure no cleanup do useEffect"
    - "Server Component page.tsx valida role via auth() e redireciona OPERADOR"
    - "AlertasClient usa fetch com credentials: include — cookie JWT propaga auth"
    - "E.164 regex /^\\+\\d{10,15}$/ validada tanto no frontend quanto no backend"
key_files:
  created:
    - "apps/web/src/components/cross-site-alert-overlay.tsx"
    - "apps/web/src/components/cross-site-alert-overlay.test.tsx"
    - "apps/web/src/app/(admin)/configuracoes/alertas/page.tsx"
    - "apps/web/src/app/(admin)/configuracoes/alertas/alertas-client.tsx"
    - "apps/api/src/routes/configuracoes-alerta.ts"
  modified:
    - "apps/web/src/components/dashboard-client.tsx"
    - "apps/web/src/components/sidebar.tsx"
    - "apps/api/src/index.ts"
decisions:
  - "useRef para remaining counter em vez de state updater — state updater (prev=>) causava dupla chamada de onDismiss em React StrictMode; ref mutavel resolve sem duplicar invocacoes"
  - "Sidebar link /configuracoes/alertas condicional em userRole — nao ocultar via CSS apenas (defense in depth); page.tsx tambem redireciona no servidor"
  - "IRouter annotation em configuracoes-alerta.ts — necessario para tsc nao emitir TS2742 sobre tipo nao-portavel"
metrics:
  duration: "25 min"
  completed_date: "2026-06-21"
  tasks_completed: 2
  tasks_total: 2
  files_created: 5
  files_modified: 3
---

# Phase 4 Plan 04: Frontend Alert Overlay + Admin WhatsApp Config UI Summary

**One-liner:** `CrossSiteAlertOverlay` com countdown 30s e auto-dismiss integrado ao `dashboard-client.tsx` via `feed:alerta-cross-site`, mais CRUD `/api/configuracoes-alerta` protegido por `ADMIN_EMPRESA` e pagina `/configuracoes/alertas` para gerenciar numeros WhatsApp por obra.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | CrossSiteAlertOverlay + integração dashboard | 750bab0 | cross-site-alert-overlay.tsx, cross-site-alert-overlay.test.tsx, dashboard-client.tsx |
| 2 | Backend CRUD + Admin UI alertas WhatsApp | 3be1ea0 | configuracoes-alerta.ts, index.ts, page.tsx, alertas-client.tsx, sidebar.tsx |

## Socket.IO Event Contract

```
Evento escutado pelo frontend: 'feed:alerta-cross-site'
Handler em: apps/web/src/components/dashboard-client.tsx
Comportamento: novo alerta substitui o anterior (setCrossSiteAlert substitui, nao empilha)
```

## Overlay Behavior

- `CrossSiteAlertOverlay` renderiza com `fixed inset-0 z-[100]` acima de todos os elementos
- Countdown regressivo de 30 segundos visivel no header (`data-testid="countdown"`)
- Auto-dismiss quando countdown chega a 0 (via `setInterval` + `useRef` para remaining)
- Botao "Dispensar" fecha imediatamente (`data-testid="dismiss-btn"`)
- Cores: `SUSPEITO` → `bg-orange-500`, `CRITICO` → `bg-red-700` no header do card
- Exibe: placa (grande), nivel, obra detectada, obra de classificacao original, horario

## Admin WhatsApp Config

### Rota de Admin
```
Pagina: /configuracoes/alertas
Arquivo: apps/web/src/app/(admin)/configuracoes/alertas/page.tsx
Acesso: apenas ADMIN_EMPRESA (server-side via auth() + redirect)
```

### API Endpoints
```
GET    /api/configuracoes-alerta?obraId={id}  → lista numeros ativos da obra
POST   /api/configuracoes-alerta              → { obraId, telefone } — valida E.164
DELETE /api/configuracoes-alerta/:id          → remove configuracao
```

### Validacao de Telefone
```
Formato E.164: /^\+\d{10,15}$/
Exemplo valido: +5511999999999
Validado no: frontend (AlertasClient) E backend (configuracoes-alerta.ts)
```

## Test Results

```
apps/web — cross-site-alert-overlay.test.tsx
  CrossSiteAlertOverlay
    ✓ renders plate number and classification level
    ✓ renders obra detected and obra classification names
    ✓ renders CRÍTICO label for critico classification
    ✓ calls onDismiss when dismiss button is clicked
    ✓ auto-dismisses after 30 seconds
    ✓ shows countdown decrementing

Tests  6 passed (6)

TypeScript (apps/web): zero erros nos arquivos deste plano
  (auth.test.ts possui 2 erros pre-existentes fora do escopo deste plano)
TypeScript (apps/api): zero erros
```

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Dupla chamada de onDismiss no auto-dismiss**
- **Found during:** Task 1 — primeiro run dos testes (5/6 passando, auto-dismiss chamava onDismiss 2x)
- **Issue:** Usando `setRemaining(prev => ...)` state updater, o React podia executar o updater multiplas vezes em StrictMode. Quando `prev <= 1` e `prev === 0`, `onDismiss` era chamada duas vezes.
- **Fix:** Substituido state updater por `useRef` para `remainingRef` (fonte de verdade mutavel) e `onDismissRef` para evitar stale closure. `setRemaining` continua sendo chamado apenas para re-render do display.
- **Files modified:** `apps/web/src/components/cross-site-alert-overlay.tsx`
- **Commit:** 750bab0

**2. [Rule 1 - Bug] TS2742 em configuracoes-alerta.ts**
- **Found during:** Task 2 — `tsc --noEmit` em apps/api
- **Issue:** `const router = Router()` sem anotacao de tipo gerava TS2742 ("inferred type cannot be named without reference to .pnpm/...")
- **Fix:** Adicionado `import { type IRouter }` e anotacao `const router: IRouter = Router()`
- **Files modified:** `apps/api/src/routes/configuracoes-alerta.ts`
- **Commit:** 3be1ea0

## Known Stubs

Nenhum — todos os dados exibidos no overlay vem do payload do Socket.IO em tempo real. A pagina `/configuracoes/alertas` carrega dados reais via `/api/obras` e `/api/configuracoes-alerta`.

## Threat Flags

Nenhum novo threat surface nao coberto pelo threat model do plano.

- T-04-11 (EoP): `requireRole('ADMIN_EMPRESA')` em todos os 3 endpoints — OPERADOR recebe 403
- T-04-12 (Tampering): `tenantClient.obra.findFirstOrThrow({ where: { id: obraId } })` garante que obraId pertence a empresa do token
- T-04-14 (DoS): Apenas 1 alerta ativo por vez — `setCrossSiteAlert(incoming)` substitui o estado anterior
- T-04-15 (EoP): `page.tsx` valida `session.user.role !== 'ADMIN_EMPRESA'` no servidor antes de renderizar

## Self-Check: PASSED

- `apps/web/src/components/cross-site-alert-overlay.tsx` — FOUND
- `apps/web/src/components/cross-site-alert-overlay.test.tsx` — FOUND
- `apps/web/src/components/dashboard-client.tsx` — FOUND, `feed:alerta-cross-site` handler presente
- `apps/web/src/app/(admin)/configuracoes/alertas/page.tsx` — FOUND
- `apps/web/src/app/(admin)/configuracoes/alertas/alertas-client.tsx` — FOUND
- `apps/api/src/routes/configuracoes-alerta.ts` — FOUND, requireRole em 3 endpoints
- `apps/api/src/index.ts` — FOUND, rota registrada
- Commits: 750bab0, 3be1ea0 — presentes em git log
- 6/6 testes passando
- tsc --noEmit (apps/api): zero erros
- tsc --noEmit (apps/web): zero erros nos arquivos deste plano
