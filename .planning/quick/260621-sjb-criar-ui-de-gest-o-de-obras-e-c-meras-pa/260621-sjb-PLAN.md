---
phase: quick-260621-sjb
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - apps/web/src/app/api/obras-proxy/route.ts
  - apps/web/src/app/api/obras-proxy/[id]/route.ts
  - apps/web/src/app/api/obras-proxy/[id]/cameras/route.ts
  - apps/web/src/app/api/obras-proxy/[id]/cameras/[cameraId]/route.ts
  - apps/web/src/app/(admin)/gestao/page.tsx
  - apps/web/src/app/(admin)/gestao/obras/nova/page.tsx
  - apps/web/src/app/(admin)/gestao/obras/[id]/page.tsx
  - apps/web/src/app/(admin)/gestao/obras/[id]/cameras/nova/page.tsx
  - apps/web/src/app/(admin)/gestao/actions.ts
  - apps/web/src/app/(admin)/gestao/delete-obra-button.tsx
  - apps/web/src/app/(admin)/gestao/obras/[id]/delete-camera-button.tsx
  - apps/web/src/components/sidebar.tsx
autonomous: true
requirements: []

must_haves:
  truths:
    - "ADMIN_EMPRESA vê link 'Gestão' na sidebar"
    - "Listagem /gestao mostra obras com count de câmeras"
    - "Formulário /gestao/obras/nova cria obra via Express API"
    - "Página /gestao/obras/[id] lista câmeras da obra com status"
    - "Formulário /gestao/obras/[id]/cameras/nova cria câmera"
    - "Botões de delete fazem soft-delete (ativo=false) via confirmação"
  artifacts:
    - path: apps/web/src/app/api/obras-proxy/route.ts
      provides: "GET /api/obras-proxy + POST /api/obras-proxy"
    - path: apps/web/src/app/api/obras-proxy/[id]/route.ts
      provides: "PUT + DELETE /api/obras-proxy/[id]"
    - path: apps/web/src/app/api/obras-proxy/[id]/cameras/route.ts
      provides: "GET + POST cameras (já existe só GET — adicionar POST)"
    - path: apps/web/src/app/api/obras-proxy/[id]/cameras/[cameraId]/route.ts
      provides: "PUT + DELETE câmera individual"
    - path: apps/web/src/app/(admin)/gestao/page.tsx
      provides: "Lista de obras com câmeras count"
    - path: apps/web/src/app/(admin)/gestao/actions.ts
      provides: "Server Actions criarObra, criarCamera"
  key_links:
    - from: "gestao/page.tsx"
      to: "INTERNAL_API_URL/api/obras"
      via: "fetch direto no Server Component (mesmo padrão buscar/page.tsx)"
    - from: "gestao/actions.ts Server Actions"
      to: "/api/obras-proxy (rotas Next.js)"
      via: "fetch com cookies() para encaminhar auth"
    - from: "delete-obra-button.tsx"
      to: "/api/obras-proxy/[id]"
      via: "fetch DELETE client-side com confirm()"
---

<objective>
Construir a UI completa de gestão de obras e câmeras para o role ADMIN_EMPRESA, incluindo
proxies Next.js faltantes, páginas Server Component de listagem/detalhe, formulários via
Server Actions e botões de delete com confirmação.

Purpose: Permitir que o ADMIN_EMPRESA cadastre obras e câmeras LPR diretamente no painel
sem precisar de acesso direto à API Express.

Output: 4 rotas proxy, 4 páginas, Server Actions, 2 Client Components de delete, sidebar atualizada.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md

# Padrões existentes a seguir:
# - Server Component + fetch direto: apps/web/src/app/(admin)/buscar/page.tsx
# - Proxy pattern: apps/web/src/app/api/obras-proxy/[obraId]/cameras/route.ts
# - Page ADMIN com auth guard: apps/web/src/app/(admin)/configuracoes/alertas/page.tsx
# - Sidebar com role check: apps/web/src/components/sidebar.tsx

<interfaces>
<!-- Proxy existente (GET cameras) — estender para POST -->
<!-- apps/web/src/app/api/obras-proxy/[obraId]/cameras/route.ts -->
```typescript
import { type NextRequest } from 'next/server';
import { cookies } from 'next/headers';
const API_BASE = process.env.INTERNAL_API_URL ?? 'http://localhost:4000';
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ obraId: string }> },
) {
  const { obraId } = await params;
  const cookieStore = await cookies();
  const upstream = await fetch(
    `${API_BASE}/api/obras/${encodeURIComponent(obraId)}/cameras`,
    { headers: { Cookie: cookieStore.toString() }, cache: 'no-store' },
  );
  const data: unknown = await upstream.json();
  return Response.json(data, { status: upstream.status });
}
```

