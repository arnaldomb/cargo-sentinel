---
phase: 02-auth-multi-tenant-hierarchy
verified: 2026-06-21T00:39:55Z
status: human_needed
score: 9/10 must-haves verified
overrides_applied: 0
gaps:
deferred:
human_verification:
  - test: "Login manual em /login com admin@demo.com / Admin123! e verificar redirecionamento para /"
    expected: "Usuário autenticado é redirecionado para a página principal após login bem-sucedido"
    why_human: "Comportamento de redirecionamento pós-login requer browser real; Next.js server actions com redirectTo não são testáveis via vitest"
  - test: "Logout a partir de qualquer página (chamar logoutAction) e verificar que o cookie authjs.session-token é removido do browser"
    expected: "Cookie de sessão desaparece das devtools após logout; próxima navegação redireciona para /login"
    why_human: "Limpeza de cookie httpOnly não é verificável via grep; requer inspeção no browser"
  - test: "Tentar acessar /api/obras com token de empresa A usando um obraId que pertence à empresa B"
    expected: "API retorna 404 — isolamento de tenant em produção com dois tenants reais"
    why_human: "Teste de isolamento cross-tenant requer dois tenants reais no banco e chamadas HTTP integradas"
  - test: "Token emitido para empresa SUSPENSO deve ser rejeitado ao tentar login"
    expected: "Login retorna erro 'Credenciais inválidas ou empresa suspensa' para empresa suspensa"
    why_human: "Verificar fluxo visual de erro no formulário de login requer browser"
---

# Phase 2: Auth + Multi-Tenant Hierarchy Verification Report

**Phase Goal:** Users can authenticate, and every API call is scoped to the correct tenant via the JWT-injected tenant client — with the full Empresa > Obra > Camera hierarchy manageable by the right role.
**Verified:** 2026-06-21T00:39:55Z
**Status:** human_needed
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths (Roadmap Success Criteria)

| # | Truth | Status | Evidence |
|---|-------|--------|---------|
| 1 | An Admin Empresa can log in with email/password and receive a JWT containing empresaId, role, and expiry | ✓ VERIFIED | `auth.ts` CredentialsProvider + `authorizeUser()` validates via `prisma.user.findUnique` + `bcryptjs.compare`; `auth.config.ts` callbacks.jwt assigns `token.empresaId` and `token.role`; 6 vitest tests green |
| 2 | An authenticated Admin can create an Obra and assign a Camera — and neither appears in another tenant's API responses | ✓ VERIFIED | `obras.ts` POST and `cameras.ts` POST use `req.tenantClient!.obra.create` / `req.tenantClient!.camera.create`; `tenantMiddleware` scopes all queries via `createTenantClient(prisma, empresaId)`; `findFirstOrThrow` verifies ownership before mutation; 11 route tests green |
| 3 | An Operador token grants read-only access to obras/cameras of their empresa and is rejected by admin-only endpoints | ✓ VERIFIED | `requireRole('SUPER_ADMIN', 'ADMIN_EMPRESA')` on POST/PUT/DELETE; `requireRole('SUPER_ADMIN', 'ADMIN_EMPRESA', 'OPERADOR')` on GET; Test 2 (obras.test.ts) and Test 8 (cameras.test.ts) assert 403 for OPERADOR on write endpoints |
| 4 | A Super Admin JWT carries `empresaId: null` and can query any tenant without error | ✓ VERIFIED | `seed.ts` creates `superadmin@cargosentinel.com` with `empresaId: null`; `tenantMiddleware` detects `role === 'SUPER_ADMIN'` and assigns `prisma` raw (never calls `createTenantClient(prisma, null)` which would return 0 rows — Pitfall 4); tenant.test.ts Test 2 asserts createTenantClient NOT called for SUPER_ADMIN |
| 5 | After logout, the refresh token cookie is cleared and previously issued tokens cannot refresh | PARTIAL — see note | `logoutAction` calls `signOut({ redirectTo: '/login' })` which clears the browser cookie. However, Decision D2 (accepted, documented in T-02-20) means JWT tokens issued before logout remain cryptographically valid for 7 days. "Cannot refresh" is satisfied in spirit (no refresh mechanism exists) but previously issued JWE tokens remain valid until expiry. AUTH_SECRET rotation is the documented emergency mitigation. |

