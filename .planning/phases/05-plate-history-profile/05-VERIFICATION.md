---
phase: 05-plate-history-profile
verified: 2026-06-21T00:00:00Z
status: human_needed
score: 4/4 must-haves verified
overrides_applied: 0
human_verification:
  - test: "Clicar em um número de placa no feed operacional e verificar navegação para /placas/:numero"
    expected: "Página de perfil abre com cabeçalho (número + badge de classificação), timeline de detecções com thumbnail/obra/câmera/direção/horário, e seção de histórico de classificações"
    why_human: "Comportamento de clique, navegação Next.js e renderização do Server Component com dados reais requerem browser + API em execução"
  - test: "Executar uma busca na página /buscar com filtros (placa parcial + obraId) e verificar paginação"
    expected: "Resultados aparecem em tabela; 'Carregar mais' appenda próxima página sem resetar filtros; contador de eventos atualiza corretamente"
    why_human: "Comportamento dinâmico do Client Component com fetch real, estado de paginação e dropdown dinâmico de câmeras só podem ser verificados em runtime"
  - test: "Com 20+ eventos para uma placa, clicar 'Carregar mais' na página de perfil"
    expected: "Novos eventos são appendados ao final da lista sem reload de página; botão desaparece quando nextCursor é null"
    why_human: "Requer dados suficientes no banco (ou fixture) e verificação de comportamento DOM sem reload"
---

# Fase 05: Plate History + Profile — Relatório de Verificacao

**Goal da Fase:** Any operator can look up any plate and see its complete detection history across all obras of their empresa — with a full classification audit trail and cursor-based pagination that does not degrade on large datasets.
**Verificado:** 2026-06-21
**Status:** human_needed
**Re-verificacao:** Nao — verificacao inicial

## Resultado do Goal

### Verdades Observaveis

| # | Verdade | Status | Evidencia |
|---|---------|--------|-----------|
| 1 | Clicar em numero de placa no feed abre /placas/:numero com historico de deteccoes (HISTORY-01) | VERIFICADO | `dashboard-client.tsx` linha 253-259: `<Link href="/placas/${item.placaNumero}" data-testid="placa-link">`. Rota `/placas/[numero]/page.tsx` existe em `apps/web/src/app/(admin)/placas/[numero]/page.tsx` (181 linhas), busca `/api/placas/:numero/historico` no Server Component. |
| 2 | Audit trail de classificacoes mostra usuario responsavel e timestamp exato (HISTORY-02) | VERIFICADO | `placas.ts` rota `GET /:numero/classificacoes` retorna `classificacaoHistorico.findMany` com `select: { usuario: { select: { id, nome } } }`. `page.tsx` renderiza `entry.usuario.nome` e `entry.createdAt` em cada item da timeline. |
| 3 | Busca por placa/data/obra/camera com cursor pagination (HISTORY-03) | VERIFICADO | `eventos.ts` rota `GET /buscar` implementada com filtros `placa` (contains/insensitive), `obraId`, `cameraId`, `dataInicio`, `dataFim`, `cursor`. `buscar-client.tsx` envia todos os filtros via `/api/eventos-proxy/buscar`. |
| 4 | Indice composto em Evento previne full-table scan; cursor pagination em todas as rotas (HISTORY-04) | VERIFICADO | `schema.prisma` linha 160: `@@index([empresaId, placaId, timestamp(sort: Desc)])` presente no model `Evento`. Todas as 3 rotas usam `take: limit + 1, cursor: { id }, skip: 1, orderBy: { timestamp: 'desc' }`. |

**Pontuacao:** 4/4 verdades verificadas

### Artefatos Obrigatorios

