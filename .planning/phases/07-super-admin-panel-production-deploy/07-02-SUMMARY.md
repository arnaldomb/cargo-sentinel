---
phase: "07"
plan: "02"
subsystem: "web/super-admin"
tags: [super-admin, next-auth, server-components, client-components, impersonation, rbac]
dependency_graph:
  requires:
    - "apps/api/src/routes/admin.ts (GET /api/admin/empresas, POST, PATCH, POST /impersonate — plan 07-01)"
    - "apps/web/auth.ts (auth() Server Component helper)"
    - "apps/web/auth.config.ts (authConfig para middleware)"
    - "apps/web/src/app/(auth)/login/actions.ts (logoutAction)"
  provides:
    - "GET /admin — dashboard tabela empresas com ações (Server Component)"
    - "GET /admin/empresas/nova — formulário criação empresa (Server + Client)"
    - "Middleware Next.js: /admin/* → redirect se não-SUPER_ADMIN"
    - "Layout (superadmin): header ggtech-darkblue, sem sidebar câmeras"
  affects:
    - "apps/web/middleware.ts (adicionada regra de role para /admin)"
tech_stack:
  added: []
  patterns:
    - "Server Component com fetch SSR: cookies() → repass de header cookie para INTERNAL_API_URL"
    - "Client Component separado para ações com side-effects (SuspendButton, ImpersonateButton)"
    - "useActionState (React 19) para Server Action com retorno de erro"
    - "Route group (superadmin) com layout próprio — sem sidebar de câmeras"
    - "Middleware NextAuth v5 callback form: auth(function middleware(req)) com cast para Session"
    - "Cookie impersonação via document.cookie + window.location.href (hard navigation)"
key_files:
  created:
    - "apps/web/src/app/(superadmin)/layout.tsx"
    - "apps/web/src/app/(superadmin)/admin/page.tsx"
    - "apps/web/src/app/(superadmin)/admin/suspend-button.tsx"
    - "apps/web/src/app/(superadmin)/admin/impersonate-button.tsx"
    - "apps/web/src/app/(superadmin)/admin/empresas/nova/page.tsx"
    - "apps/web/src/app/(superadmin)/admin/empresas/nova/nova-empresa-form.tsx"
    - "apps/web/src/app/(superadmin)/admin/empresas/nova/actions.ts"
  modified:
    - "apps/web/middleware.ts (adicionada proteção /admin por role SUPER_ADMIN)"
decisions:
  - "Middleware: usar cast (auth as any)(function middleware) para evitar erro de tipo indetectável do NextAuth v5 — alternativa typesafe exigiria import de tipo interno not-portable"
  - "NovaEmpresaForm: Client Component separado de page.tsx para usar useActionState — page.tsx permanece Server Component"
  - "ImpersonateButton: document.cookie + window.location.href (hard navigation) em vez de router.push() — necessário para forçar reload completo da sessão do tenant"
  - "SuspendButton: router.refresh() após PATCH — revalida dados do Server Component sem full reload"
  - "fetchEmpresas: fallback para http://localhost:4000 quando INTERNAL_API_URL ausente — facilita dev local sem Docker"
metrics:
  duration: "~20min"
  completed: "2026-06-21"
  tasks_completed: 2
  tasks_total: 3
  files_created: 7
  files_modified: 1
---

# Phase 07 Plan 02: Super Admin Frontend Panel Summary

**One-liner:** Grupo de rotas `(superadmin)` no Next.js 15 com layout ggtech-darkblue, dashboard de empresas com ações de suspender/reativar/impersonar, formulário de criação e middleware de proteção por role SUPER_ADMIN.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Layout (superadmin) e proteção no middleware | e130fa1 | apps/web/src/app/(superadmin)/layout.tsx, apps/web/middleware.ts |
| 2 | Dashboard /admin e formulário /admin/empresas/nova | 92ca22f | admin/page.tsx, suspend-button.tsx, impersonate-button.tsx, empresas/nova/page.tsx, nova-empresa-form.tsx, actions.ts |

## Checkpoint Status

**Task 3: Checkpoint humano** — Aguardando verificação visual/funcional do painel Super Admin.

## Implementation Details

### Layout (superadmin)

`apps/web/src/app/(superadmin)/layout.tsx` é um Server Component que:
- Chama `auth()` e redireciona para `/` se `session.user.role !== 'SUPER_ADMIN'`
- Renderiza header com `bg-ggtech-darkblue` (`#003366`) e título "Cargo Sentinel — Super Admin"
- Botão de logout usa `logoutAction` de `(auth)/login/actions.ts`
- NÃO inclui sidebar de câmeras — layout completamente isolado do grupo `(admin)`

### Middleware

`apps/web/middleware.ts` expandido para usar callback form do NextAuth v5:
```typescript
export default (auth as any)(function middleware(req: AuthRequest) {
  if (pathname.startsWith('/admin')) {
    if (!session || session.user?.role !== 'SUPER_ADMIN') {
      return NextResponse.redirect(new URL('/', req.url));
    }
  }
  return NextResponse.next();
});
```

