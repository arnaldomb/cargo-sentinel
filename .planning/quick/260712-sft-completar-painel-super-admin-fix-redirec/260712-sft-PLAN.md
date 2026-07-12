---
phase: quick-260712-sft
plan: 01
type: execute
wave: 1
depends_on: []
autonomous: true
requirements: [SADMIN-REDIRECT, SADMIN-EMPRESA-DETAIL, SADMIN-USUARIOS-CRUD, SADMIN-SHELL-TABS, SADMIN-LIST-SEARCH]
files_modified:
  - apps/web/src/app/page.tsx
  - packages/database/prisma/schema.prisma
  - apps/web/auth.ts
  - apps/api/src/routes/admin.ts
  - apps/web/src/app/api/admin-empresa-proxy/[id]/route.ts
  - apps/web/src/app/api/admin-usuarios-proxy/[id]/route.ts
  - apps/web/src/app/api/admin-usuarios-proxy/[id]/[usuarioId]/route.ts
  - apps/web/src/app/api/admin-usuarios-proxy/[id]/[usuarioId]/resetar-senha/route.ts
  - apps/web/src/app/(superadmin)/admin/empresas/[id]/page.tsx
  - apps/web/src/app/(superadmin)/admin/empresas/[id]/empresa-detail-shell.tsx
  - apps/web/src/app/(superadmin)/admin/empresas/[id]/usuarios-tab.tsx
  - apps/web/src/app/(superadmin)/admin/page.tsx
  - apps/web/src/app/(superadmin)/admin/empresas-table.tsx

must_haves:
  truths:
    - "Após login, SUPER_ADMIN cai em /admin, nunca no dashboard de tenant"
    - "SUPER_ADMIN abre /admin/empresas/[id] e vê abas Geral, Usuários e WhatsApp"
    - "Aba Geral mostra nome, CNPJ, status, criadoEm, contadores e permite suspender/reativar"
    - "Aba Usuários lista usuários da empresa e permite criar, resetar senha e ativar/desativar"
    - "Usuário criado pelo superadmin é ADMIN_EMPRESA ou OPERADOR, nunca SUPER_ADMIN"
    - "Usuário desativado (ativo=false) não consegue logar"
    - "Lista /admin filtra empresas por nome ou CNPJ client-side"
  artifacts:
    - path: "apps/api/src/routes/admin.ts"
      provides: "GET/PATCH empresa detail + CRUD usuários"
      contains: "empresas/:id/usuarios"
    - path: "apps/web/src/app/(superadmin)/admin/empresas/[id]/empresa-detail-shell.tsx"
      provides: "Shell tabulada Geral/Usuários/WhatsApp"
      contains: "WhatsAppProvisionClient"
    - path: "packages/database/prisma/schema.prisma"
      provides: "Campo User.ativo"
      contains: "ativo"
  key_links:
    - from: "apps/web/src/app/page.tsx"
      to: "/admin"
      via: "redirect quando role === SUPER_ADMIN"
      pattern: "SUPER_ADMIN.*redirect|redirect.*/admin"
    - from: "apps/web/auth.ts"
      to: "user.ativo"
      via: "bloqueio de login quando ativo === false"
      pattern: "user\\.ativo"
    - from: "apps/web/src/app/(superadmin)/admin/empresas/[id]/usuarios-tab.tsx"
      to: "/api/admin-usuarios-proxy"
      via: "fetch"
      pattern: "admin-usuarios-proxy"
---

<objective>
Completar o painel super admin do cargo-sentinel espelhando o opencheck (sem billing/assinatura, decisão já confirmada). Corrige o bug de redirecionamento do SUPER_ADMIN, adiciona detalhe de empresa em shell de abas (Geral/Usuários/WhatsApp), CRUD de usuários por empresa e busca na lista.

Purpose: SUPER_ADMIN precisa administrar empresas e seus usuários em um único lugar, e nunca cair na UI de tenant.
Output: Redirect corrigido, rotas backend de detalhe/usuários, proxies BFF, shell de abas reaproveitando o WhatsApp existente, tabela de usuários com criar/resetar/ativar, e busca por nome/CNPJ na lista.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
</execution_context>

<context>
@.planning/STATE.md
@./CLAUDE.md

<interfaces>
<!-- Contratos extraídos do codebase — usar diretamente, sem explorar. -->

