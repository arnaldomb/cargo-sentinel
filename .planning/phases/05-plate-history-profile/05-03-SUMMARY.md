---
phase: "05"
plan: "03"
name: "Search Page — Busca Cross-Filter"
subsystem: "web"
tags: [search, cursor-pagination, proxy-pattern, next-js, client-component]
status: complete

dependency_graph:
  requires:
    - "05-01: GET /api/eventos/buscar com cursor pagination e busca parcial por placa"
    - "05-02: proxy pattern Next.js estabelecido em placas-proxy"
    - "02-01: authMiddleware + tenantClient para scoping por empresa"
  provides:
    - "GET /buscar — página de busca avançada de eventos com filtros cross-filter"
    - "GET /api/eventos-proxy/buscar — proxy Next.js para /api/eventos/buscar"
    - "GET /api/obras-proxy/:obraId/cameras — proxy dinâmico para dropdown de câmeras"
    - "Link 'Buscar' na sidebar visível para todos os roles"
  affects:
    - "Fases futuras: proxies em /api/*-proxy/* reutilizáveis como padrão estabelecido"

tech_stack:
  added: []
  patterns:
    - "Server Component busca obras ativas na inicialização da página para popular dropdown"
    - "Client Component gerencia estado de formulário + resultados + cursor sem reload"
    - "Dropdown de câmeras carregado dinamicamente após seleção de obra via obras-proxy"
    - "Cursor pagination: loadMore() appenda itens sem resetar filtros do formulário"
    - "Proxy route repassa Cookie do servidor Next.js para Express interno — resolve CORS"
    - "params: Promise<{ obraId: string }> — padrão async params do Next.js 15 em proxy dinâmico"

key_files:
  created:
    - path: "apps/web/src/app/(admin)/buscar/page.tsx"
      change: "Server Component: busca obras ativas via INTERNAL_API_URL, passa lista para BuscarClient"
    - path: "apps/web/src/app/(admin)/buscar/buscar-client.tsx"
      change: "Client Component: formulário com 5 filtros, tabela de resultados com thumbnail/link/badge, botão Carregar mais"
    - path: "apps/web/src/app/api/eventos-proxy/buscar/route.ts"
      change: "Proxy GET: repassa query params + Cookie auth para Express /api/eventos/buscar"
    - path: "apps/web/src/app/api/obras-proxy/[obraId]/cameras/route.ts"
      change: "Proxy GET dinâmico: repassa Cookie para Express /api/obras/:obraId/cameras"
  modified:
    - path: "apps/web/src/components/sidebar.tsx"
      change: "Adicionado import Search de lucide-react e link 'Buscar' para /buscar visível a todos os roles"

decisions:
  - "Rota criada em (admin) em vez de (dashboard) — mantém consistência com 05-02 (projeto usa (admin) como grupo de rotas autenticadas)"
  - "Proxy separado para cameras por obra (/api/obras-proxy/:obraId/cameras) em vez de embutir no buscar-client — segue separação de responsabilidades do padrão proxy estabelecido"
  - "Link Buscar posicionado antes de Alertas WhatsApp na sidebar — acessível a todos os roles, não apenas ADMIN_EMPRESA"

metrics:
  duration_minutes: 18
  completed_date: "2026-06-21"
  tasks_completed: 2
  tasks_total: 2
  files_modified: 5
---

# Phase 05 Plan 03: Search Page Summary

**One-liner:** Página de busca cross-filter com formulário de 5 filtros, tabela paginada cursor-based e dois proxies Next.js que encapsulam auth cookie para o Express interno.

## Páginas e Componentes Criados

### GET /buscar

- **Arquivo:** `apps/web/src/app/(admin)/buscar/page.tsx`
- Server Component — busca obras ativas via `INTERNAL_API_URL/api/obras` antes de renderizar
- Renderiza cabeçalho com título + descrição, delega formulário ao `BuscarClient`
- Retorna lista vazia de obras em caso de erro (graceful degradation)

### BuscarClient

