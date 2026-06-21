---
phase: "07"
plan: "01"
subsystem: "api/super-admin"
tags: [super-admin, rbac, impersonation, jwt, bcrypt, crud]
dependency_graph:
  requires:
    - "apps/api/src/middleware/auth.ts (decryptAuthToken, getDerivedKey via hkdf)"
    - "apps/api/src/middleware/rbac.ts (requireRole)"
    - "apps/api/src/middleware/pipeline.ts (protectedPipeline)"
    - "packages/database/prisma/schema.prisma (Empresa, User, EmpresaStatus, Role)"
  provides:
    - "GET /api/admin/empresas — lista multi-tenant com _count"
    - "POST /api/admin/empresas — criação atômica empresa + ADMIN_EMPRESA"
    - "PATCH /api/admin/empresas/:id/status — toggle ATIVO/SUSPENSO"
    - "POST /api/admin/empresas/:id/impersonate — JWE 15min"
  affects:
    - "apps/api/src/index.ts (nova rota /api/admin montada)"
tech_stack:
  added:
    - "bcryptjs ^3.0.3 (adicionado a apps/api/package.json — Rule 3)"
    - "@types/bcryptjs ^3.0.0 (devDependency)"
  patterns:
    - "EncryptJWT (JWE dir/A256CBC-HS512) — compatível com jwtDecrypt em auth.ts"
    - "HKDF sha256 derivação idêntica ao auth.ts (salt = cookie name)"
    - "prisma.$transaction para criação atômica empresa + usuário"
    - "Captura P2002/P2025 para respostas semânticas 400/404"
key_files:
  created:
    - "apps/api/src/routes/admin.ts"
    - "apps/api/src/routes/admin.test.ts"
  modified:
    - "apps/api/src/index.ts (montagem /api/admin)"
    - "apps/api/package.json (bcryptjs dependency)"
    - "pnpm-lock.yaml"
decisions:
  - "EncryptJWT (JWE) em vez de SignJWT: auth.ts usa jwtDecrypt que espera JWE — usar SignJWT quebraria a compatibilidade de decriptação"
  - "bcrypt salt 10: equilíbrio entre segurança e velocidade; sem necessidade de salt 12 pois rota é de baixo volume (só SUPER_ADMIN)"
  - "CNPJ normalizado (apenas dígitos) antes de persistir — permite entrada formatada ou raw"
  - "cookieName dinâmico por NODE_ENV para compatibilidade com prod (__Secure-) e dev (sem __Secure-)"
  - "impersonatedBy no payload JWE para rastreabilidade de auditoria (T-07-03)"
  - "adminUser.id como subject do token de impersonação — sub compatível com auth.ts que lê payload.sub"
metrics:
  duration: "~25min"
  completed: "2026-06-21"
  tasks_completed: 2
  tasks_total: 2
  files_created: 2
  files_modified: 3
---

# Phase 07 Plan 01: Super Admin Backend API Summary

**One-liner:** Router Express `/api/admin` com 4 endpoints CRUD de tenant protegidos por `requireRole('SUPER_ADMIN')`, incluindo impersonação JWE de 15min compatível com `jwtDecrypt` do `auth.ts`.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Criar admin.ts com 4 rotas + admin.test.ts (TDD) | c7fe86b | apps/api/src/routes/admin.ts, apps/api/src/routes/admin.test.ts, apps/api/package.json, pnpm-lock.yaml |
| 2 | Montar adminRouter em index.ts | e58b7b7 | apps/api/src/index.ts |

## Test Results

```
Test Files  19 passed (19)
      Tests  127 passed (127)
   Duration  1.80s
```

18 testes novos em `admin.test.ts` cobrindo todos os 4 endpoints (GET lista, POST criação, PATCH status, POST impersonate) incluindo casos de erro (P2002, P2025, validação de campos).

## Implementation Details

### GET /api/admin/empresas
- `prisma.empresa.findMany` com `include._count` para obras, câmeras, eventos e users
- Ordenado por `createdAt desc`
- Retorna array completo (sem paginação — volume baixo de empresas)