packages/database/prisma/schema.prisma (model User atual — NÃO tem `ativo`):
```prisma
model User {
  id           String   @id @default(cuid())
  email        String   @unique
  passwordHash String
  nome         String
  role         Role     @default(OPERADOR)   // SUPER_ADMIN | ADMIN_EMPRESA | OPERADOR
  empresaId    String?
  createdAt    DateTime @default(now())
  updatedAt    DateTime @updatedAt
  empresa      Empresa? @relation(fields: [empresaId], references: [id])
  @@index([empresaId])
  @@index([email])
}
```

apps/web/auth.ts — authorizeUser (L37-45), já bloqueia empresa SUSPENSO:
```ts
const user = await prisma.user.findUnique({
  where: { email },
  include: { empresa: { select: { status: true } } },
});
if (!user) return null;
if (user.empresa && user.empresa.status === 'SUSPENSO') return null; // TENANT-01
const valid = await bcryptjs.compare(password, user.passwordHash);
if (!valid) return null;
```

apps/api/src/routes/admin.ts — já monta sob requireRole('SUPER_ADMIN'). Já existem:
GET /empresas (com _count obras/cameras/eventos/users), POST /empresas,
PATCH /empresas/:id/status, POST /empresas/:id/impersonate, e bloco WhatsApp.
`import bcrypt from 'bcryptjs'` já presente. `prisma` importado de @cargo-sentinel/database.

Padrão de proxy BFF (apps/web/src/app/api/admin-whatsapp-proxy/[id]/route.ts):
```ts
const API_BASE = process.env.INTERNAL_API_URL ?? 'http://localhost:4000';
export async function GET(_req, { params }) {
  const { id } = await params;
  const cookieStore = await cookies();
  const upstream = await fetch(`${API_BASE}/api/admin/empresas/${id}/whatsapp`, {
    headers: { Cookie: cookieStore.toString() }, cache: 'no-store',
  });
  return Response.json(await upstream.json(), { status: upstream.status });
}
```

Componentes reutilizáveis existentes (NÃO duplicar):
- apps/web/src/app/(superadmin)/admin/empresas/[id]/whatsapp/whatsapp-provision-client.tsx
  → `export function WhatsAppProvisionClient({ empresaId }: { empresaId: string })`
- apps/web/src/app/(superadmin)/admin/suspend-button.tsx
  → `export function SuspendButton({ empresaId, status }: { empresaId; status: 'ATIVO'|'SUSPENSO' })`
  (usa `NEXT_PUBLIC_API_BASE_URL` + PATCH /status + router.refresh)
- apps/web/src/app/(superadmin)/admin/impersonate-button.tsx → `ImpersonateButton`

Referência opencheck (LER, NÃO EDITAR):
- apps/api/src/modules/superadmin/superadmin.routes.ts L213-283 (CRUD usuários)
- apps/web/app/(superadmin)/clientes/[id]/page.tsx L237-418 (shell abas + tabela usuários)
- apps/web/app/(superadmin)/clientes/page.tsx (busca client-side)
</interfaces>
</context>

<tasks>

<task type="auto">
  <name>Task 1: Fix redirect SUPER_ADMIN + campo User.ativo + bloqueio de login</name>
  <files>apps/web/src/app/page.tsx, packages/database/prisma/schema.prisma, apps/web/auth.ts</files>
  <action>
Três mudanças de fundação (a migração é CONFIRMADA como estritamente necessária: o toggle ativo/inativo de usuários da aba Usuários exige um campo que não existe hoje — é a ÚNICA mudança de schema, um campo de User, NÃO um campo de billing de Empresa).

1) apps/web/src/app/page.tsx — após `if (!session?.user) redirect('/login')`, adicionar antes de renderizar DashboardClient:
   `if (session.user.role === 'SUPER_ADMIN') redirect('/admin');`

2) packages/database/prisma/schema.prisma — no model User, adicionar `ativo Boolean @default(true)`. Depois rodar a migração (default true = sem perda de dados em linhas existentes):
   `pnpm --filter @cargo-sentinel/database exec prisma migrate dev --name add_user_ativo`
   Em seguida `pnpm --filter @cargo-sentinel/database exec prisma generate`.

3) apps/web/auth.ts — em authorizeUser, após a checagem de empresa SUSPENSO (L42) e antes do bcrypt compare, adicionar:
   `if (!user.ativo) return null; // usuário desativado pelo superadmin`
   (user.ativo já vem no findUnique — é campo escalar, não precisa de include extra.)