- **Arquivo:** `apps/web/src/app/(admin)/buscar/buscar-client.tsx`
- Formulário com campos: número de placa (parcial, auto-uppercase), data início, data fim, obra (select), câmera (select)
- Câmera desabilitada até seleção de obra; popula dinamicamente via `/api/obras-proxy/:obraId/cameras`
- Resultados em tabela com colunas: Foto (thumbnail 10x16 ou placeholder), Placa (link para `/placas/:numero`), Obra, Câmera, Direção, Horário, Classificação (ClassificationBadge)
- Estado vazio: mensagem "Nenhum evento encontrado para os filtros aplicados"
- Botão "Carregar mais" appenda próxima página sem resetar filtros (cursor pagination)
- Contador de eventos exibidos + indicador "(há mais)" quando nextCursor presente

## Proxies Next.js Criados

### GET /api/eventos-proxy/buscar

- **Arquivo:** `apps/web/src/app/api/eventos-proxy/buscar/route.ts`
- Repassa todos os query params + Cookie auth para Express `/api/eventos/buscar`
- Transparente em status — retorna o mesmo HTTP status code do upstream
- `cache: 'no-store'` — nunca serve cache para dados de segurança em tempo real

### GET /api/obras-proxy/:obraId/cameras

- **Arquivo:** `apps/web/src/app/api/obras-proxy/[obraId]/cameras/route.ts`
- Proxy dinâmico com `params: Promise<{ obraId: string }>` (Next.js 15 async params)
- Encapsula `obraId` via `encodeURIComponent` antes de repassar ao Express
- Necessário para popular dropdown de câmeras a partir do browser sem expor Express via CORS

## Padrão de Proxy Reutilizável

O padrão estabelecido em 05-02 e consolidado em 05-03:

```typescript
// Proxy simples (sem params dinâmicos)
export async function GET(req: NextRequest) {
  const cookieStore = await cookies();
  const search = req.nextUrl.searchParams.toString();
  const upstream = await fetch(`${API_BASE}/api/rota${search ? `?${search}` : ''}`, {
    headers: { Cookie: cookieStore.toString() },
    cache: 'no-store',
  });
  const data: unknown = await upstream.json();
  return Response.json(data, { status: upstream.status });
}

// Proxy com segmento dinâmico
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const cookieStore = await cookies();
  const upstream = await fetch(`${API_BASE}/api/rota/${encodeURIComponent(id)}`, {
    headers: { Cookie: cookieStore.toString() },
    cache: 'no-store',
  });
  const data: unknown = await upstream.json();
  return Response.json(data, { status: upstream.status });
}
```

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Adaptação estrutural] Rota em (admin) em vez de (dashboard)**
- **Found during:** Task 2
- **Issue:** O plano especificava `app/(dashboard)/buscar/page.tsx` mas o projeto usa `(admin)` como grupo de rotas autenticadas (confirmado em 05-02)
- **Fix:** Criados os arquivos em `app/(admin)/buscar/` conforme estrutura real do projeto
- **Files modified:** `page.tsx` e `buscar-client.tsx`
- **Commit:** cb84e1a

## Known Stubs

Nenhum — todos os dados vêm da API real via fetch; sem valores hardcoded ou placeholders.

## Threat Flags

Nenhum — as ameaças T-05-10 a T-05-13 do plano estão cobertas:
- Cookie de auth sempre repassado pelos proxies (T-05-10)
- limit fixo de 20 no client; Express limita em 100 hardcoded (T-05-11)
- Thumbnails com TTL via Garage aceitos em contexto B2B (T-05-12)
- obraId no dropdown filtrado por tenantClient no Express (T-05-13)

## Self-Check: PASSED

- `apps/web/src/app/(admin)/buscar/page.tsx` — FOUND
- `apps/web/src/app/(admin)/buscar/buscar-client.tsx` — FOUND
- `apps/web/src/app/api/eventos-proxy/buscar/route.ts` — FOUND
- `apps/web/src/app/api/obras-proxy/[obraId]/cameras/route.ts` — FOUND
- `apps/web/src/components/sidebar.tsx` contém link "Buscar" e import Search — FOUND
- Commit `39a6fd2` (proxies) — FOUND
- Commit `cb84e1a` (página + sidebar) — FOUND
- `pnpm tsc --noEmit` em apps/web: apenas erros pré-existentes em auth.test.ts (out-of-scope)