### POST /api/admin/empresas
- Validação: nome (min 2), cnpj (min 14 dígitos após strip), adminEmail (regex), adminNome (min 2), adminSenha (min 8)
- CNPJ normalizado (`replace(/\D/g, '')`) antes de persistir
- `prisma.$transaction` cria Empresa + User(ADMIN_EMPRESA) atomicamente
- `bcrypt.hash(adminSenha, 10)` dentro da transação
- Captura `P2002` com `meta.target` para distinguir CNPJ vs email duplicado
- Resposta 201 com `{ empresa, user: { id, email, nome, role } }` — `passwordHash` excluído (T-07-05)

### PATCH /api/admin/empresas/:id/status
- Valida `body.status in ['ATIVO', 'SUSPENSO']` → 400 se inválido
- `prisma.empresa.update` com captura P2025 → 404

### POST /api/admin/empresas/:id/impersonate
- Busca empresa (404 se não encontrada)
- Busca primeiro `ADMIN_EMPRESA` da empresa ordenado por `createdAt asc` (404 se nenhum)
- Deriva chave com `hkdf('sha256', AUTH_SECRET, cookieName, label, 64)` — idêntico ao `auth.ts`
- `cookieName` dinâmico: `__Secure-authjs.session-token` em prod, `authjs.session-token` em dev
- `new EncryptJWT({ role, empresaId, impersonatedBy }).setSubject(adminUser.id).setExpirationTime('15m').encrypt(key)`
- Retorna `{ token: string, expiresAt: ISO string }` — TTL 15 min hardcoded, sem refresh token (T-07-03)

### Montagem em index.ts
```typescript
app.use('/api/admin', ...protectedPipeline, requireRole('SUPER_ADMIN'), adminRouter);
```
`requireRole('SUPER_ADMIN')` aplicado como middleware adicional após `protectedPipeline` — qualquer role diferente retorna 403 imediatamente (T-07-01).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Dependência faltante] bcryptjs ausente em apps/api/package.json**
- **Found during:** Task 1 — verificação das dependências antes de criar admin.ts
- **Issue:** `bcryptjs` e `@types/bcryptjs` existiam em `packages/database` e `apps/web` mas não em `apps/api`
- **Fix:** Adicionados ao `apps/api/package.json` e instalados via `pnpm install`
- **Files modified:** `apps/api/package.json`, `pnpm-lock.yaml`
- **Commit:** c7fe86b

**2. [Rule 1 - Bug] Mock de EncryptJWT como função em vez de classe**
- **Found during:** Task 1 — primeira execução dos testes
- **Issue:** `vi.fn().mockImplementation(() => ({...}))` não funciona como constructor (`new EncryptJWT(...)`)  — erro "is not a constructor"
- **Fix:** Reescrito como classe ES6 real dentro do `vi.mock()`, com array `capturedPayloads` para assertions de payload
- **Files modified:** `apps/api/src/routes/admin.test.ts`
- **Commit:** c7fe86b (corrigido antes do commit final)

## Threat Surface Scan

Nenhuma superfície nova além do documentado no `<threat_model>` do plano:

| Threat ID | Mitigation | Status |
|-----------|-----------|--------|
| T-07-01 | requireRole('SUPER_ADMIN') no pipeline /api/admin | Implementado |
| T-07-02 | GET /empresas atrás de requireRole | Implementado |
| T-07-03 | Token impersonate sem refresh, TTL 15min hardcoded | Implementado |
| T-07-04 | Chave HKDF idêntica ao auth.ts | Implementado |
| T-07-05 | passwordHash excluído da resposta 201 | Implementado |
| T-07-06 | DoS aceito — baixo volume, Traefik rate limiting | Aceito |

## Known Stubs

Nenhum stub identificado. Todos os endpoints retornam dados reais do Prisma.

## Self-Check: PASSED

- [x] `apps/api/src/routes/admin.ts` existe
- [x] `apps/api/src/routes/admin.test.ts` existe
- [x] Commit c7fe86b existe (`feat(07-01): implementar router Super Admin...`)
- [x] Commit e58b7b7 existe (`feat(07-01): montar adminRouter em index.ts...`)
- [x] 127 testes passando, 0 falhas
- [x] `pnpm build` da api sem erros TypeScript