<!-- Express API shapes (inferidos do uso em buscar/page.tsx) -->
```typescript
// GET /api/obras → { obras: Obra[] }
// POST /api/obras → body: { nome: string; endereco?: string } → 201 { obra: Obra }
// PUT /api/obras/:id → body: { nome?: string; endereco?: string } → { obra: Obra }
// DELETE /api/obras/:id → soft-delete → 204 ou { ok: true }
// GET /api/obras/:obraId/cameras → { cameras: Camera[] }
// POST /api/obras/:obraId/cameras → body: { codigoLpr: string; ip?: string } → 201 { camera: Camera }
// DELETE /api/obras/:obraId/cameras/:id → soft-delete → 204 ou { ok: true }

type Obra = { id: string; nome: string; endereco?: string; ativo: boolean; _count?: { cameras: number } };
type Camera = { id: string; codigoLpr: string; ip?: string; ativo: boolean; status?: string; ultimoEventoEm?: string };
```

<!-- Sidebar role check pattern -->
```tsx
{userRole === 'ADMIN_EMPRESA' && (
  <a href="/configuracoes/alertas" className="flex items-center gap-2 rounded-lg px-3 py-2 ...">
    <Bell size={16} />
    Alertas WhatsApp
  </a>
)}
```
</interfaces>
</context>

<tasks>

<task type="auto">
  <name>Task 1: Criar/completar proxies Next.js para obras e câmeras</name>
  <files>
    apps/web/src/app/api/obras-proxy/route.ts,
    apps/web/src/app/api/obras-proxy/[id]/route.ts,
    apps/web/src/app/api/obras-proxy/[id]/cameras/route.ts,
    apps/web/src/app/api/obras-proxy/[id]/cameras/[cameraId]/route.ts
  </files>
  <action>
    IMPORTANTE: O arquivo `apps/web/src/app/api/obras-proxy/[obraId]/cameras/route.ts` JÁ EXISTE
    com GET. O diretório usa `[obraId]` como param name. Para gestão, criar estrutura paralela
    em `[id]` (não conflita pois são caminhos diferentes no filesystem Next.js).

    Criar 4 arquivos de proxy seguindo o padrão existente (cookies() para auth, INTERNAL_API_URL,
    Response.json(data, { status: upstream.status })):

    **1. `obras-proxy/route.ts`** — GET lista obras + POST cria obra:
    ```typescript
    import { type NextRequest } from 'next/server';
    import { cookies } from 'next/headers';
    const API_BASE = process.env.INTERNAL_API_URL ?? 'http://localhost:4000';
    export async function GET() {
      const cookieStore = await cookies();
      const upstream = await fetch(`${API_BASE}/api/obras`, {
        headers: { Cookie: cookieStore.toString() }, cache: 'no-store',
      });
      return Response.json(await upstream.json(), { status: upstream.status });
    }
    export async function POST(req: NextRequest) {
      const cookieStore = await cookies();
      const body = await req.json();
      const upstream = await fetch(`${API_BASE}/api/obras`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: cookieStore.toString() },
        body: JSON.stringify(body),
      });
      return Response.json(await upstream.json(), { status: upstream.status });
    }
    ```

    **2. `obras-proxy/[id]/route.ts`** — PUT atualiza + DELETE soft-delete:
    Params: `{ params: Promise<{ id: string }> }`. Usar `await params` (Next.js 15).
    PUT encaminha body JSON. DELETE encaminha sem body.

    **3. `obras-proxy/[id]/cameras/route.ts`** — GET lista + POST cria câmera:
    Params: `{ params: Promise<{ id: string }> }`. Upstream url: `/api/obras/${id}/cameras`.

    **4. `obras-proxy/[id]/cameras/[cameraId]/route.ts`** — PUT + DELETE câmera:
    Params: `{ params: Promise<{ id: string; cameraId: string }> }`.
    Upstream url: `/api/obras/${id}/cameras/${cameraId}`.

    Todos os proxies: sem try/catch extra — deixar erros upstream propagarem via status.
  </action>
  <verify>
    Verificar que os 4 arquivos existem com exports corretos:
    `ls apps/web/src/app/api/obras-proxy/` (deve mostrar route.ts + [id]/)
    `ls apps/web/src/app/api/obras-proxy/[id]/` (deve mostrar route.ts + cameras/)
    TypeScript: `pnpm --filter web tsc --noEmit` sem erros nos novos arquivos.
  </verify>
  <done>
    4 rotas proxy existem. GET/POST em /api/obras-proxy, PUT/DELETE em /api/obras-proxy/[id],
    GET/POST em /api/obras-proxy/[id]/cameras, PUT/DELETE em /api/obras-proxy/[id]/cameras/[cameraId].
  </done>