NÃO adicionar email/telefone/plano a Empresa (fora de escopo, decisão travada).
  </action>
  <verify>
    <automated>cd "D:/GGTRONIC/Desenvolvimeto/cargo-sentinel" && pnpm --filter @cargo-sentinel/web build</automated>
  </verify>
  <done>page.tsx redireciona SUPER_ADMIN para /admin; schema tem User.ativo com migração aplicada; authorizeUser bloqueia login de usuário com ativo=false; web build passa.</done>
</task>

<task type="auto">
  <name>Task 2: Rotas backend de detalhe da empresa e CRUD de usuários</name>
  <files>apps/api/src/routes/admin.ts</files>
  <action>
Adicionar em admin.ts (todas herdam requireRole('SUPER_ADMIN') do index.ts). Portar o padrão do opencheck superadmin.routes.ts L213-283, adaptando `usuario`→`user`, `papel`→`role`, `senha`→`passwordHash`, `criadoEm`→`createdAt`, `tenantId`→`empresaId`.

1) GET /empresas/:id — detalhe com _count:
   `prisma.empresa.findUnique({ where: { id }, include: { _count: { select: { obras: true, cameras: true, eventos: true, users: true } } } })`. 404 se não achar.

2) PATCH /empresas/:id — editar nome/cnpj (genérico, separado do /status existente). Validar: nome string >=2 chars se enviado; cnpj normalizado (só dígitos) >=14 se enviado; montar `data` só com campos presentes. Tratar P2002 (cnpj duplicado → 400 "CNPJ já cadastrado") e P2025 (404).

3) GET /empresas/:id/usuarios — `prisma.user.findMany({ where: { empresaId: id }, select: { id, nome, email, role, ativo, createdAt }, orderBy: { createdAt: 'asc' } })`. 404 se empresa não existir.

4) POST /empresas/:id/usuarios — body { nome, email, senha, role }. Validar nome>=2, email regex, senha>=8. **role DEVE ser 'ADMIN_EMPRESA' ou 'OPERADOR'** — rejeitar (400) qualquer outro valor, especialmente SUPER_ADMIN. Verificar empresa existe (404) e email não duplicado (409). Criar com `passwordHash: await bcrypt.hash(senha, 10)`, `empresaId: id`. Retornar 201 com select sem passwordHash.

5) PUT /empresas/:id/usuarios/:usuarioId — body { nome?, role?, ativo? }. Buscar `findFirst({ where: { id: usuarioId, empresaId: id } })` (404 se não achar). Se role enviado, validar que é ADMIN_EMPRESA|OPERADOR (400 caso contrário). **Nunca permitir editar/rebaixar um SUPER_ADMIN**: se o usuário alvo tem role SUPER_ADMIN, retornar 403. Update só com campos presentes; retornar select sem passwordHash.

6) POST /empresas/:id/usuarios/:usuarioId/resetar-senha — body { senha }. Validar senha>=8 (400). findFirst por id+empresaId (404). Update `passwordHash: await bcrypt.hash(senha, 10)`. Retornar { success: true }.
  </action>
  <verify>
    <automated>cd "D:/GGTRONIC/Desenvolvimeto/cargo-sentinel" && pnpm --filter @cargo-sentinel/api build</automated>
  </verify>
  <done>admin.ts expõe GET/PATCH /empresas/:id e GET/POST/PUT/resetar-senha de /empresas/:id/usuarios; validação impede criar/promover SUPER_ADMIN; api build passa.</done>
</task>

<task type="auto">
  <name>Task 3: Proxies BFF para detalhe da empresa e usuários</name>
  <files>apps/web/src/app/api/admin-empresa-proxy/[id]/route.ts, apps/web/src/app/api/admin-usuarios-proxy/[id]/route.ts, apps/web/src/app/api/admin-usuarios-proxy/[id]/[usuarioId]/route.ts, apps/web/src/app/api/admin-usuarios-proxy/[id]/[usuarioId]/resetar-senha/route.ts</files>
  <action>
Criar proxies same-domain seguindo EXATAMENTE o padrão de admin-whatsapp-proxy/[id]/route.ts (INTERNAL_API_URL, encaminhar Cookie via cookies().toString(), repassar status/json). Cada route reencaminha para o endpoint correspondente da Task 2:

- admin-empresa-proxy/[id]/route.ts → GET e PATCH para `/api/admin/empresas/${id}` (PATCH repassa body JSON com Content-Type).
- admin-usuarios-proxy/[id]/route.ts → GET e POST para `/api/admin/empresas/${id}/usuarios`.
- admin-usuarios-proxy/[id]/[usuarioId]/route.ts → PUT para `/api/admin/empresas/${id}/usuarios/${usuarioId}`.
- admin-usuarios-proxy/[id]/[usuarioId]/resetar-senha/route.ts → POST para `/api/admin/empresas/${id}/usuarios/${usuarioId}/resetar-senha`.

Todos com `cache: 'no-store'` nos GET. params é Promise (Next 15) — `const { id } = await params`.
  </action>
  <verify>
    <automated>cd "D:/GGTRONIC/Desenvolvimeto/cargo-sentinel" && pnpm --filter @cargo-sentinel/web build</automated>
  </verify>
  <done>Quatro rotas de proxy criadas, encaminhando cookie e status; web build passa.</done>
</task>

<task type="auto">
  <name>Task 4: Shell de abas em /admin/empresas/[id] (Geral + WhatsApp)</name>
  <files>apps/web/src/app/(superadmin)/admin/empresas/[id]/page.tsx, apps/web/src/app/(superadmin)/admin/empresas/[id]/empresa-detail-shell.tsx</files>
  <action>
Criar a shell tabulada replicando opencheck clientes/[id]/page.tsx L237-333 (SOMENTE abas Geral, Usuários, WhatsApp — sem Assinatura/Cobranças).

1) page.tsx (server component): validar `session.user.role === 'SUPER_ADMIN'` (senão redirect('/')). `const { id } = await params`. Buscar detalhe via fetch server-side ao proxy interno OU direto a `${INTERNAL_API_URL}/api/admin/empresas/${id}` com Cookie (mesmo padrão de fetchEmpresas em admin/page.tsx). Passar `empresa` (com _count) para `<EmpresaDetailShell empresa={...} empresaId={id} />`. Aceitar `searchParams` para aba inicial (`?tab=whatsapp`).

2) empresa-detail-shell.tsx ('use client'): estado `tab` (default vindo de prop initialTab ?? 'geral'). Barra de abas Geral | Usuários | WhatsApp (estilo do opencheck: border-b-2, ativo=border-ggtech-blue). Breadcrumb "Empresas / {nome}" com Link para /admin.
   - Aba Geral: card com nome, CNPJ (formatado), status (badge ATIVO/SUSPENSO), criadoEm (pt-BR), contadores obras/câmeras/eventos/usuários. Reaproveitar `<SuspendButton empresaId={empresaId} status={empresa.status} />` para suspender/reativar.
   - Aba WhatsApp: renderizar `<WhatsAppProvisionClient empresaId={empresaId} />` (import do caminho existente ./whatsapp/whatsapp-provision-client). NÃO duplicar lógica.
   - Aba Usuários: renderizar `<UsuariosTab empresaId={empresaId} />` (componente criado na Task 5). Se ainda não existir no momento da compilação, deixar o import pronto — a Task 5 cria o arquivo.

Manter a página antiga [id]/whatsapp/page.tsx como está (não quebra), mas o acesso principal passa a ser a shell.
  </action>
  <verify>
    <automated>cd "D:/GGTRONIC/Desenvolvimeto/cargo-sentinel" && pnpm --filter @cargo-sentinel/web build</automated>
  </verify>
  <done>/admin/empresas/[id] renderiza shell com abas Geral/Usuários/WhatsApp; Geral mostra dados+contadores+toggle status; WhatsApp reusa WhatsAppProvisionClient; web build passa.</done>
</task>

<task type="auto">
  <name>Task 5: Aba Usuários — tabela, criar, resetar senha, toggle ativo</name>
  <files>apps/web/src/app/(superadmin)/admin/empresas/[id]/usuarios-tab.tsx</files>
  <action>
Criar `usuarios-tab.tsx` ('use client') replicando opencheck clientes/[id]/page.tsx L336-418, adaptado ao enum Role e aos proxies da Task 3.

