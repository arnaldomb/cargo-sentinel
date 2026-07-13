---
phase: quick-260712-t5s
plan: 01
subsystem: super-admin-panel
tags: [prisma, admin-api, next-proxy, super-admin-ui]
dependency-graph:
  requires: []
  provides:
    - "DELETE /api/admin/empresas/:id (cascata)"
    - "DELETE /api/admin/empresas/:id/usuarios/:usuarioId"
    - "PUT /api/admin/empresas/:id/usuarios/:usuarioId com email"
    - "ClassificacaoHistorico.usuarioId e Relatorio.criadoPor nullable com onDelete SetNull"
  affects:
    - "apps/web/src/app/(superadmin)/admin/empresas/[id]/*"
tech-stack:
  added: []
  patterns:
    - "onDelete: SetNull em relacoes historicas para permitir exclusao de usuario sem perder o registro"
    - "migracao gerada via prisma migrate diff --from-config-datasource --to-schema (Prisma 7) e aplicada via psql, sem depender de _prisma_migrations"
key-files:
  created:
    - packages/database/prisma/migrations/20260713000603_nullable_usuario_relatorio_setnull/migration.sql
  modified:
    - packages/database/prisma/schema.prisma
    - apps/api/src/routes/admin.ts
    - apps/web/src/app/api/admin-empresa-proxy/[id]/route.ts
    - apps/web/src/app/api/admin-usuarios-proxy/[id]/[usuarioId]/route.ts
    - apps/web/src/app/(superadmin)/admin/empresas/[id]/empresa-detail-shell.tsx
    - apps/web/src/app/(superadmin)/admin/empresas/[id]/usuarios-tab.tsx
    - apps/web/src/app/(superadmin)/admin/empresas/[id]/whatsapp/whatsapp-provision-client.tsx
decisions:
  - "Excluir EMPRESA sempre em cascata (obras, cameras, eventos, placas, historico, usuarios, config WhatsApp, relatorios), confirmada digitando o nome exato no client."
  - "Excluir USUARIO sempre permitido, mesmo com historico, via onDelete: SetNull em ClassificacaoHistorico.usuarioId e Relatorio.criadoPor."
metrics:
  duration: "~1h"
  completed: 2026-07-12
---

# Phase quick-260712-t5s Plan 01: Completar CRUD do painel super admin Summary

CRUD completo de empresa/usuários/WhatsApp no painel super admin: schema tornado nullable com `onDelete: SetNull`, rotas DELETE em cascata e PUT com email, proxies BFF, e UI de edição/exclusão nas 3 abas (Geral, Usuários, WhatsApp).

## What Was Built

- **Task 1** — `ClassificacaoHistorico.usuarioId` e `Relatorio.criadoPor` passaram de `String` para `String?`, com relação `onDelete: SetNull`. Migração gerada via `prisma migrate diff --from-config-datasource --to-schema prisma/schema.prisma --script` (flags corretas do Prisma 7, diferentes das citadas no plano original) e aplicada diretamente no Postgres dev via `docker exec ... psql < migration.sql`, já que o banco não tem `_prisma_migrations` confiável. Catch-up check confirmou que as 3 migrações anteriores já estavam aplicadas (coluna `ativo` já existia). Build da API passou sem nenhum ajuste de tipo necessário — os pontos citados no plano (placas.ts:180, relatorios.ts) não geraram erro porque os `select` ali não são reatribuídos a tipos estritamente não-nulos em nenhum sink de compilação.
- **Task 2** — `admin.ts`: nova rota `DELETE /empresas/:id` que apaga em transação (`$transaction`) histórico, relatórios, eventos, placas, config WhatsApp, câmeras, obras, usuários e por fim a empresa. Nova rota `DELETE /empresas/:id/usuarios/:usuarioId` (403 se alvo SUPER_ADMIN, exclusão sempre permitida — SetNull evita erro de FK). `PUT /empresas/:id/usuarios/:usuarioId` estendido para aceitar `email` com validação de regex, normalização para minúsculas, e 409 em `P2002` (email duplicado).
- **Task 3** — Handlers `DELETE` adicionados aos proxies `admin-empresa-proxy/[id]` e `admin-usuarios-proxy/[id]/[usuarioId]`, seguindo o padrão existente (cookies, params `Promise`, repasse de status).
- **Task 4** — Aba Geral do `empresa-detail-shell.tsx`: edição inline de nome/CNPJ via PATCH com tratamento de erro inline e `router.refresh()`; botão "Excluir empresa" com modal exigindo digitar o nome exato (botão de confirmação `disabled` até o match), DELETE + `router.push('/admin')`.
- **Task 5** — Aba Usuários do `usuarios-tab.tsx`: botão editar (ícone `Pencil`) por linha (exceto SUPER_ADMIN) abre modal com nome/email pré-preenchidos, PUT com tratamento de 409/403; botão excluir (`Trash2`) por linha com `window.confirm` + DELETE + `alert` em erro.
- **Task 6** — Aba WhatsApp do `whatsapp-provision-client.tsx`: quando `vinculada === true`, botão "Editar credenciais" reabre o form reaproveitado (mesmo `salvarWhatsapp`) com `instanceId` pré-preenchido; token/clientToken sempre pedidos de novo (nunca pré-preenchidos, por segurança), com texto explicando a revalidação na Z-API; "Cancelar" volta ao card sem apagar nada.
- **Task 7** — Verificação final: ambos os builds (`api`, `web`) passam limpos sem nenhuma correção adicional necessária. Provada a decisão de exclusão de usuário com histórico: criado um usuário temporário (`test-user-t5s-del`) e um registro `ClassificacaoHistorico` apontando para ele; executado `DELETE FROM "User" WHERE id='test-user-t5s-del'` via `docker exec cargo-sentinel-postgres-1 psql -U sentinel -d cargo_sentinel`; a exclusão não gerou erro de FK e o registro de histórico ficou com `usuarioId` NULL (confirmado via `SELECT`). Registros de teste removidos ao final (não há dados residuais no banco dev).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Flags do `prisma migrate diff` diferentes das citadas no plano**
- **Found during:** Task 1
- **Issue:** O plano sugeria `--to-schema-datamodel` e `--from-url`; ambas foram removidas no Prisma 7 (`--to-schema-datamodel was removed`, `--from-url was removed`).
- **Fix:** Usadas as flags atuais do Prisma 7: `--from-config-datasource` (lê `DATABASE_URL` do `prisma.config.ts`) e `--to-schema prisma/schema.prisma`.
- **Files modified:** nenhum arquivo de produção — apenas o comando usado para gerar a migração.
- **Commit:** e477104 (a migração gerada por esse comando)

Nenhuma outra correção necessária — nenhum ajuste de tipo TypeScript foi preciso (Task 1 previa possíveis erros de compilação em `placas.ts`/`relatorios.ts` que não se materializaram), e o Task 7 não exigiu nenhuma correção de produção adicional.

## Known Stubs

Nenhum stub introduzido.

## Threat Flags

Nenhuma nova superfície de rede/autenticação/schema fora do previsto no plano — as novas rotas DELETE seguem o mesmo `requireRole('SUPER_ADMIN')` já aplicado a todas as rotas de `admin.ts` em `index.ts`.

## Self-Check: PASSED

All 8 created/modified files verified present on disk; all 6 task commit hashes (e477104, 53a25e0, 8df8468, 50f7ff5, e0e2504, 36a7715) verified present in git log.