</task>

<task type="auto">
  <name>Task 2: Server Actions e páginas de gestão (lista + formulários)</name>
  <files>
    apps/web/src/app/(admin)/gestao/actions.ts,
    apps/web/src/app/(admin)/gestao/page.tsx,
    apps/web/src/app/(admin)/gestao/obras/nova/page.tsx,
    apps/web/src/app/(admin)/gestao/obras/[id]/cameras/nova/page.tsx
  </files>
  <action>
    **`gestao/actions.ts`** — Server Actions com `'use server'`:
    ```typescript
    'use server';
    import { cookies } from 'next/headers';
    import { redirect } from 'next/navigation';

    const API_BASE = process.env.INTERNAL_API_URL ?? 'http://localhost:4000';

    export async function criarObra(prevState: unknown, formData: FormData) {
      const cookieStore = await cookies();
      const nome = formData.get('nome') as string;
      const endereco = formData.get('endereco') as string | null;
      if (!nome?.trim()) return { error: 'Nome é obrigatório' };
      const res = await fetch(`${API_BASE}/api/obras`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: cookieStore.toString() },
        body: JSON.stringify({ nome: nome.trim(), endereco: endereco?.trim() || undefined }),
      });
      if (!res.ok) return { error: 'Erro ao criar obra' };
      redirect('/gestao');
    }

    export async function criarCamera(obraId: string, prevState: unknown, formData: FormData) {
      const cookieStore = await cookies();
      const codigoLpr = formData.get('codigoLpr') as string;
      const ip = formData.get('ip') as string | null;
      if (!codigoLpr?.trim()) return { error: 'Código LPR é obrigatório' };
      const res = await fetch(`${API_BASE}/api/obras/${obraId}/cameras`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: cookieStore.toString() },
        body: JSON.stringify({ codigoLpr: codigoLpr.trim(), ip: ip?.trim() || undefined }),
      });
      if (!res.ok) return { error: 'Erro ao criar câmera' };
      redirect(`/gestao/obras/${obraId}`);
    }
    ```

    **`gestao/page.tsx`** — Server Component, auth guard ADMIN_EMPRESA, lista obras:
    - `import { auth } from '../../../auth'` + `if role !== 'ADMIN_EMPRESA' redirect('/')`
    - Fetch direto `${INTERNAL_API_URL}/api/obras` com `cookies().toString()` (padrão buscar/page.tsx)
    - Resposta: `{ obras: Obra[] }` — filtrar `o.ativo === true`
    - Tabela com colunas: Nome | Endereço | Câmeras (_count?.cameras ?? '—') | Ações
    - Botão "Nova Obra" (link href="/gestao/obras/nova") com bg-ggtech-blue
    - Cada linha tem link "Gerenciar" → `/gestao/obras/${obra.id}`
    - Se nenhuma obra: `<p>Nenhuma obra cadastrada ainda.</p>` com botão Nova Obra
    - Tabela: `hover:bg-slate-50` em `<tr>`, cabeçalho `bg-slate-100 text-xs text-slate-500 uppercase`
    - Nota: _count pode não existir se a Express API não retornar — usar `obra._count?.cameras ?? '—'`

    **`gestao/obras/nova/page.tsx`** — Server Component com formulário:
    - Auth guard ADMIN_EMPRESA
    - Importa `criarObra` de `../../actions`
    - Usa `useActionState` — mas como é Server Component, o form usa `action={criarObra}` direto
      WAIT: useActionState é hook de Client. Opção mais simples: criar `nova-obra-form.tsx` como
      Client Component separado que usa `useActionState(criarObra, null)`.
    - Campos: nome (required, maxLength=100), endereco (optional)
    - Submit button: "Criar Obra" bg-ggtech-blue
    - Link "Cancelar" → /gestao
    - Mostrar erro se prevState.error existe

    **`gestao/obras/[id]/cameras/nova/page.tsx`** — Server Component:
    - Auth guard + fetch obra para mostrar nome no heading: `GET /api/obras/:id` ou buscar da lista
    - Como Express não tem GET /api/obras/:id individual, buscar lista e filtrar pelo id (ou
      simplesmente mostrar heading genérico "Nova Câmera" sem o nome da obra para simplicidade)
    - Client Component `nova-camera-form.tsx` com `useActionState(criarCamera.bind(null, obraId), null)`
    - Campos: codigoLpr (required), ip (optional, placeholder "192.168.1.x")
    - Submit button: "Criar Câmera" bg-ggtech-blue
    - Link "Cancelar" → /gestao/obras/[id]

    Estilo geral: `min-h-screen bg-gray-50 p-6`, `max-w-3xl mx-auto`, campos com
    `border border-slate-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ggtech-blue`
  </action>
  <verify>
    `pnpm --filter web tsc --noEmit` sem erros.
    Navegar para /gestao com sessão ADMIN_EMPRESA: deve renderizar lista de obras.
    Navegar /gestao/obras/nova: deve mostrar formulário com campos nome/endereco.
  </verify>
  <done>
    actions.ts exporta criarObra e criarCamera. Páginas /gestao, /gestao/obras/nova e
    /gestao/obras/[id]/cameras/nova renderizam sem erro de TypeScript.
  </done>
