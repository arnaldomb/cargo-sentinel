---
phase: "06-reports-pdf-excel-photos"
plan: "06-04"
subsystem: "web/relatorios"
tags: ["next.js-15", "socket.io", "tailwind", "client-component", "ssr", "proxy"]
dependency_graph:
  requires: ["06-01", "06-02", "06-03"]
  provides:
    - "Página /relatorios com formulário de 5 filtros + rádio PDF/XLSX"
    - "ReportForm — submit POST assíncrono sem bloquear UI"
    - "ReportList — tabela de status com Socket.IO report:pronto + polling 30s fallback"
    - "RelatoriosClient — wrapper que compartilha estado entre Form e List"
    - "Sidebar com link Relatórios (FileText icon)"
    - "Proxy /api/relatorios-proxy (GET + POST)"
    - "Proxy /api/relatorios-proxy/[id]/download (GET)"
  affects:
    - "apps/web/src/components/sidebar.tsx"
    - "apps/web/src/app/(admin)/relatorios/"
    - "apps/web/src/components/relatorios/"
    - "apps/web/src/app/api/relatorios-proxy/"
tech_stack:
  added: []
  patterns:
    - "Server Component (SSR) → Client Component wrapper (RelatoriosClient) → dois Client Components filhos"
    - "cookies() + INTERNAL_API_URL para fetch server-side autenticado"
    - "io(apiBaseUrl, { withCredentials, path, transports }) — padrão de conexão Socket.IO do projeto"
    - "Polling 30s como fallback para Socket.IO — setInterval com clearInterval no cleanup"
    - "Next.js 15 async params: { params: Promise<{ id: string }> } no route handler de download"
    - "Proxy Next.js repassa Cookie header para Express — sem exposição de credenciais ao browser"
key_files:
  created:
    - apps/web/src/components/relatorios/report-form.tsx
    - apps/web/src/components/relatorios/report-list.tsx
    - apps/web/src/app/(admin)/relatorios/relatorios-client.tsx
    - apps/web/src/app/(admin)/relatorios/page.tsx
    - apps/web/src/app/api/relatorios-proxy/route.ts
    - apps/web/src/app/api/relatorios-proxy/[id]/download/route.ts
  modified:
    - apps/web/src/components/sidebar.tsx
decisions:
  - "RelatoriosClient como wrapper Client Component resolve impossibilidade de passar callbacks de Server para Client Component no Next.js 15"
  - "Socket.IO instanciado diretamente no ReportList (mesmo padrão de dashboard-client.tsx — sem hook abstrato)"
  - "Polling 30s como fallback caso Socket.IO desconecte — não substitui mas complementa o evento em tempo real"
  - "handleReportRequested adiciona item PENDENTE otimisticamente ao topo da lista sem aguardar polling"
  - "Proxy Next.js /api/relatorios-proxy repassa Cookie para manter autenticação sem expor token ao browser"
  - "Link Relatórios visível para todos os roles logados (sem condicional) — equivalente ao link Buscar"
metrics:
  duration: "~20 min"
  completed: "2026-06-21"
  tasks_completed: 2
  files_modified: 7
---

# Phase 06 Plan 04: Frontend Reports Page Summary

**One-liner:** Página `/relatorios` com formulário de 5 filtros (formato radio PDF/XLSX, placa, data, obra, câmera, classificação), lista de status em tempo real via Socket.IO `report:pronto` + polling de 30s como fallback, botão de download com presigned URL e link na sidebar.

## What Was Built

### Task 1: Componentes e página /relatorios (commit `81eae5d`)

#### `apps/web/src/components/relatorios/report-form.tsx`

Client Component com formulário completo de filtros:

| Campo | Tipo | Comportamento |
|-------|------|---------------|
| `formato` | Radio PDF/XLSX | Obrigatório; default PDF |
| `placa` | Input text | Convertido para maiúsculas; match parcial |
| `dataInicio` / `dataFim` | datetime-local | Convertido para ISO string antes do POST |
| `obraId` | Select | Carregado via `GET /api/obras` na montagem |
| `cameraId` | Select | Carregado via `/api/obras-proxy/[id]/cameras` ao mudar obra |
| `classificacao` | Select | Opções: todas + 5 níveis (LIBERADO → CRITICO) |

**Submit flow:**
1. `loading=true` → desabilita botão
2. `POST /api/relatorios-proxy` com body `{ formato, filtros }`
3. `202`: `setSuccessMsg("Relatório solicitado!")` → `onReportRequested(relatorioId)` → reset form
4. Erro: `setError(data.error)` em painel vermelho