### Dashboard /admin

`admin/page.tsx` (Server Component):
- `fetchEmpresas()` usa `cookies()` do Next.js para repassar o header `cookie` ao fetch SSR para `INTERNAL_API_URL`
- Tabela com colunas: Nome, CNPJ (formatado XX.XXX.XXX/XXXX-XX), Status (badge verde/vermelho), Obras, Câmeras, Eventos, Desde (data PT-BR), Ações
- Botão "Nova Empresa" com `Link href="/admin/empresas/nova"` + estilo ggtech-blue

### Client Components de Ação

**SuspendButton:**
- PATCH `${NEXT_PUBLIC_API_BASE_URL}/api/admin/empresas/${id}/status` com `credentials: 'include'`
- `router.refresh()` após sucesso — revalida o Server Component sem reload completo
- Estado visual: botão vermelho (Suspender) ou verde (Reativar) conforme status atual

**ImpersonateButton:**
- POST `${NEXT_PUBLIC_API_BASE_URL}/api/admin/empresas/${id}/impersonate` com `credentials: 'include'`
- Extrai `token` do response JSON
- `document.cookie = \`authjs.session-token=${token}; path=/; max-age=900; SameSite=Lax\`` — TTL 15min sem httpOnly (T-07-08)
- `window.location.href = '/'` — hard navigation para forçar nova sessão do tenant

### Formulário /admin/empresas/nova

- `page.tsx`: Server Component com breadcrumb e card container
- `nova-empresa-form.tsx`: Client Component com `useActionState` para exibir erros retornados pela action
- `actions.ts`: Server Action com validação CNPJ (min 14 dígitos após strip), POST para `/api/admin/empresas`, `redirect('/admin')` em sucesso

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Erro de tipo não-portável no middleware NextAuth v5**
- **Found during:** Task 1 — primeiro build após criar middleware
- **Issue:** `export default auth(function middleware(req: NextRequest & {...}))` gerava `Type error: The inferred type of 'default' cannot be named without a reference to './node_modules/next-auth/lib/types'. This is likely not portable.`
- **Fix:** Cast `(auth as any)` com tipo local `AuthRequest = NextRequest & { auth: Session | null }` — evita o tipo interno do nextauth que não pode ser exportado
- **Files modified:** `apps/web/middleware.ts`
- **Commit:** e130fa1

**2. [Rule 2 - Funcionalidade crítica] Formulário criação separado em Client Component**
- **Found during:** Task 2 — análise do plano antes de criar os arquivos
- **Issue:** O plano mencionava "via `useFormState` ou estado de retorno da action" em `page.tsx`, mas `useFormState`/`useActionState` é hook React (só funciona em Client Components) — `page.tsx` deve permanecer Server Component para fetch SSR do layout
- **Fix:** Extraído `NovaEmpresaForm` como Client Component separado em `nova-empresa-form.tsx`, `page.tsx` permanece Server Component
- **Files modified:** Criado `nova-empresa-form.tsx` (adicional ao plano)
- **Commit:** 92ca22f

## Threat Surface Scan

| Threat ID | Mitigation | Status |
|-----------|-----------|--------|
| T-07-07 | Middleware Next.js protege /admin/*: redirect para / se não-SUPER_ADMIN | Implementado |
| T-07-08 | Cookie impersonação: max-age=900 (15min), SameSite=Lax, sem httpOnly (necessário para Next.js client) | Implementado |
| T-07-09 | Cookie repassado só em Server Components/Actions — nunca exposto ao cliente via props | Implementado |
| T-07-10 | CNPJ normalizado (replace(/\D/g,'')) antes de enviar à API, validação min 14 dígitos na action | Implementado |

## Known Stubs

Nenhum stub identificado. O dashboard busca dados reais via `INTERNAL_API_URL`. Se a API não responder, exibe "Nenhuma empresa cadastrada" (fallback gracioso, não stub).

## Self-Check: PASSED

- [x] `apps/web/src/app/(superadmin)/layout.tsx` existe
- [x] `apps/web/src/app/(superadmin)/admin/page.tsx` existe
- [x] `apps/web/src/app/(superadmin)/admin/suspend-button.tsx` existe
- [x] `apps/web/src/app/(superadmin)/admin/impersonate-button.tsx` existe
- [x] `apps/web/src/app/(superadmin)/admin/empresas/nova/page.tsx` existe
- [x] `apps/web/src/app/(superadmin)/admin/empresas/nova/nova-empresa-form.tsx` existe
- [x] `apps/web/src/app/(superadmin)/admin/empresas/nova/actions.ts` existe
- [x] `apps/web/middleware.ts` modificado com proteção /admin
- [x] Commit e130fa1 existe (Task 1)
- [x] Commit 92ca22f existe (Task 2)
- [x] Build `pnpm --filter @cargo-sentinel/web build` passa sem erros (12 rotas geradas, incluindo /admin e /admin/empresas/nova)
