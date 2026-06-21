---
phase: 02
slug: auth-multi-tenant-hierarchy
status: draft
nyquist_compliant: true
wave_0_complete: true
created: 2026-06-20
---

# Phase 02 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest 4.x |
| **Config file** | `apps/api/vitest.config.ts` |
| **Quick run command** | `pnpm --filter @cargo-sentinel/api test -- --run src/middleware` |
| **Full suite command** | `pnpm --filter @cargo-sentinel/api test -- --run` |
| **Estimated runtime** | ~15 seconds |

---

## Sampling Rate

- **After every task commit:** Run `pnpm --filter @cargo-sentinel/api test -- --run src/middleware`
- **After every plan wave:** Run `pnpm --filter @cargo-sentinel/api test -- --run`
- **Before `/gsd-verify-work`:** Full suite must be green
- **Max feedback latency:** 30 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 02-01-01 | 01 | 1 | TENANT-01,02,03 | — | Schema User com Role enum; seed SUPER_ADMIN sem empresaId | unit | `cd packages/database && npx prisma validate` | ❌ W0 | ⬜ pending |
| 02-01-02 | 01 | 1 | TENANT-04 | — | Seed cria Empresa demo com ADMIN e OPERADOR | manual | Verificar com `prisma studio` ou query direta | ❌ W0 | ⬜ pending |
| 02-02-01 | 02 | 1 | AUTH-01 | T-02-01 | Login com credenciais corretas retorna sessão JWT com sub/role/empresaId | unit | `pnpm --filter @cargo-sentinel/web test -- --run auth.test.ts` | ❌ W0 | ⬜ pending |
| 02-02-02 | 02 | 1 | AUTH-02,04 | T-02-02 | JWT payload contém sub, empresaId, role; sessão expira em 7 dias | unit | `pnpm --filter @cargo-sentinel/web test -- --run auth.test.ts` | ❌ W0 | ⬜ pending |
| 02-02-03 | 02 | 1 | AUTH-06,TENANT-01 | T-02-03 | Logout limpa cookie; empresa SUSPENSO bloqueia login | unit | `pnpm --filter @cargo-sentinel/web test -- --run auth.test.ts` | ❌ W0 | ⬜ pending |
| 02-03-01 | 03 | 2 | AUTH-05 | T-02-10,11 | authMiddleware decripta JWE e popula req.user; token inválido → 401 | unit | `pnpm --filter @cargo-sentinel/api test -- --run src/middleware/auth.test.ts` | ❌ W0 | ⬜ pending |
| 02-03-02 | 03 | 2 | TENANT-06,AUTH-03 | T-02-12,13 | tenantMiddleware injeta req.tenantClient; SUPER_ADMIN usa prisma raw | unit | `pnpm --filter @cargo-sentinel/api test -- --run src/middleware/rbac.test.ts` | ❌ W0 | ⬜ pending |
| 02-03-03 | 03 | 2 | AUTH-05 | T-02-14,15 | protectedPipeline exportado; LPR e /health continuam públicos | unit | `pnpm --filter @cargo-sentinel/api test -- --run src/routes/lpr.test.ts` | ✅ | ⬜ pending |
| 02-04-01 | 04 | 2 | TENANT-05 | T-02-12 | ADMIN_EMPRESA cria Obra para sua empresa; OPERADOR recebe 403 em POST | unit | `pnpm --filter @cargo-sentinel/api test -- --run src/routes/obras.test.ts` | ❌ W0 | ⬜ pending |
| 02-04-02 | 04 | 2 | TENANT-05,06 | T-02-12 | Tenant isolation: query de Obra/Camera nunca cruza empresaId | unit | `pnpm --filter @cargo-sentinel/api test -- --run src/routes/cameras.test.ts` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `apps/api/src/middleware/auth.test.ts` — stubs para AUTH-02, AUTH-05 (T-02-10, T-02-11)
- [ ] `apps/api/src/middleware/rbac.test.ts` — stubs para AUTH-03, TENANT-06 (T-02-12, T-02-13)
- [ ] `apps/api/src/routes/obras.test.ts` — stubs para TENANT-05, TENANT-06 (T-02-12)
- [ ] `apps/api/src/routes/cameras.test.ts` — stubs para TENANT-05 (T-02-12)
- [ ] `apps/web/auth.test.ts` — stubs para AUTH-01, TENANT-01 (T-02-01 a T-02-03)

*Nota: os stubs de middleware já são criados pelos próprios planos (Plan 03 Task 3 e Plan 04 Task 2). Wave 0 faz referência cruzada.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| JWT cookie presente no browser após login | AUTH-01 | Requer browser + DevTools | Abrir `/login`, fazer login, inspecionar cookies — deve existir `authjs.session-token` |
| SUPER_ADMIN pode criar Obra para qualquer empresa | TENANT-05 | Requer seed completo + chamada autenticada | Login como SUPER_ADMIN, POST /api/obras com empresaId explícito, verificar criação |
| Auth.js sign-in page redireciona corretamente | AUTH-01 | Requer browser | Acessar rota protegida sem sessão → deve redirecionar para `/login` |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 30s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