Props: `{ onReportRequested: (relatorioId: string) => void }`

#### `apps/web/src/components/relatorios/report-list.tsx`

Client Component com tabela de relatórios + tempo real:

**Estado interno:** `items` (inicializado com `initialItems` do SSR), atualizado por Socket.IO e polling.

**Socket.IO integration:**
```typescript
const socket = io(apiBaseUrl, {
  withCredentials: true,
  path: '/socket.io',
  transports: ['websocket', 'polling'],
});
socket.on('report:pronto', (payload) => {
  setItems(prev => prev.map(item =>
    item.id === payload.relatorioId
      ? { ...item, status: 'PRONTO', expiresAt: payload.expiresAt }
      : item
  ));
  setToastMsg(`Relatório ${payload.formato} pronto para download!`);
});
```

**Polling 30s fallback:** `setInterval(() => fetch('/api/relatorios-proxy'))` com cleanup no `return`.

**Badges de status:**
| Status | Aparência |
|--------|-----------|
| PENDENTE | Cinza (`bg-slate-100`) |
| PROCESSANDO | Azul pulsante (`bg-blue-100` + spinner animado) |
| PRONTO | Verde (`bg-green-100`) |
| ERRO | Vermelho (`bg-red-100`) + erroMsg abaixo |

**Download:** `GET /api/relatorios-proxy/[id]/download` → `window.open(downloadUrl, '_blank', 'noopener,noreferrer')`
- Status 410: toast "Link expirado"
- `expiresAt < now`: badge "Expirado" em vez do botão

#### `apps/web/src/app/(admin)/relatorios/relatorios-client.tsx`

Wrapper Client Component que:
- Mantém `items: RelatorioItem[]` como estado compartilhado
- Passa `onReportRequested` para `ReportForm`: adiciona item PENDENTE otimisticamente ao topo
- Passa `initialItems={items}` para `ReportList`

#### `apps/web/src/app/(admin)/relatorios/page.tsx`

Server Component (Next.js 15, App Router):
- `cookies()` + `INTERNAL_API_URL` para SSR autenticado da lista inicial
- Fallback `[]` em caso de erro de rede (não bloqueia renderização)
- Renderiza `<RelatoriosClient initialItems={initialItems} />`

#### Proxies Next.js

| Rota | Método | Upstream Express |
|------|--------|-----------------|
| `/api/relatorios-proxy` | GET | `GET /api/relatorios?limit=20` |
| `/api/relatorios-proxy` | POST | `POST /api/relatorios` |
| `/api/relatorios-proxy/[id]/download` | GET | `GET /api/relatorios/:id/download` |

Todos repassam `Cookie: cookieStore.toString()` para autenticação no Express.

### Task 2: Sidebar — link Relatórios (commit `e9ab73a`)

Em `apps/web/src/components/sidebar.tsx`:

```tsx
import { X, LayoutDashboard, Bell, Search, FileText } from 'lucide-react';

// Inserido entre Buscar e Alertas WhatsApp:
<a
  href="/relatorios"
  className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-blue-200 transition-colors hover:bg-white/10 hover:text-white"
>
  <FileText size={16} aria-hidden="true" />
  Relatórios
</a>
```

Visível para todos os roles logados (sem condicional de role — equivalente ao link Buscar).

## Padrão Socket.IO Seguido

Mesma forma de conexão do `dashboard-client.tsx`:
- `io(apiBaseUrl, { withCredentials: true, path: '/socket.io', transports: ['websocket', 'polling'] })`
- Sem hook abstrato ou singleton — instância por componente, fechada no cleanup do `useEffect`
- `apiBaseUrl` resolvido via `resolveApiBaseUrl(window.location.hostname, window.location.protocol)`

## Como o Estado é Compartilhado entre ReportForm e ReportList

```
page.tsx (Server)
  └─ RelatoriosClient (Client, useState[items])
       ├─ ReportForm (onReportRequested → adiciona item PENDENTE ao items)
       └─ ReportList (initialItems={items}, atualiza via Socket.IO internamente)
```

`RelatoriosClient` é o único detentor do estado da lista. `ReportForm` apenas notifica via callback quando um relatório foi criado. `ReportList` mantém sub-estado local (atualizado por Socket.IO) mas começa com os `initialItems` do pai.

## Decisions Made

1. **RelatoriosClient como wrapper** — Next.js 15 não permite passar funções (`onReportRequested`) de Server para Client Component. O wrapper Client Component resolve isso mantendo o estado e callbacks no lado do cliente.