**Note on SC 5:** This deviation is intentional and was explicitly accepted in Decision D2 before plan execution. The ROADMAP requirement text predates D2. T-02-20 in the threat model documents the risk acceptance. The browser cookie IS cleared; the constraint "previously issued tokens cannot refresh" is satisfied vacuously (there is no refresh mechanism) but issued tokens remain valid. This is a documented MVP trade-off. See override suggestion below.

**Score:** 9/10 truths verified (SC 5 is partial/accepted deviation)

---

### Derived Must-Haves from Plan Frontmatter

#### Plan 01 Must-Haves

| # | Truth | Status | Evidence |
|---|-------|--------|---------|
| 1 | Tabela User existe no Postgres com colunas email, passwordHash, nome, role, empresaId | ✓ VERIFIED | `schema.prisma` model User contains all required columns; `prisma db push` applied |
| 2 | Enum Role com SUPER_ADMIN, ADMIN_EMPRESA, OPERADOR existe no banco | ✓ VERIFIED | `schema.prisma` enum Role with all 3 values |
| 3 | Existe um usuário SUPER_ADMIN com empresaId NULL após rodar o seed | ✓ VERIFIED | `seed.ts` upserts `superadmin@cargosentinel.com` with `role: 'SUPER_ADMIN'` and `empresaId: null` |
| 4 | Existe uma Empresa de demonstração com um usuário ADMIN_EMPRESA e um OPERADOR | ✓ VERIFIED | `seed.ts` creates Construtora Demo + admin@demo.com (ADMIN_EMPRESA) + operador@demo.com (OPERADOR) |

#### Plan 02 Must-Haves

| # | Truth | Status | Evidence |
|---|-------|--------|---------|
| 1 | Um usuário pode submeter email/senha em /login e receber uma sessão JWT | ✓ VERIFIED | `loginAction` in `actions.ts` calls `signIn('credentials', ...)` with email+password from FormData; `page.tsx` renders form with name="email" and name="password" inputs |
| 2 | O JWT da sessão carrega sub (userId), role e empresaId (null para SUPER_ADMIN) | ✓ VERIFIED | `auth.config.ts` callbacks.jwt sets `token.sub = user.id`, `token.role`, `token.empresaId`; module augmentation in `next-auth.d.ts` declares these in JWT and Session interfaces |
| 3 | Login de empresa SUSPENSO é rejeitado | ✓ VERIFIED | `authorizeUser()` in `auth.ts`: `if (user.empresa && user.empresa.status === 'SUSPENSO') return null`; auth.test.ts covers this case |
| 4 | A sessão expira em 7 dias e renova a cada 5 min de atividade (updateAge) | ✓ VERIFIED | `auth.config.ts`: `maxAge: 7 * 24 * 60 * 60` and `updateAge: 5 * 60` |
| 5 | Existe um caminho de logout que limpa o cookie de sessão | ✓ VERIFIED | `logoutAction` in `actions.ts` calls `signOut({ redirectTo: '/login' })`; Auth.js clears httpOnly cookie by default |

#### Plan 03 Must-Haves

| # | Truth | Status | Evidence |
|---|-------|--------|---------|
| 1 | O Express descriptografa o token JWE do Auth.js e popula req.user com id/role/empresaId | ✓ VERIFIED | `auth.ts` (api): `jwtDecrypt(token, key)` via jose + `@panva/hkdf`; populates `req.user = { id, role, empresaId }` |
| 2 | Para usuário normal, req.tenantClient é createTenantClient(prisma, empresaId) | ✓ VERIFIED | `tenant.ts`: `else if (req.user.empresaId) { req.tenantClient = createTenantClient(prisma, req.user.empresaId); }` |
| 3 | Para SUPER_ADMIN (empresaId null), req.tenantClient é o prisma raw (sem filtro de tenant) | ✓ VERIFIED | `tenant.ts`: `if (req.user.role === 'SUPER_ADMIN') { req.tenantClient = prisma as unknown as ReturnType<typeof createTenantClient>; }` |
| 4 | requireRole rejeita com 403 quem não tem o role exigido | ✓ VERIFIED | `rbac.ts`: returns `res.status(403).json({ error: 'Acesso negado' })`; 5 rbac tests confirm behavior |
| 5 | Requisição sem token recebe 401 | ✓ VERIFIED | `auth.ts` (api): `if (!token) return res.status(401).json({ error: 'Não autenticado' })` |

