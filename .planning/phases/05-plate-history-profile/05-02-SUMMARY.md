---
phase: "05"
plan: "02"
name: "Plate Profile Page"
subsystem: "web"
tags: [plate-profile, pagination, server-component, next-proxy]
status: complete

dependency_graph:
  requires:
    - "05-01: GET /api/placas/:numero/historico e GET /api/placas/:numero/classificacoes"
    - "04-01: ClassificationBadge, getClassificationColor, getClassificationLabel"
  provides:
    - "GET /placas/:numero — página de perfil de placa (Server Component)"
    - "GET /api/placas-proxy/:numero/historico — proxy Next.js com repasse de cookie"
    - "Link clicável no feed para /placas/:numero em dashboard-client.tsx"
  affects:
    - "05-03: busca de eventos (pode reutilizar o proxy pattern aqui estabelecido)"

tech_stack:
  added: []
  patterns:
    - "Server Component busca dois endpoints em paralelo via Promise.all antes de renderizar"
    - "Client Component gerencia estado de paginação cursor-based sem reload de página"
    - "Proxy route Next.js (/api/placas-proxy) repassa Cookie do servidor para o Express interno — resolve CORS em produção"
    - "params: Promise<{ numero: string }> — padrão async params do Next.js 15"
    - "notFound() do next/navigation retorna 404 quando placa não existe no tenant"

key_files:
  created:
    - path: "apps/web/src/app/(admin)/placas/[numero]/page.tsx"
      change: "Server Component: busca historico + classificacoes em paralelo, renderiza cabecalho com badge, delega timeline ao Client Component"
    - path: "apps/web/src/app/(admin)/placas/[numero]/historico-client.tsx"
      change: "Client Component: estado de items + cursor, loadMore appenda sem reload, botao 'Carregar mais'"
    - path: "apps/web/src/app/api/placas-proxy/[numero]/historico/route.ts"
      change: "Proxy GET route: le cookies() no servidor Next.js e faz fetch interno para Express com Cookie header"
  modified:
    - path: "apps/web/src/components/dashboard-client.tsx"
      change: "Substitui <strong> pelo numero da placa por <Link href='/placas/:numero'> com hover:text-ggtech-blue"

decisions:
  - "Rota colocada em (admin) em vez de (dashboard) — grupo de rotas autenticadas no projeto e (admin), nao (dashboard) como indicado no plano"
  - "Proxy /api/placas-proxy criado para o Client Component poder paginar via browser sem expor Express diretamente (CORS)"
  - "Audit trail de classificacoes carregado no Server Component (sem paginacao) — lista curta por design"

metrics:
  duration_minutes: 20
  completed_date: "2026-06-21"
  tasks_completed: 2
  tasks_total: 2
  files_modified: 4
---

# Phase 05 Plan 02: Plate Profile Page Summary

**One-liner:** Pagina de perfil de placa com Server Component + Client Component para paginacao cursor-based, proxy Next.js para repasse de cookie e numeros de placa clicaveis no feed operacional.

## Rotas Next.js Criadas

### GET /placas/:numero

- **Arquivo:** `apps/web/src/app/(admin)/placas/[numero]/page.tsx`
- Server Component — busca `/api/placas/:numero/historico` e `/api/placas/:numero/classificacoes` em paralelo
- Exibe: cabecalho (numero + ClassificationBadge + transportadora + motorista + tipo + observacao)
- Delega timeline de deteccoes ao `PlacaHistoricoClient` (paginacao "Carregar mais")
- Exibe audit trail de classificacoes com timeline visual (dot colorido por nivel)
- Retorna 404 via `notFound()` quando placa nao existe no tenant

### GET /api/placas-proxy/:numero/historico (proxy interno)

- **Arquivo:** `apps/web/src/app/api/placas-proxy/[numero]/historico/route.ts`
- Lê cookies do servidor via `cookies()` do `next/headers`
- Faz fetch interno para `INTERNAL_API_URL/api/placas/:numero/historico` com `Cookie` header
- Repassa `status` do upstream — transparente para o client
- Necessario para o Client Component paginar sem expor o Express via CORS

## Componentes Criados

### PlacaHistoricoClient

- **Arquivo:** `apps/web/src/app/(admin)/placas/[numero]/historico-client.tsx`
- Recebe `initialItems` e `initialNextCursor` do Server Component
- Estado local: `items` (acumulado) + `cursor` (proximo) + `loading`
- `loadMore()` chama `/api/placas-proxy/:numero/historico?cursor=X&limit=20`
- Append sem reload — `setItems((prev) => [...prev, ...data.items])`
- Botao "Carregar mais" some quando `cursor === null`

## Link no Feed

- **Arquivo:** `apps/web/src/components/dashboard-client.tsx`
- `<strong>` substituido por `<Link href="/placas/{numero}">` com `hover:text-ggtech-blue`
- `data-testid="placa-link"` adicionado para testes

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Adaptacao estrutural] Rota em (admin) em vez de (dashboard)**
- **Found during:** Task 2
- **Issue:** O plano especificava `app/(dashboard)/placas/[numero]/page.tsx` mas o projeto nao tem grupo de rota `(dashboard)` — usa `(admin)` como grupo para rotas autenticadas
- **Fix:** Criados os arquivos em `app/(admin)/placas/[numero]/` conforme estrutura real
- **Files modified:** Todos os 3 arquivos novos criados no path correto
- **Commit:** a4362e5

## Known Stubs

Nenhum — todos os dados vem da API real via fetch; sem valores hardcoded ou placeholders.

## Threat Flags

Nenhum — os endpoints consumidos ja estao no threat model do plano 05-02 (T-05-06, T-05-07, T-05-08, T-05-09). O proxy route nao expoe nova superficie: lê cookies() no servidor, nunca aceita cookie do body.

## Self-Check: PASSED

- `apps/web/src/app/(admin)/placas/[numero]/page.tsx` — FOUND
- `apps/web/src/app/(admin)/placas/[numero]/historico-client.tsx` — FOUND
- `apps/web/src/app/api/placas-proxy/[numero]/historico/route.ts` — FOUND
- Commit `2d52736` (link no feed) — FOUND
- Commit `a4362e5` (pagina de perfil) — FOUND
- `pnpm tsc --noEmit` em apps/web sem erros nos arquivos do plano (erros pre-existentes em auth.test.ts ignorados por serem out-of-scope)