2. **Socket.IO instanciado no componente** — Mesmo padrão de `dashboard-client.tsx`. Sem singleton nem hook abstrato — cada componente abre/fecha sua própria conexão no `useEffect`.

3. **Polling 30s como fallback** — Garante que a lista se atualize mesmo se o WebSocket desconectar brevemente (rede instável, reconexão em andamento).

4. **Atualização otimista na lista** — `handleReportRequested` adiciona item PENDENTE imediatamente ao topo sem aguardar o próximo polling. UX mais responsiva.

5. **Link Relatórios sem condicional de role** — O plan especificava "visível para OPERADOR e ADMIN_EMPRESA". Como ambos os roles logados têm acesso (e o link Buscar também não tem condicional), seguiu-se o mesmo padrão sem `userRole === 'ADMIN_EMPRESA'`.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Dados de obras carregados do endpoint Express, não de proxy Next.js**
- **Found during:** Task 1 (análise do padrão existente em `alertas-client.tsx`)
- **Issue:** O plan sugeria `useEffect` para `/api/obras`, mas o endpoint está no Express (porta 4000), não no Next.js. O padrão do projeto usa `apiBaseUrl` do `resolveApiBaseUrl` para chamar diretamente o Express com `credentials: 'include'`.
- **Fix:** `fetch(`${apiBaseUrl}/api/obras`, { credentials: 'include' })` — mesmo padrão de `alertas-client.tsx`.
- **Files modified:** `apps/web/src/components/relatorios/report-form.tsx`
- **Commit:** `81eae5d`

**2. [Rule 2 - Missing Critical] relatorios-client.tsx não estava no plano como arquivo separado**
- **Found during:** Task 1 (análise do plano — o PLAN.md menciona o wrapper mas não o inclui em `files_modified`)
- **Issue:** O plan mencionava criar `RelatoriosClient` como solução para o problema de callback Server→Client, mas não listava o arquivo em `files_modified`. O arquivo é necessário para a correta divisão Server/Client Component no Next.js 15.
- **Fix:** Criado `apps/web/src/app/(admin)/relatorios/relatorios-client.tsx`.
- **Files modified:** novo arquivo
- **Commit:** `81eae5d`

## Known Stubs

Nenhum stub. Todos os campos do formulário estão funcionais, o Socket.IO está integrado, e os proxies estão implementados. O status `PENDENTE` adicionado otimisticamente na lista será substituído pelo polling de 30s com dados reais da API.

## Threat Surface Scan

Novos proxies criados em `/api/relatorios-proxy` introduzem surface no Next.js, mas são cobertos pelos trust boundaries do plano:

| Threat ID | Implementação |
|-----------|---------------|
| T-06-13 | `window.open(downloadUrl, '_blank', 'noopener,noreferrer')` — noopener/noreferrer implementado |
| T-06-14 | API Express valida obraId/cameraId por tenant — frontend não pode forjar; proxy apenas repassa |
| T-06-15 | Server Component usa `cookies()` para autenticação SSR — lista filtrada por `criadoPor` no Express para OPERADOR |

Nenhuma nova superfície além das previstas no threat_model.

## Self-Check: PASSED

| Check | Result |
|-------|--------|
| `apps/web/src/components/relatorios/report-form.tsx` exists | FOUND |
| `apps/web/src/components/relatorios/report-list.tsx` exists | FOUND |
| `apps/web/src/app/(admin)/relatorios/relatorios-client.tsx` exists | FOUND |
| `apps/web/src/app/(admin)/relatorios/page.tsx` exists | FOUND |
| `apps/web/src/app/api/relatorios-proxy/route.ts` exists | FOUND |
| `apps/web/src/app/api/relatorios-proxy/[id]/download/route.ts` exists | FOUND |
| `apps/web/src/components/sidebar.tsx` tem FileText import | FOUND |
| `apps/web/src/components/sidebar.tsx` tem link /relatorios | FOUND |
| `pnpm exec tsc --noEmit` — sem novos erros | PASSED (só erros pré-existentes em auth.test.ts) |
| Commit `81eae5d` (componentes + proxies) | FOUND |
| Commit `e9ab73a` (sidebar) | FOUND |
| Socket.IO segue padrão de `dashboard-client.tsx` | FOUND |
| Proxy repassa Cookie header (autenticação transparente) | FOUND |
| `window.open` usa `noopener,noreferrer` (T-06-13) | FOUND |
| Polling 30s como fallback | FOUND |