</task>

<task type="auto">
  <name>Task 3: Página detalhe obra + Client Components de delete + sidebar link</name>
  <files>
    apps/web/src/app/(admin)/gestao/obras/[id]/page.tsx,
    apps/web/src/app/(admin)/gestao/delete-obra-button.tsx,
    apps/web/src/app/(admin)/gestao/obras/[id]/delete-camera-button.tsx,
    apps/web/src/components/sidebar.tsx
  </files>
  <action>
    **`gestao/obras/[id]/page.tsx`** — Server Component:
    - Auth guard ADMIN_EMPRESA
    - Params: `{ params: Promise<{ id: string }> }` — `const { id } = await params`
    - Fetch câmeras: `GET ${API_BASE}/api/obras/${id}/cameras` com cookie
    - Fetch obras (para mostrar nome): `GET ${API_BASE}/api/obras` com cookie, filtrar pelo id
      (reutilizar padrão — Express não tem GET /obras/:id individual)
    - Se obra não encontrada: `notFound()` (import de next/navigation)
    - Layout:
      ```
      [← Voltar para Gestão]   [Editar] [Excluir Obra]
      h1: {obra.nome}
      p: {obra.endereco ?? 'Endereço não informado'}

      h2: Câmeras  [Nova Câmera →]

      Tabela câmeras: Código LPR | IP | Status | Último Sinal | Ações
      - Status: badge verde "online" / cinza "offline" (mesmo padrão sidebar.tsx)
      - Ações: [Excluir] → DeleteCameraButton
      ```
    - "← Voltar" = link href="/gestao", texto `text-sm text-ggtech-blue hover:underline`
    - "Nova Câmera" = link href={`/gestao/obras/${id}/cameras/nova`}
    - Importar `DeleteObraButton` e `DeleteCameraButton` (Client Components)

    **`gestao/delete-obra-button.tsx`** — `'use client'`:
    ```typescript
    'use client';
    import { useRouter } from 'next/navigation';
    export function DeleteObraButton({ obraId }: { obraId: string }) {
      const router = useRouter();
      async function handleDelete() {
        if (!confirm('Excluir esta obra? Todas as câmeras serão desativadas.')) return;
        const res = await fetch(`/api/obras-proxy/${obraId}`, { method: 'DELETE' });
        if (res.ok) router.push('/gestao');
        else alert('Erro ao excluir obra.');
      }
      return (
        <button
          onClick={handleDelete}
          className="rounded-md border border-red-300 px-3 py-1.5 text-sm text-red-600 hover:bg-red-50 transition-colors"
        >
          Excluir Obra
        </button>
      );
    }
    ```

    **`gestao/obras/[id]/delete-camera-button.tsx`** — `'use client'`:
    ```typescript
    'use client';
    import { useRouter } from 'next/navigation';
    export function DeleteCameraButton({ obraId, cameraId, codigoLpr }: { obraId: string; cameraId: string; codigoLpr: string }) {
      const router = useRouter();
      async function handleDelete() {
        if (!confirm(`Desativar câmera ${codigoLpr}?`)) return;
        const res = await fetch(`/api/obras-proxy/${obraId}/cameras/${cameraId}`, { method: 'DELETE' });
        if (res.ok) router.refresh();
        else alert('Erro ao desativar câmera.');
      }
      return (
        <button onClick={handleDelete} className="text-sm text-red-600 hover:underline">
          Excluir
        </button>
      );
    }
    ```

    **`sidebar.tsx`** — Adicionar link "Gestão" visível apenas para ADMIN_EMPRESA,
    posicionado ANTES do link "Alertas WhatsApp" existente:
    - Import: adicionar `Settings` ao import de lucide-react (junto com os existentes)
    - Inserir bloco:
      ```tsx
      {userRole === 'ADMIN_EMPRESA' && (
        <a
          href="/gestao"
          className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-blue-200 transition-colors hover:bg-white/10 hover:text-white"
        >
          <Settings size={16} aria-hidden="true" />
          Gestão
        </a>
      )}
      ```
    - Manter todos os outros links existentes (Dashboard, Buscar, Relatórios, Alertas WhatsApp)
    - Não alterar lógica de câmeras nem props da sidebar

    Também criar os Client Components de formulário referenciados na Task 2:
    - `apps/web/src/app/(admin)/gestao/nova-obra-form.tsx` — `'use client'`, `useActionState(criarObra, null)`
    - `apps/web/src/app/(admin)/gestao/obras/[id]/cameras/nova-camera-form.tsx` — `'use client'`,
      `useActionState(criarCamera.bind(null, obraId), null)` onde obraId vem como prop
  </action>
  <verify>
    `pnpm --filter web tsc --noEmit` passa sem erros.
    Sidebar renderiza link "Gestão" com ícone Settings para ADMIN_EMPRESA.
    /gestao/obras/[id] renderiza lista de câmeras com botões delete.
    Clicar "Excluir Obra" abre confirm dialog nativo do browser.
  </verify>
  <done>
    Página detalhe obra lista câmeras com status badges. DeleteObraButton e DeleteCameraButton
    fazem soft-delete via proxy e redirecionam/refresham. Sidebar exibe "Gestão" para ADMIN_EMPRESA.
    Zero erros TypeScript.
  </done>