#### Plan 04 Must-Haves

| # | Truth | Status | Evidence |
|---|-------|--------|---------|
| 1 | ADMIN_EMPRESA pode criar, editar e desativar Obras da sua empresa via API | ✓ VERIFIED | `obras.ts`: POST, PUT, DELETE all guarded by `requireRole('SUPER_ADMIN', 'ADMIN_EMPRESA')`; 6 obras tests green |
| 2 | ADMIN_EMPRESA pode adicionar, editar e remover Câmeras de uma Obra da sua empresa via API | ✓ VERIFIED | `cameras.ts`: POST, PUT, DELETE with same RBAC; 5 cameras tests green |
| 3 | OPERADOR pode listar Obras e Câmeras da sua empresa, mas não criar, editar ou remover | ✓ VERIFIED | GET endpoints allow OPERADOR; POST/PUT/DELETE reject with 403 |
| 4 | Nenhuma rota retorna Obras ou Câmeras de outra empresa — isolamento de tenant garantido por req.tenantClient | ✓ VERIFIED | All queries go through `req.tenantClient!` which scopes by empresaId; `findFirstOrThrow` ownership check before any mutation |
| 5 | obraId e cameraId de params são sempre verificados contra o tenant antes de qualquer mutação | ✓ VERIFIED | `obras.ts` PUT/DELETE: `findFirstOrThrow({ where: { id } })` before update; `cameras.ts` POST/PUT/DELETE: verifies obra AND camera via `findFirstOrThrow` |

---

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `packages/database/prisma/schema.prisma` | Modelo User + enum Role + relação Empresa.users | ✓ VERIFIED | 111 lines; contains enum Role (3 values), model User with passwordHash/role/empresaId, Empresa.users relation |
| `packages/database/src/seed.ts` | Seed Super Admin + empresa demo | ✓ VERIFIED | 58 lines; bcryptjs cost 12; upsert-based; 3 users created |
| `apps/web/auth.config.ts` | Auth.js v5 edge-safe config | ✓ VERIFIED | 27 lines; strategy jwt, maxAge 7d, updateAge 5min, callbacks jwt+session; no bcryptjs import |
| `apps/web/auth.ts` | CredentialsProvider + bcryptjs + authorizeUser | ✓ VERIFIED | 56 lines; CredentialsProvider, bcryptjs.compare, SUSPENSO check, authorizeUser exported |
| `apps/web/middleware.ts` | Route protection, excludes /login | ✓ VERIFIED | 8 lines; uses authConfig (edge-safe); matcher excludes login/api/auth |
| `apps/web/src/types/next-auth.d.ts` | Module augmentation role/empresaId | ✓ VERIFIED | 24 lines; augments Session, User, JWT with role and empresaId |
| `apps/web/src/app/api/auth/[...nextauth]/route.ts` | GET/POST handlers | ✓ VERIFIED | Exports `{ GET, POST } = handlers` |
| `apps/web/src/app/(auth)/login/page.tsx` | Login form with email/password | ✓ VERIFIED | Client component with useActionState; inputs name="email" and name="password" |
| `apps/web/src/app/(auth)/login/actions.ts` | loginAction + logoutAction | ✓ VERIFIED | loginAction calls signIn; logoutAction calls signOut; both use dynamic import |
| `apps/api/src/middleware/auth.ts` | JWE decrypt via jose+hkdf | ✓ VERIFIED | 47 lines; jwtDecrypt + hkdf; COOKIE_NAME varies by NODE_ENV; 401 without token |
| `apps/api/src/middleware/tenant.ts` | SUPER_ADMIN bypass tenant injection | ✓ VERIFIED | 19 lines; SUPER_ADMIN gets prisma raw; normal user gets createTenantClient; 403 for null empresaId |
| `apps/api/src/middleware/rbac.ts` | requireRole factory | ✓ VERIFIED | 12 lines; returns 403 for unauthorized roles |
| `apps/api/src/middleware/pipeline.ts` | protectedPipeline without circular deps | ✓ VERIFIED | 9 lines; exports `[authMiddleware, tenantMiddleware] as const` |
| `apps/api/src/routes/obras.ts` | Obras CRUD tenant-scoped | ✓ VERIFIED | 105 lines; GET/POST/PUT/DELETE; findFirstOrThrow ownership check; soft-delete; P2025→404 |
| `apps/api/src/routes/cameras.ts` | Cameras CRUD tenant-scoped | ✓ VERIFIED | 128 lines; mergeParams:true; GET/POST/PUT/DELETE; verifies obra before camera; P2002→409; soft-delete |
| `apps/api/src/types/express.d.ts` | Express Request augmentation | ✓ VERIFIED | Declares `user` and `tenantClient` on Request |
| `apps/api/src/index.ts` | Middleware mounting + routes registered | ✓ VERIFIED | helmet+cookieParser global; /api/lpr public; obras+cameras mounted with `...protectedPipeline` spread |