- Ao montar, GET `/api/admin-usuarios-proxy/${empresaId}` → lista { id, nome, email, role, ativo, createdAt }.
- Tabela: Nome, Email, Papel (select ADMIN_EMPRESA/OPERADOR; SUPER_ADMIN aparece read-only e sem opções de rebaixar), Status (badge Ativo/Inativo), Criado em, Ações.
- Ações por linha: botão resetar senha (abre modal pedindo nova senha >=8 → POST `/api/admin-usuarios-proxy/${empresaId}/${usuarioId}/resetar-senha`); botão toggle ativo (PUT `.../${usuarioId}` com { ativo: !ativo }); mudança de papel via select (PUT com { role }). Nunca oferecer papel SUPER_ADMIN no select.
- Botão "Novo usuário": modal com nome/email/senha/papel (papel default OPERADOR, opções ADMIN_EMPRESA|OPERADOR) → POST `/api/admin-usuarios-proxy/${empresaId}`. Exibir erro do backend (ex.: 409 email duplicado). Recarregar lista após sucesso.
- Estados de loading por linha/ação e mensagens de erro. Usar ícones lucide-react (Plus, KeyRound, Power, Loader2) consistente com o resto do painel.
  </action>
  <verify>
    <automated>cd "D:/GGTRONIC/Desenvolvimeto/cargo-sentinel" && pnpm --filter @cargo-sentinel/web build</automated>
  </verify>
  <done>Aba Usuários lista/cria/reseta senha/ativa-desativa usuários via proxies; papel restrito a ADMIN_EMPRESA|OPERADOR; web build passa.</done>
</task>

<task type="auto">
  <name>Task 6: Busca client-side na lista + ajuste do link WhatsApp</name>
  <files>apps/web/src/app/(superadmin)/admin/page.tsx, apps/web/src/app/(superadmin)/admin/empresas-table.tsx</files>
  <action>
Adicionar busca por nome/CNPJ (adaptado da opencheck clientes/page.tsx) sem quebrar o fetch server-side.

1) Extrair a tabela de empresas para `empresas-table.tsx` ('use client') recebendo `empresas: Empresa[]` como prop. Adicionar input de busca controlado que filtra client-side por `nome` (case-insensitive) ou `cnpj` (comparar por dígitos, usando o valor digitado normalizado). Mostrar estado vazio quando o filtro não retorna nada. Mover as funções formatCnpj/formatDate para este componente (ou um util local).

2) page.tsx (server): manter fetchEmpresas e renderizar `<EmpresasTable empresas={empresas} />`, mantendo o header "Empresas" + botão "Nova Empresa".

3) Ajustar o link "WhatsApp" de cada linha: de `/admin/empresas/${id}/whatsapp` para a shell → `/admin/empresas/${id}?tab=whatsapp`. Manter SuspendButton e ImpersonateButton. Considerar tornar o nome da empresa um Link para `/admin/empresas/${id}` (aba Geral) para acesso ao detalhe.
  </action>
  <verify>
    <automated>cd "D:/GGTRONIC/Desenvolvimeto/cargo-sentinel" && pnpm --filter @cargo-sentinel/web build</automated>
  </verify>
  <done>Lista /admin filtra por nome/CNPJ; link WhatsApp aponta para a shell (?tab=whatsapp); nome linka para o detalhe; web build passa.</done>
</task>

</tasks>

<verification>
- `pnpm --filter @cargo-sentinel/api build` passa.
- `pnpm --filter @cargo-sentinel/web build` passa.
- Migração `add_user_ativo` aplicada (única mudança de schema, confirmada necessária).
- Login como SUPER_ADMIN cai em /admin; login de usuário com ativo=false é rejeitado.
- Backend rejeita criar/promover usuário para SUPER_ADMIN dentro de uma empresa.
</verification>

<success_criteria>
- Bug de redirect corrigido; SUPER_ADMIN nunca vê UI de tenant.
- Detalhe da empresa em shell de abas Geral/Usuários/WhatsApp, reusando WhatsAppProvisionClient sem duplicação.
- CRUD de usuários por empresa funcional (listar/criar/editar papel+ativo/resetar senha) com papéis restritos.
- Busca por nome/CNPJ na lista; link WhatsApp integrado à shell.
- Nenhum campo de billing adicionado; ambos builds verdes.
</success_criteria>

<output>
Após completar, criar `.planning/quick/260712-sft-completar-painel-super-admin-fix-redirec/260712-sft-SUMMARY.md`.
</output>