| Artefato | Descricao | Status | Detalhes |
|----------|-----------|--------|----------|
| `packages/database/prisma/schema.prisma` | Indice composto em Evento | VERIFICADO | Linha 160: `@@index([empresaId, placaId, timestamp(sort: Desc)])` com comentario HISTORY-04 |
| `apps/api/src/routes/placas.ts` | GET /:numero/historico e GET /:numero/classificacoes | VERIFICADO | 234 linhas; ambas as rotas implementadas com cursor pagination, requireRole, tenantClient, presigned URLs e 404 para placa inexistente |
| `apps/api/src/routes/eventos.ts` | GET /buscar com filtros compostos | VERIFICADO | Rota `/buscar` registrada na linha 18, ANTES de `/feed`, com todos os 5 filtros + cursor pagination |
| `apps/web/src/app/(admin)/placas/[numero]/page.tsx` | Server Component de perfil de placa | VERIFICADO | 181 linhas; busca historico + classificacoes em paralelo (Promise.all), renderiza cabecalho + PlacaHistoricoClient + audit trail |
| `apps/web/src/app/(admin)/placas/[numero]/historico-client.tsx` | Client Component de paginacao | VERIFICADO | 109 linhas; estado de items + cursor, loadMore() via `/api/placas-proxy/`, append sem reload |
| `apps/web/src/app/api/placas-proxy/[numero]/historico/route.ts` | Proxy Next.js para paginacao client-side | VERIFICADO | 25 linhas; repassa Cookie via `cookies()`, encaminha para Express com `cache: 'no-store'` |
| `apps/web/src/app/(admin)/buscar/page.tsx` | Server Component de busca | VERIFICADO | 38 linhas; busca obras ativas para dropdown, delega para BuscarClient |
| `apps/web/src/app/(admin)/buscar/buscar-client.tsx` | Client Component de busca com formulario | VERIFICADO | Formulario com 5 filtros, tabela de resultados, dropdown dinamico de cameras, cursor pagination |
| `apps/web/src/app/api/eventos-proxy/buscar/route.ts` | Proxy Next.js para busca | VERIFICADO | 21 linhas; repassa query params + Cookie para Express |
| `apps/web/src/app/api/obras-proxy/[obraId]/cameras/route.ts` | Proxy Next.js para cameras dinamicas | VERIFICADO | 24 linhas; proxy dinamico com async params do Next.js 15 |
| `apps/web/src/components/dashboard-client.tsx` | Numero de placa como link clicavel | VERIFICADO | Linha 253-259: `<Link href="/placas/${item.placaNumero}" data-testid="placa-link">` com hover styles |
| `apps/web/src/components/sidebar.tsx` | Link "Buscar" na sidebar | VERIFICADO | Linha 68-74: `<a href="/buscar">` com `<Search size={16}>` importado de lucide-react, visivel para todos os roles |

### Verificacao de Links Chave

| De | Para | Via | Status | Detalhes |
|----|------|-----|--------|----------|
| `dashboard-client.tsx` | `/placas/[numero]/page.tsx` | `<Link href="/placas/${item.placaNumero}">` | WIRED | Link implementado na linha 253; href dinamico com placaNumero do FeedItem |
| `placas/[numero]/page.tsx` | `GET /api/placas/:numero/historico` | fetch no Server Component com Cookie header | WIRED | `fetchPlacaHistorico()` linha 54-61: fetch com `${API_BASE}/api/placas/${encodeURIComponent(numero)}/historico` |
| `placas/[numero]/page.tsx` | `GET /api/placas/:numero/classificacoes` | fetch no Server Component com Cookie header | WIRED | `fetchPlacaClassificacoes()` linha 63-73: fetch paralelo via Promise.all |
| `historico-client.tsx` | `GET /api/placas-proxy/[numero]/historico` | fetch com credentials include | WIRED | Linha 38: `/api/placas-proxy/${encodeURIComponent(placaNumero)}/historico?cursor=...` |
| `buscar/page.tsx` | `GET /api/obras` | fetch no Server Component para popular dropdown | WIRED | `fetchObras()` linha 9-19: fetch com Cookie para INTERNAL_API_URL/api/obras |
| `buscar-client.tsx` | `GET /api/eventos-proxy/buscar` | fetch com credentials include | WIRED | `handleSearch()` e `loadMore()` chamam `/api/eventos-proxy/buscar?${buildSearchParams()}` |
| `apps/api/src/index.ts` | `placasRouter` | `app.use('/api/placas', ...protectedPipeline, placasRouter)` | WIRED | Linha 38: rota registrada com protectedPipeline (auth + tenant) |
| `apps/api/src/index.ts` | `eventosRouter` | `app.use('/api/eventos', ...protectedPipeline, eventosRouter)` | WIRED | Linha 39: rota registrada com protectedPipeline |