---

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `auth.ts authorize()` | `prisma.user.findUnique + bcryptjs.compare` | `@cargo-sentinel/database` import | ✓ WIRED | `authorizeUser()` calls `prisma.user.findUnique` and `bcryptjs.compare(password, user.passwordHash)` |
| `auth.config.ts callbacks.jwt` | `token.empresaId / token.role` | assignment from user on first login | ✓ WIRED | `token.role = user.role; token.empresaId = user.empresaId` |
| `api/middleware/auth.ts` | `hkdf('sha256', AUTH_SECRET, salt, info, 32)` | `@panva/hkdf` | ✓ WIRED | `getDerivedKey()` calls `hkdf('sha256', secret, COOKIE_NAME, ...)` |
| `api/middleware/tenant.ts` | `createTenantClient(prisma, empresaId)` | `@cargo-sentinel/database` import | ✓ WIRED | `createTenantClient(prisma, req.user.empresaId)` for normal users |
| `apps/api/src/routes/obras.ts` | `req.tenantClient.obra.*` | tenantMiddleware (Plan 03) | ✓ WIRED | All DB operations use `req.tenantClient!.obra.findMany/create/update/findFirstOrThrow` |
| `apps/api/src/routes/cameras.ts` | `req.tenantClient.camera.*` | tenantMiddleware (Plan 03) | ✓ WIRED | All DB operations use `req.tenantClient!.camera.findMany/create/update/findFirstOrThrow` |
| `apps/api/src/index.ts` | obrasRouter + camerasRouter | `app.use('/api/obras', ...protectedPipeline, obrasRouter)` | ✓ WIRED | Both routers registered with spread of protectedPipeline |

---

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
|----------|---------------|--------|-------------------|--------|
| `obras.ts GET /` | `obras` | `req.tenantClient!.obra.findMany(...)` | Yes — Prisma query with WHERE ativo:true scoped to tenant | ✓ FLOWING |
| `cameras.ts GET /` | `cameras` | `req.tenantClient!.camera.findMany(...)` | Yes — Prisma query with WHERE obraId + ativo:true | ✓ FLOWING |
| `auth.ts authorizeUser()` | `user` | `prisma.user.findUnique({ where: { email } })` | Yes — DB lookup with bcrypt verify | ✓ FLOWING |

---

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| API test suite passes (25 tests) | `npx vitest run src/middleware/ src/routes/` in apps/api | 5 test files, 25 tests — 0 failures | ✓ PASS |
| Web auth tests pass (6 tests) | `npx vitest run auth.test.ts` in apps/web | 1 test file, 6 tests — 0 failures | ✓ PASS |
| No circular imports in routes | `grep -n "from.*index" obras.ts cameras.ts` | No matches | ✓ PASS |
| bcryptjs absent from middleware.ts | `grep bcryptjs apps/web/middleware.ts` | No matches | ✓ PASS |
| jsonwebtoken absent from api auth | `grep jsonwebtoken apps/api/src/middleware/auth.ts` | No matches | ✓ PASS |
| /api/lpr remains public | LPR router registered before protectedPipeline in index.ts | Confirmed by code read | ✓ PASS |