</task>

<task type="checkpoint:human-verify" gate="blocking">
  <what-built>
    UI completa de gestão: 4 proxies, listagem /gestao, detalhe /gestao/obras/[id],
    formulários de criação (obra e câmera), botões de delete com confirmação, link "Gestão" na sidebar.
  </what-built>
  <how-to-verify>
    1. Login como ADMIN_EMPRESA → sidebar deve exibir "Gestão" com ícone Settings
    2. Clicar "Gestão" → /gestao lista obras ativas com count de câmeras (ou "Nenhuma obra")
    3. Clicar "Nova Obra" → formulário com campos nome/endereço → preencher → submit → redireciona para /gestao com nova obra na lista
    4. Clicar "Gerenciar" em uma obra → /gestao/obras/[id] mostra câmeras com status badges
    5. Clicar "Nova Câmera" → formulário com codigoLpr/ip → preencher → submit → câmera aparece na lista
    6. Clicar "Excluir" em câmera → confirm dialog → confirmar → câmera some da lista (router.refresh)
    7. Clicar "Excluir Obra" → confirm dialog → confirmar → redireciona para /gestao, obra sumiu
    8. Login como OPERADOR → sidebar NÃO deve mostrar "Gestão"
    9. Acessar /gestao como OPERADOR → redireciona para /
  </how-to-verify>
  <resume-signal>Digite "aprovado" ou descreva os problemas encontrados</resume-signal>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| browser → Next.js proxy | Usuário autenticado chama /api/obras-proxy/* |
| Next.js proxy → Express API | Proxy encaminha cookie de sessão para autenticação |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-sjb-01 | Elevation of Privilege | /gestao pages | mitigate | Auth guard em cada Server Component: `if role !== 'ADMIN_EMPRESA' redirect('/')` |
| T-sjb-02 | Spoofing | obras-proxy routes | mitigate | Proxy encaminha o cookie real do browser — Express valida JWT e empresaId na sessão |
| T-sjb-03 | Tampering | DELETE /obras-proxy/[id] | accept | Soft-delete verificado pelo Express tenantMiddleware — só atua em recursos da empresa do usuário |
| T-sjb-04 | Information Disclosure | GET /api/obras-proxy | accept | Express tenantMiddleware garante que só obras da empresaId do JWT são retornadas |
</threat_model>

<verification>
- `pnpm --filter web tsc --noEmit` passa sem erros TypeScript
- Nenhum erro de compilação Next.js no `pnpm dev`
- Rotas proxy respondem corretamente (status 401 sem auth, dados com auth)
- Role ADMIN_EMPRESA acessa /gestao; outros roles são redirecionados para /
</verification>

<success_criteria>
ADMIN_EMPRESA consegue: criar obra, cadastrar câmeras, visualizar listagem com status de câmeras,
e desativar câmeras/obras — tudo via UI sem acesso direto à API Express. Zero regressão no sidebar
para outros roles. TypeScript sem erros.
</success_criteria>

<output>
Após conclusão, criar `.planning/quick/260621-sjb-criar-ui-de-gest-o-de-obras-e-c-meras-pa/260621-sjb-SUMMARY.md`
</output>