### Rastreamento de Dados (Nivel 4)

| Artefato | Variavel de Estado | Fonte de Dados | Dados Reais | Status |
|----------|-------------------|----------------|-------------|--------|
| `placas/[numero]/page.tsx` | `historico.items` | `req.tenantClient!.evento.findMany({ where: { placaId } })` | Sim — query Prisma com filtro real, cursor, orderBy | FLOWING |
| `placas/[numero]/page.tsx` | `classificacoes.items` | `req.tenantClient!.classificacaoHistorico.findMany({ where: { placaId } })` | Sim — query com select de usuario.nome | FLOWING |
| `historico-client.tsx` | `items` (estado acumulado) | `/api/placas-proxy/:numero/historico` → Express → Prisma | Sim — proxy transparente, sem cache | FLOWING |
| `buscar-client.tsx` | `items` | `/api/eventos-proxy/buscar` → `req.tenantClient!.evento.findMany({ where })` | Sim — filtros compostos aplicados no Prisma | FLOWING |

### Verificacoes Comportamentais (Spot-checks)

| Comportamento | Comando | Resultado | Status |
|---------------|---------|-----------|--------|
| Indice composto presente no schema | `grep "empresaId, placaId, timestamp" schema.prisma` | `@@index([empresaId, placaId, timestamp(sort: Desc)])` na linha 160 | PASS |
| Rota /buscar antes de /feed no router | `grep -n "buscar\|feed" eventos.ts` | `/buscar` na linha 19, `/feed` na linha 97 | PASS |
| Link de placa no feed usa Next.js Link com href correto | `grep "href.*placas" dashboard-client.tsx` | `href={\`/placas/${item.placaNumero}\`}` linha 254 | PASS |
| Cursor pagination — take limit+1 | `grep "take: limit" placas.ts eventos.ts` | Presente em todas as 3 rotas | PASS |
| requireRole em todas as rotas novas | `grep "requireRole" placas.ts eventos.ts` | Presente em historico, classificacoes e buscar | PASS |
| Proxy repassa Cookie sem cache | `grep "cache: 'no-store'" route.ts` (proxies) | Presente em todos os 3 proxies | PASS |
| Sidebar tem link Buscar com icone Search | Leitura de sidebar.tsx | `<a href="/buscar">` + `<Search size={16}>` + import de lucide-react | PASS |

### Cobertura de Requisitos

| Requisito | Plano | Descricao | Status | Evidencia |
|-----------|-------|-----------|--------|-----------|
| HISTORY-01 | 05-01, 05-02 | Pagina de perfil de placa com todas as deteccoes, obras, cameras, horarios | SATISFEITO | `placas/[numero]/page.tsx` renderiza timeline de deteccoes via `PlacaHistoricoClient`; link no feed implementado |
| HISTORY-02 | 05-01, 05-02 | Timeline cronologica de classificacoes com usuario responsavel | SATISFEITO | Rota `GET /classificacoes` retorna `usuario.nome`; `page.tsx` renderiza `entry.usuario.nome` e timestamp em cada entrada |
| HISTORY-03 | 05-01, 05-03 | Busca de historico por placa, data, hora, obra, camera | SATISFEITO | `GET /eventos/buscar` com filtros compostos; `buscar-client.tsx` com formulario de 5 campos |
| HISTORY-04 | 05-01 | Paginacao cursor-based sem full-table scan | SATISFEITO | `@@index([empresaId, placaId, timestamp(sort: Desc)])` adicionado; todas as rotas usam cursor keyset pagination |