---

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|------------|-------------|--------|---------|
| AUTH-01 | Plan 02 | Usuário pode fazer login com email/senha | ✓ SATISFIED | loginAction + CredentialsProvider + login page |
| AUTH-02 | Plan 02 | JWT contém sub, empresaId, role — SUPER_ADMIN tem empresaId null | ✓ SATISFIED | callbacks.jwt in auth.config.ts; seed.ts creates SUPER_ADMIN with null empresaId |
| AUTH-03 | Plans 01, 03 | Três roles: SUPER_ADMIN, ADMIN_EMPRESA, OPERADOR | ✓ SATISFIED | enum Role in schema; requireRole enforces distinctions |
| AUTH-04 | Plan 02 | Token TTL + refresh (D2 deviation: 7d JWT, no refresh table) | PARTIAL — D2 | maxAge 7d / updateAge 5min implemented; REQUIREMENTS.md says "15 min + refresh token" but D2 accepted JWT-only; see note |
| AUTH-05 | Plan 03 | Express valida JWT e injeta req.tenantClient | ✓ SATISFIED | authMiddleware + tenantMiddleware; 9 middleware tests green |
| AUTH-06 | Plan 02 | Logout de qualquer página | ✓ SATISFIED | logoutAction calls signOut({ redirectTo: '/login' }) |
| TENANT-01 | Plan 01 | Entidade Empresa com CNPJ, nome, status (ativo/suspenso) | ✓ SATISFIED | schema.prisma Empresa model with cnpj, nome, EmpresaStatus enum; SUSPENSO check in authorize() |
| TENANT-02 | Plan 01 | Entidade Obra pertence a Empresa | ✓ SATISFIED | schema.prisma Obra with empresaId FK to Empresa |
| TENANT-03 | Plan 01 | Entidade Camera com código único (codigoLpr @unique), IP, pertence a Obra | ✓ SATISFIED | schema.prisma Camera with `codigoLpr String @unique`, ip, obraId FK |
| TENANT-04 | Plan 01 | empresaId denormalizado em Camera e Evento | ✓ SATISFIED | Camera.empresaId and Evento.empresaId both present in schema as non-nullable indexed columns |
| TENANT-05 | Plan 04 | Admin Empresa pode criar/editar/desativar Obras e Câmeras | ✓ SATISFIED | obras.ts + cameras.ts POST/PUT/DELETE with requireRole(ADMIN_EMPRESA+) |
| TENANT-06 | Plan 03, 04 | Operador vê apenas obras/câmeras da sua empresa | ✓ SATISFIED | tenantMiddleware scopes all queries; OPERADOR allowed on GET only |

**REQUIREMENTS.md tracking discrepancy:** TENANT-01 through TENANT-05 are marked `Pending` (unchecked) in REQUIREMENTS.md and show as `Pending` in the traceability table. The actual codebase has these requirements satisfied. This is a documentation tracking gap — the requirements were implemented by Plans 01 and 04 but REQUIREMENTS.md was not updated to reflect completion. Action required: update checkboxes and traceability table in REQUIREMENTS.md.

**AUTH-04 wording discrepancy:** REQUIREMENTS.md says "Token de acesso com TTL 15 min — refresh token em cookie httpOnly" but implementation uses JWT 7d/5min (Decision D2). The requirements text predates D2. The spirit of AUTH-04 (session management with automatic renewal) is satisfied.

---

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| `apps/web/src/app/(auth)/login/actions.ts` | 21 | Inner `'use server'` directive inside function body | ℹ️ Info | `logoutAction` has `'use server'` inside the function (line 22) rather than at module top. This works but is non-standard — the outer file already has `'use server'` at line 1, making the inner directive redundant but harmless |

No blocking anti-patterns found. No stubs, placeholders, or empty return values in any implementation file.

---

### Human Verification Required

#### 1. Login Flow End-to-End

**Test:** Start Next.js dev server (`pnpm --filter @cargo-sentinel/web dev`). Navigate to `/login`. Enter `admin@demo.com` / `Admin123!`. Submit.
**Expected:** Redirected to `/` (or dashboard). DevTools > Application > Cookies shows `authjs.session-token` cookie present (httpOnly, 7 day expiry).
**Why human:** Next.js `redirectTo` in server action triggers internal redirect propagation — not testable with Vitest mocks.

#### 2. Logout Cookie Clearing

**Test:** After logging in (test 1), trigger logout. Inspect DevTools Cookies.
**Expected:** `authjs.session-token` cookie disappears after `logoutAction()`. Next navigation redirects to `/login`.
**Why human:** Cookie removal verification requires browser DevTools inspection; httpOnly cookies are not accessible via JavaScript.

#### 3. Cross-Tenant Isolation (Integration Test)

**Test:** Using two different empresa tokens (e.g., ADMIN of Construtora Demo and ADMIN of a second empresa), create an Obra under empresa A. Then call `GET /api/obras/:obraId` or `PUT /api/obras/:obraId` with empresa B's token.
**Expected:** Returns 404 (obra belongs to different tenant, findFirstOrThrow via tenantClient returns no match).
**Why human:** Requires two live tenant sessions and HTTP calls against running server. Unit tests mock tenantClient.

#### 4. Empresa SUSPENSO Login Rejection

**Test:** Update Construtora Demo's status to SUSPENSO in the database. Attempt login with `admin@demo.com`.
**Expected:** Login form shows error message "Credenciais inválidas ou empresa suspensa".
**Why human:** Requires visual confirmation of error display in the form; covered by unit test but UI rendering needs human verification.

---

### Note on Roadmap SC 5 — Accepted Deviation

Roadmap SC 5 states: "After logout, the refresh token cookie is cleared and previously issued tokens cannot refresh."

The implementation satisfies the first part (browser cookie cleared by `signOut()`). The second part — "previously issued tokens cannot refresh" — reflects a pattern that assumes a separate refresh token flow (e.g., a `RefreshToken` table). Decision D2 explicitly rejected this pattern for MVP in favor of JWT-only with maxAge 7d / updateAge 5min.

The technical truth: after logout, JWE tokens issued before logout remain valid until their 7-day expiry. Emergency mitigation is AUTH_SECRET rotation. This risk is documented in T-02-20 and accepted at the architecture level.

**To formally accept this deviation in future re-verifications, add to VERIFICATION.md frontmatter:**

```yaml
overrides:
  - must_have: "After logout, the refresh token cookie is cleared and previously issued tokens cannot refresh"
    reason: "Decision D2 (LOCKED) chose JWT-only strategy (7d maxAge / 5min updateAge) over RefreshToken table for MVP. Browser cookie is cleared by signOut(). Previously issued JWE tokens remain valid until expiry — emergency mitigation is AUTH_SECRET rotation. Risk accepted and documented in T-02-20."
    accepted_by: "arnaldomb@gmail.com"
    accepted_at: "2026-06-21T00:39:55Z"
```

---

## Summary

**Phase goal is substantively achieved.** All 4 architectural pillars are in place:

1. **Auth.js v5** — CredentialsProvider with bcryptjs, JWT session with role/empresaId/sub, login/logout pages, 6 unit tests green.
2. **Express JWE Middleware** — jose + @panva/hkdf decryption, tenant scoping, RBAC with requireRole, 9 middleware tests green.
3. **Empresa > Obra > Camera hierarchy** — schema complete with soft-delete (ativo), denormalized empresaId in Camera and Evento, CRUD routes with RBAC and tenant isolation, 16 route tests green.
4. **Tenant isolation** — createTenantClient scopes every Prisma query; SUPER_ADMIN bypass uses prisma raw; protectedPipeline without circular deps.

**Blocking items:** None.

**Action items before marking Phase 2 complete:**
1. Human verify login/logout flows in browser (4 items above)
2. Update REQUIREMENTS.md: check TENANT-01 through TENANT-05 as complete in both checkboxes and traceability table
3. Optionally add the override entry for SC 5 to accept the D2 JWT-only deviation permanently

---

_Verified: 2026-06-21T00:39:55Z_
_Verifier: Claude (gsd-verifier)_