### Anti-Patterns Encontrados

| Arquivo | Linha | Pattern | Severidade | Impacto |
|---------|-------|---------|------------|---------|
| Nenhum encontrado | — | — | — | — |

Scan realizado em: `placas.ts`, `eventos.ts`, `placas/[numero]/page.tsx`, `historico-client.tsx`, `buscar/page.tsx`, `buscar-client.tsx`, `dashboard-client.tsx`. Nenhum TODO, FIXME, placeholder, return vazio ou implementacao stub encontrado.

**Nota estrutural:** Os planos especificavam `app/(dashboard)/` mas o projeto usa `app/(admin)/` como grupo de rotas autenticadas. Todos os arquivos foram criados no path correto `(admin)`. Esta e uma adaptacao estrutural esperada documentada nos SUMMARYs de 05-02 e 05-03.

### Verificacao Humana Necessaria

#### 1. Navegacao por clique no feed

**Teste:** Fazer login como OPERADOR, visualizar o feed em tempo real, clicar em qualquer numero de placa.
**Esperado:** Navegar para `/placas/ABC1234` exibindo: (a) cabecalho com numero + badge de classificacao colorido, (b) timeline de deteccoes com thumbnail, obra, camera, direcao e horario, (c) secao de historico de classificacoes com nivel anterior → nivel atual, nome do usuario e timestamp.
**Por que humano:** Comportamento de clique, navegacao client-side do Next.js e renderizacao do Server Component com dados reais do banco requerem browser e API em execucao.

#### 2. Paginacao "Carregar mais" na pagina de perfil

**Teste:** Abrir `/placas/[numero]` para uma placa com mais de 20 eventos. Clicar em "Carregar mais".
**Esperado:** Novos eventos sao appendados ao final da lista sem reload de pagina. O botao desaparece quando `nextCursor` e null. O scroll nao reseta.
**Por que humano:** Requer volume real de dados e verificacao de comportamento DOM / estado React sem reload.

#### 3. Busca com filtros na pagina /buscar

**Teste:** Navegar para `/buscar`. Digitar prefixo de placa, selecionar obra (o dropdown de cameras deve popular dinamicamente), executar busca. Com resultados > 20, clicar "Carregar mais".
**Esperado:** Resultados em tabela com colunas corretas (foto, placa-link, obra, camera, direcao, horario, classificacao). "Carregar mais" appenda sem resetar filtros. Numero de placa na tabela e clicavel para `/placas/:numero`.
**Por que humano:** Estado dinamico de formulario, dropdown dependente (obras → cameras), fetch real e paginacao cursor-based so podem ser verificados em runtime com dados reais.

### Resumo

Todos os 4 criterios de sucesso do roadmap foram verificados no codigo:

1. **HISTORY-01**: Numero de placa no feed e `<Link>` para `/placas/:numero`. Pagina Server Component existe (181 linhas) e busca os dois endpoints em paralelo.
2. **HISTORY-02**: Rota `GET /classificacoes` retorna `usuario.nome` e timestamp em cada entrada. Timeline renderizada com `entry.usuario.nome` e `entry.createdAt`.
3. **HISTORY-03**: Pagina `/buscar` com 5 filtros (placa parcial, dataInicio, dataFim, obra, camera) e proxies Next.js encadeados.
4. **HISTORY-04**: Indice composto `@@index([empresaId, placaId, timestamp(sort: Desc)])` presente no schema; cursor keyset pagination implementado nas 3 rotas backend.

Nenhum anti-pattern, stub ou dado hardcoded encontrado. O fluxo de dados e completo: banco → Prisma tenantClient → Express → proxy Next.js → Client Component.

Status **human_needed** porque comportamentos de UI (navegacao por clique, paginacao append, dropdown dinamico de cameras) nao sao verificaveis programaticamente sem browser e servicos em execucao.

---

_Verificado: 2026-06-21_
_Verificador: Claude (gsd-verifier)_
