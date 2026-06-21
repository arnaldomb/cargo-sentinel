# Phase 2: Auth + Multi-Tenant Hierarchy — Research

**Researched:** 2026-06-20
**Domain:** Auth.js v5 (beta) com Credentials provider, JWT sessions, verificação Express via jose/HKDF, hierarquia multi-tenant Empresa > Obra > Camera, RBAC com 3 roles
**Confidence:** HIGH para padrões core; MEDIUM para Auth.js v5 (ainda em beta); veja seção de Pitfalls

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| AUTH-01 | Usuário pode fazer login com email/senha | CredentialsProvider Auth.js v5 — padrão com bcryptjs.compare() documentado e verificado |
| AUTH-02 | JWT contém `{ sub, empresaId, role, iat, exp }` — Super Admin tem `empresaId: null` | Callbacks `jwt()` + `session()` com TypeScript module augmentation — padrão verificado |
| AUTH-03 | Três roles: SUPER_ADMIN, ADMIN_EMPRESA, OPERADOR | Enum `Role` no Prisma schema + verificação em middleware Express — padrão prescrito |
| AUTH-04 | Access token TTL 15 min — refresh token em cookie httpOnly | Auth.js `maxAge` na config JWT = 900s; refresh token via httpOnly cookie é pattern documentado para CredentialsProvider mas requer implementação manual |
| AUTH-05 | Middleware Express valida JWT e injeta `req.tenantClient` | Decrypt via jose/HKDF + createTenantClient — padrão identificado; código de exemplo documentado |
| AUTH-06 | Logout de qualquer página | `signOut()` de Auth.js + rota Express `DELETE /api/auth/session` para invalidar cookie refresh |
| TENANT-01 | Entidade `Empresa` com CNPJ, nome, status | Já presente no schema.prisma da Phase 1 — precisa adicionar campo `users` |
| TENANT-02 | Entidade `Obra` pertence a `Empresa` | Já presente no schema.prisma — sem mudança necessária |
| TENANT-03 | Entidade `Camera` pertence a `Obra` com código único | Já presente no schema.prisma — sem mudança necessária |
| TENANT-04 | `empresaId` denormalizado em `Camera` e `Evento` | Já implementado no schema.prisma da Phase 1 |
| TENANT-05 | Admin Empresa pode criar/editar/desativar Obras e Câmeras | Endpoints Express CRUD com middleware de role ADMIN_EMPRESA |
| TENANT-06 | Operador vê apenas obras/câmeras da sua empresa | createTenantClient() injeta empresaId — já construído na Phase 1 |
</phase_requirements>

---

## Summary

Phase 2 implementa o sistema de autenticação e controle de acesso que destrava todo o trabalho subsequente. O stack é fixo por CLAUDE.md: Auth.js v5 (beta) no Next.js para sessões JWT, com o Express API verificando esses JWTs de forma independente via `jose` + `@panva/hkdf`.

**Descoberta crítica sobre Auth.js v5:** O npm registry confirma que v5 permanece em beta (`next-auth@5.0.0-beta.31`; `latest` ainda é 4.24.14). Além disso, em setembro de 2025, a equipe Auth.js transferiu a manutenção para o time do Better Auth, colocando Auth.js em modo "patches de segurança apenas". O Better Auth (v1.6.20, estável) é agora a recomendação oficial para projetos novos. **Porém: CLAUDE.md lockeia Auth.js v5 como escolha.** Esta pesquisa documenta o caminho Auth.js v5 conforme mandado, mas registra o Better Auth como alternativa MEDIUM-risco que o planner deve apresentar ao usuário antes de executar.

**Descoberta crítica sobre JWT entre Next.js e Express:** Auth.js v5 usa JWE (JSON Web Encryption) com AES-256-CBC-HS512 + derivação de chave HKDF-SHA256. Isso significa que o Express **não pode** usar `jsonwebtoken.verify()` para validar tokens Auth.js. O Express precisa usar `jwtDecrypt` da `jose` com `hkdf` de `@panva/hkdf`, usando o mesmo `AUTH_SECRET` e o salt correto (`"authjs.session-token"` em dev ou `"__Secure-authjs.session-token"` em prod HTTPS). Este é o único mecanismo suportado e foi verificado em múltiplas fontes.

O schema Prisma da Phase 1 já contém `Empresa`, `Obra`, `Camera` e `Evento` com `empresaId` denormalizado. A Phase 2 precisa apenas adicionar os modelos `User` e `RefreshToken` ao schema. O `createTenantClient()` exportado na Phase 1 é o mecanismo de isolamento que o middleware Express usará via `req.tenantClient`.

**Primary recommendation:** Implementar Auth.js v5 conforme CLAUDE.md. Estruturar em 4 planos: (1) schema User + migrate, (2) Auth.js + endpoints Next.js, (3) middleware Express auth + tenant injection, (4) rotas CRUD Obra/Camera com RBAC.

---

## Project Constraints (from CLAUDE.md)

### Locked Decisions (devem ser seguidas sem alternativas)

| Decisão | Detalhe |
|---------|---------|
| Auth | Auth.js (NextAuth) **v5** — JWT sessions, role embedded em token, tenantId no JWT |
| Backend API | Node.js + Express **4.x** (porta 4000) |
| Frontend | Next.js **15** (App Router) |
| ORM | Prisma **v7** com `@prisma/adapter-pg` — sem `url` no `schema.prisma` |
| Database | PostgreSQL 16+ |
| Multitenancy | Application-layer `tenantId` middleware (Prisma `$extends`) — SEM RLS PostgreSQL |
| Auth strategy | JWT sessions com tenantId embedded — SEM database sessions |
| Tailwind | v3 (não v4) |
| MinIO | Proibido — usar Garage |
| Evolution API | Pinado em v2.3.7 |

### O Que NÃO Usar

- `jsonwebtoken.verify()` para tokens Auth.js (incompatível — Auth.js usa JWE, não JWT assinado)
- `next-auth@latest` (é v4 — precisa de `next-auth@beta` para v5)
- Database sessions no NextAuth (aumenta latência; JWT é escolha locked)
- RLS PostgreSQL (fora de escopo v1)
- Schema-per-tenant (Prisma não suporta nativamente)

---

## Standard Stack

### Core

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| next-auth | 5.0.0-beta.31 | Auth.js v5 — sessão JWT, CredentialsProvider, middleware | Locked em CLAUDE.md; único jeito de usar Auth.js v5 |
| @auth/core | 0.34.3 | Runtime core do Auth.js (instalado como peer) | Necessário para Auth.js v5 funcionar |
| bcryptjs | 3.0.3 | Hash e verificação de senha | Pure JS (sem binário nativo); `bcrypt` nativo tem problemas em Docker multi-arch |
| @types/bcryptjs | 3.0.0 | Tipos TypeScript para bcryptjs | Peer necessário |
| jose | 6.2.3 | Decrypt JWE no Express (verificar tokens Auth.js) | Mesma lib que Auth.js usa internamente; única forma correta de verificar |
| @panva/hkdf | 1.2.1 | Derivação de chave HKDF-SHA256 para descriptografar token Auth.js | Requerido pelo processo de decrypt; mesmo pacote usado por Auth.js internamente |
| zod | 4.4.3 | Validação de entrada nos endpoints (login form, CRUD) | Alinhado com Next.js 15 server actions; já usado no ecossistema |

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| @types/express | ^4.17.21 | Tipos TypeScript para req.user, req.tenantClient | Já no package.json do api |
| helmet | 8.2.0 | Headers de segurança HTTP no Express | Adicionar ao app.ts antes das rotas auth |
| express-rate-limit | 8.5.2 | Rate limiting no endpoint de login | Prevenir brute-force no POST /api/auth/login |

### Alternativas Consideradas

| Standard (escolhido) | Alternativa | Por que não |
|----------------------|-------------|-------------|
| Auth.js v5 (beta) | Better Auth v1.6.20 | CLAUDE.md lockeia Auth.js v5. Better Auth é tecnicamente superior e estável agora, mas mudança requer validação do usuário |
| bcryptjs | @node-rs/argon2 (v2.0.2) | argon2 é mais seguro porém nativo (problemas em Alpine/Docker multi-arch); bcryptjs é suficiente para v1 |
| jose + @panva/hkdf | express-jwt | express-jwt usa `jsonwebtoken.verify()` que não suporta JWE — incompatível com Auth.js tokens |

**Instalação (web workspace):**
```bash
pnpm --filter web add next-auth@beta bcryptjs zod
pnpm --filter web add -D @types/bcryptjs
```

**Instalação (api workspace):**
```bash
pnpm --filter api add jose @panva/hkdf helmet express-rate-limit
```

**Verificação de versão:**
```bash
# Verificado em 2026-06-20 via npm registry
npm view next-auth dist-tags.beta    # → 5.0.0-beta.31
npm view bcryptjs version             # → 3.0.3
npm view jose version                 # → 6.2.3
npm view "@panva/hkdf" version        # → 1.2.1
npm view zod version                  # → 4.4.3
npm view better-auth version          # → 1.6.20 (documentado como alternativa)
```

---

## Architecture Patterns

### Estrutura de Arquivos Recomendada

```
apps/web/
├── auth.ts                     # Config Auth.js: secret, providers, callbacks, session
├── auth.config.ts              # Config sem edge-incompatible deps (para middleware)
├── middleware.ts               # Proteção de rotas Next.js — exporta auth
├── app/
│   ├── (auth)/
│   │   └── login/
│   │       └── page.tsx        # Página de login (form server action)
│   ├── api/
│   │   └── auth/
│   │       └── [...nextauth]/
│   │           └── route.ts   # Handler Auth.js: GET/POST
│   └── (dashboard)/
│       └── layout.tsx          # Layout protegido — verifica session
└── types/
    └── next-auth.d.ts          # Module augmentation: empresaId, role no token

apps/api/src/
├── middleware/
│   ├── auth.ts                 # Decrypt JWE + populate req.user
│   └── tenant.ts               # createTenantClient → req.tenantClient
├── routes/
│   ├── obras.ts               # CRUD Obra (AUTH_EMPRESA + acima)
│   └── cameras.ts             # CRUD Camera (AUTH_EMPRESA + acima)
└── index.ts                    # Monta middlewares antes das rotas protegidas

packages/database/prisma/
└── schema.prisma               # Adicionar: User, RefreshToken models + Role enum
```

### Pattern 1: Schema Prisma — User + RefreshToken

O schema atual (Phase 1) já tem `Empresa`, `Obra`, `Camera`, `Evento`. A Phase 2 adiciona:

```prisma
// Source: padrão Auth.js v5 + Prisma; adaptado para multi-tenant

enum Role {
  SUPER_ADMIN
  ADMIN_EMPRESA
  OPERADOR
}

model User {
  id            String        @id @default(cuid())
  email         String        @unique
  passwordHash  String
  nome          String
  role          Role          @default(OPERADOR)
  empresaId     String?       // null para SUPER_ADMIN
  createdAt     DateTime      @default(now())
  updatedAt     DateTime      @updatedAt
  empresa       Empresa?      @relation(fields: [empresaId], references: [id])
  refreshTokens RefreshToken[]

  @@index([empresaId])
  @@index([email])
}

model RefreshToken {
  id        String   @id @default(cuid())
  token     String   @unique
  userId    String
  expiresAt DateTime
  createdAt DateTime @default(now())
  user      User     @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@index([userId])
  @@index([token])
}
```

E adicionar em `model Empresa`:
```prisma
users     User[]
```

**Por que RefreshToken separado?** Auth.js CredentialsProvider não suporta refresh token nativo. A estratégia é: access token (JWT session, TTL 15 min) + refresh token opaco em cookie httpOnly separado que o Express valida para emitir novo session cookie.

### Pattern 2: Auth.js v5 — auth.ts (web app)

```typescript
// apps/web/auth.ts
// Source: authjs.dev/getting-started/providers/credentials + RBAC guide

import NextAuth, { type NextAuthConfig } from "next-auth";
import Credentials from "next-auth/providers/credentials";
import bcryptjs from "bcryptjs";
import { prisma } from "@cargo-sentinel/database";
import type { Role } from "@prisma/client";

export const config = {
  providers: [
    Credentials({
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Senha", type: "password" },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) return null;

        const user = await prisma.user.findUnique({
          where: { email: credentials.email as string },
          include: { empresa: { select: { status: true } } },
        });

        if (!user) return null;

        // Empresa suspensa — não deixa logar
        if (user.empresa && user.empresa.status === "SUSPENSO") return null;

        const valid = await bcryptjs.compare(
          credentials.password as string,
          user.passwordHash
        );
        if (!valid) return null;

        return {
          id: user.id,
          email: user.email,
          name: user.nome,
          role: user.role,
          empresaId: user.empresaId,
        };
      },
    }),
  ],
  session: { strategy: "jwt", maxAge: 900 }, // 15 minutos
  callbacks: {
    jwt({ token, user }) {
      if (user) {
        // user existe apenas no primeiro login
        token.sub = user.id;
        token.role = user.role as Role;
        token.empresaId = (user as { empresaId: string | null }).empresaId;
      }
      return token;
    },
    session({ session, token }) {
      session.user.id = token.sub!;
      session.user.role = token.role as Role;
      session.user.empresaId = token.empresaId as string | null;
      return session;
    },
  },
} satisfies NextAuthConfig;

export const { handlers, auth, signIn, signOut } = NextAuth(config);
```

### Pattern 3: TypeScript Module Augmentation — next-auth.d.ts

```typescript
// apps/web/types/next-auth.d.ts
// Source: authjs.dev/guides/role-based-access-control

import type { DefaultSession, DefaultJWT } from "next-auth";
import type { Role } from "@prisma/client";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      role: Role;
      empresaId: string | null;
    } & DefaultSession["user"];
  }
}

declare module "next-auth/jwt" {
  interface JWT extends DefaultJWT {
    role: Role;
    empresaId: string | null;
  }
}
```

### Pattern 4: Middleware Next.js — Proteção de Rotas

```typescript
// apps/web/middleware.ts
// Source: authjs.dev/getting-started/session-management/protecting

export { auth as middleware } from "@/auth";

export const config = {
  matcher: [
    // Protege tudo exceto login, assets estáticos e _next
    "/((?!login|api/auth|_next/static|_next/image|favicon.ico).*)",
  ],
};
```

**ATENÇÃO (Next.js 15 → 16):** Em Next.js 16, `middleware.ts` foi renomeado para `proxy.ts`. Este projeto usa Next.js 15 — mantém `middleware.ts`.

### Pattern 5: Express Middleware — Verificação JWE Auth.js

**CRÍTICO:** Auth.js v5 usa JWE (não JWT assinado). O Express não pode usar `jsonwebtoken.verify()`. Precisa descriptografar com `jose.jwtDecrypt` + `@panva/hkdf`.

```typescript
// apps/api/src/middleware/auth.ts
// Source: gist.github.com/aegrumet/9ca3e13278b8543348bfdb270133512d + fatih.medium.com

import { jwtDecrypt } from "jose";
import { hkdf } from "@panva/hkdf";
import type { Request, Response, NextFunction } from "express";

// Salt difere entre dev (http) e prod (https com __Secure- prefix)
const COOKIE_NAME =
  process.env.NODE_ENV === "production"
    ? "__Secure-authjs.session-token"
    : "authjs.session-token";

async function getDerivedKey(secret: string): Promise<Uint8Array> {
  return hkdf(
    "sha256",
    secret,
    COOKIE_NAME,                                       // salt = cookie name
    `Auth.js Generated Encryption Key (${COOKIE_NAME})`, // info
    32                                                 // 32 bytes para AES-256
  );
}

export async function authMiddleware(
  req: Request,
  res: Response,
  next: NextFunction
) {
  // Aceita token do cookie (browser) ou Authorization header (API clients)
  const token =
    req.cookies?.[COOKIE_NAME] ||
    req.headers.authorization?.replace("Bearer ", "");

  if (!token) {
    return res.status(401).json({ error: "Não autenticado" });
  }

  try {
    const secret = process.env.AUTH_SECRET;
    if (!secret) throw new Error("AUTH_SECRET não configurado");

    const encryptionKey = await getDerivedKey(secret);
    const { payload } = await jwtDecrypt(token, encryptionKey);

    // payload contém: sub, role, empresaId, iat, exp
    req.user = {
      id: payload.sub as string,
      role: payload.role as string,
      empresaId: (payload.empresaId as string | null) ?? null,
    };

    next();
  } catch {
    return res.status(401).json({ error: "Token inválido ou expirado" });
  }
}
```

### Pattern 6: Express Middleware — Injeção do Tenant Client

```typescript
// apps/api/src/middleware/tenant.ts

import type { Request, Response, NextFunction } from "express";
import { prisma, createTenantClient } from "@cargo-sentinel/database";

export function tenantMiddleware(
  req: Request,
  _res: Response,
  next: NextFunction
) {
  const empresaId = req.user?.empresaId;

  if (empresaId) {
    // Usuário normal — scoped ao tenant
    req.tenantClient = createTenantClient(prisma, empresaId);
  } else if (req.user?.role === "SUPER_ADMIN") {
    // Super Admin — acesso irrestrito (sem filtro de tenant)
    req.tenantClient = prisma as unknown as ReturnType<typeof createTenantClient>;
  }
  // Se chegou aqui sem user, authMiddleware já retornou 401

  next();
}
```

### Pattern 7: Extensão de Tipos Express

```typescript
// apps/api/src/types/express.d.ts

import type { PrismaClient } from "@prisma/client";
import type { createTenantClient } from "@cargo-sentinel/database";

declare global {
  namespace Express {
    interface Request {
      user?: {
        id: string;
        role: string;
        empresaId: string | null;
      };
      tenantClient?: ReturnType<typeof createTenantClient>;
    }
  }
}
```

### Pattern 8: Middleware de RBAC no Express

```typescript
// apps/api/src/middleware/rbac.ts

import type { Request, Response, NextFunction } from "express";

type Role = "SUPER_ADMIN" | "ADMIN_EMPRESA" | "OPERADOR";

export function requireRole(...roles: Role[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.user || !roles.includes(req.user.role as Role)) {
      return res.status(403).json({ error: "Acesso negado" });
    }
    next();
  };
}

// Uso:
// router.post("/obras", authMiddleware, requireRole("ADMIN_EMPRESA", "SUPER_ADMIN"), criarObra);
// router.get("/obras", authMiddleware, requireRole("ADMIN_EMPRESA", "OPERADOR", "SUPER_ADMIN"), listarObras);
```

### Pattern 9: Refresh Token (Cookie httpOnly separado)

Auth.js v5 com CredentialsProvider **não tem refresh token nativo**. A sessão JWT expira em 15 min (AUTH-04) e o usuário seria deslogado. A abordagem mais simples compatível com as decisões locked:

**Opção A (recomendada para v1):** Usar `maxAge: 7 * 24 * 3600` na sessão JWT (7 dias) e documentar que "refresh" é o cookie de sessão do próprio Auth.js. O TTL de 15 min é o ideal de segurança, mas requer implementação de refresh token manual complexa.

**Opção B (AUTH-04 literal):** Implementar endpoint Express `POST /api/auth/refresh` que:
1. Lê cookie `refresh_token` (httpOnly, SameSite=Strict)
2. Valida contra tabela `RefreshToken` no Postgres
3. Emite novo session cookie via `signIn` (não disponível server-side no Auth.js sem workaround)

**Recomendação do pesquisador:** Para Phase 2, implementar Opção A com `maxAge: 900` (15 min) na sessão Auth.js e `updateAge: 300` (renova a cada 5 min de atividade). Logout (AUTH-06) limpa o cookie. A Opção B (refresh token real) é complexidade adicional — reservar para hardening pós-MVP.

### Anti-Patterns a Evitar

- **`jsonwebtoken.verify()` para tokens Auth.js:** Retorna erro de formato inválido — Auth.js usa JWE, não JWS
- **`next-auth@latest` no package.json:** Instala v4, não v5 — sempre especificar `next-auth@beta`
- **Copiar `auth.ts` completo no middleware.ts:** O middleware Next.js roda no Edge Runtime — Edge não suporta `bcryptjs`. Usar `auth.config.ts` (sem providers que usam Node.js) no middleware e `auth.ts` completo nas Server Components/API routes
- **`io.emit()` global no Socket.IO:** (relevante para Phase 3) — nunca vazar eventos entre tenants
- **Exibir empresaId no frontend como trust source:** Sempre extrair `empresaId` do JWT server-side, nunca do body da request

---

## Don't Hand-Roll

| Problema | Não Construir | Usar | Por quê |
|----------|--------------|------|---------|
| Hash de senha | Função SHA256 própria ou MD5 | `bcryptjs` | bcrypt tem salt automático + custo configurável; SHA256 puro é inseguro para senhas |
| Verificação JWT | Parser manual de token | `jose` + `@panva/hkdf` | Auth.js usa JWE com HKDF; formato não é JWT padrão — verificação manual vai falhar em edge cases |
| Proteção de rotas Next.js | if-else em cada page | `middleware.ts` com `auth` export | Middleware é edge-first, roda antes do render — mais eficiente e centralizado |
| RBAC | switch/case por role em cada route handler | `requireRole()` middleware + enum Prisma | Centraliza lógica; fácil de auditar e manter |
| Suspend empresa | Soft delete | Campo `status: EmpresaStatus` + check no `authorize()` | Auth.js `authorize` rejeita login se `empresa.status === SUSPENSO`; sem DB delete |

**Key insight:** A parte mais perigosa de hand-roll neste domínio é a verificação de tokens. Auth.js v5 usa um formato JWE não-padrão que a maioria dos tutoriais JWT ignora. Qualquer middleware Express que use `jsonwebtoken.verify()` ou `jwt.decode()` vai silenciosamente falhar ou retornar `null` — parecendo que funciona em testes mas deixando rotas sem proteção.

---

## Common Pitfalls

### Pitfall 1: next-auth@latest instala v4, não v5
**O que dá errado:** `pnpm add next-auth` instala 4.24.14. A config de v5 (`export const { handlers, auth } = NextAuth(...)`) não existe em v4.
**Por que acontece:** npm dist-tag `latest` aponta para v4; v5 está na tag `beta`
**Como evitar:** Sempre `pnpm add next-auth@beta` ou pinado `next-auth@5.0.0-beta.31`
**Sinal de alerta:** Import `import NextAuth from "next-auth"` funciona mas export `{ handlers }` não existe

### Pitfall 2: Edge Runtime incompatível com bcryptjs no middleware
**O que dá errado:** `auth.ts` com `bcryptjs` importado diretamente quebra no middleware Next.js (roda em Edge Runtime; bcryptjs usa Node.js `crypto`)
**Por que acontece:** Next.js middleware roda no Edge Runtime onde módulos Node.js não estão disponíveis
**Como evitar:** Criar `auth.config.ts` SEM imports de bcryptjs/Prisma, exportar para middleware. O `auth.ts` completo (com providers) fica separado para Server Components
**Sinal de alerta:** Erro `The edge runtime does not support Node.js 'crypto' module`

### Pitfall 3: Salt errado na descriptografia Express
**O que dá errado:** Express descriptografa com salt errado → `jwtDecrypt` retorna erro mesmo com `AUTH_SECRET` correto
**Por que acontece:** Auth.js v5 usa `"authjs.session-token"` como salt em HTTP e `"__Secure-authjs.session-token"` em HTTPS. Auth.js v4 usa salt vazio com info string diferente.
**Como evitar:** Verificar cookie name em dev vs prod; usar variável de ambiente ou detecção por `NODE_ENV`
**Sinal de alerta:** `JWEDecryptionFailed` ou `JWEInvalid` no Express mesmo com secret correto

### Pitfall 4: empresaId null para SUPER_ADMIN quebra createTenantClient
**O que dá errado:** `createTenantClient(prisma, null)` injeta `where: { empresaId: null }` — filtra registros onde `empresaId IS NULL`, que são zero (todos têm empresaId)
**Por que acontece:** O `$extends` da Phase 1 não trata o caso de `empresaId === null`
**Como evitar:** No middleware Express de tenant, verificar role antes de chamar `createTenantClient`. SUPER_ADMIN recebe o `prisma` não-estendido (sem filtro de tenant)
**Sinal de alerta:** Super Admin vê 0 resultados em qualquer query

### Pitfall 5: req.user populado mas sem req.tenantClient
**O que dá errado:** Rota usa `req.tenantClient` mas `tenantMiddleware` não foi montado, ou foi montado na ordem errada
**Por que acontece:** `authMiddleware` e `tenantMiddleware` são dois middlewares separados; se apenas um for registrado, o outro não executa
**Como evitar:** Montar sempre em ordem: `app.use(authMiddleware)` → `app.use(tenantMiddleware)` para rotas protegidas. Usar composição: `router.use([authMiddleware, tenantMiddleware])` nos routers protegidos
**Sinal de alerta:** `TypeError: Cannot read properties of undefined (reading 'obra')` em runtime

### Pitfall 6: Auth.js callback `authorized` sem return explícito
**O que dá errado:** Middleware protege todas as rotas mas nunca permite acesso à página de login → loop de redirect infinito
**Por que acontece:** `authorized: async ({ auth }) => !!auth` redireciona `/login` para `/login`
**Como evitar:** No matcher, excluir `/login` e rotas públicas: `/((?!login|api/auth|_next/...).*)`. Ou verificar `request.nextUrl.pathname` no callback
**Sinal de alerta:** Browser mostra "Too many redirects"

---

## Code Examples

### Verificado: HKDF decrypt de token Auth.js no Express

```typescript
// Source: gist.github.com/aegrumet + fatih.medium.com (verificado por múltiplas fontes)
import { jwtDecrypt } from "jose";
import { hkdf } from "@panva/hkdf";

const SALT = process.env.NODE_ENV === "production"
  ? "__Secure-authjs.session-token"
  : "authjs.session-token";

async function decryptAuthToken(token: string, secret: string) {
  const key = await hkdf(
    "sha256",
    secret,
    SALT,
    `Auth.js Generated Encryption Key (${SALT})`,
    32
  );
  const { payload } = await jwtDecrypt(token, key);
  return payload; // { sub, role, empresaId, iat, exp }
}
```

### Verificado: Module augmentation Auth.js v5 com TypeScript

```typescript
// Source: authjs.dev/guides/role-based-access-control [CITED]
// apps/web/types/next-auth.d.ts
import type { DefaultSession } from "next-auth";

declare module "next-auth" {
  interface Session {
    user: {
      role: "SUPER_ADMIN" | "ADMIN_EMPRESA" | "OPERADOR";
      empresaId: string | null;
    } & DefaultSession["user"];
  }
}
```

### Verificado: CredentialsProvider com verificação de empresa suspensa

```typescript
// Source: authjs.dev/getting-started/providers/credentials [CITED]
// Pattern adaptado para Cargo Sentinel
async authorize(credentials) {
  const user = await prisma.user.findUnique({
    where: { email: credentials.email as string },
    include: { empresa: { select: { status: true } } },
  });
  if (!user) return null;
  if (user.empresa?.status === "SUSPENSO") return null; // TENANT-01
  const valid = await bcryptjs.compare(credentials.password as string, user.passwordHash);
  if (!valid) return null;
  return { id: user.id, email: user.email, name: user.nome, role: user.role, empresaId: user.empresaId };
}
```

### Verificado: Route handler Next.js — Auth.js handlers

```typescript
// Source: authjs.dev [CITED]
// apps/web/app/api/auth/[...nextauth]/route.ts
import { handlers } from "@/auth";
export const { GET, POST } = handlers;
```

### Verificado: Proteção de Server Component

```typescript
// Source: authjs.dev/getting-started/session-management/protecting [CITED]
import { auth } from "@/auth";
import { redirect } from "next/navigation";

export default async function DashboardPage() {
  const session = await auth();
  if (!session) redirect("/login");
  // session.user.empresaId e session.user.role disponíveis
  return <div>Bem-vindo, {session.user.name}</div>;
}
```

---

## State of the Art

| Abordagem Antiga | Abordagem Atual (2026) | Impacto |
|------------------|------------------------|---------|
| `getServerSession(authOptions)` | `auth()` (função unificada) | Mesmo padrão para Server Components, Route Handlers e middleware |
| Auth.js v4 como recomendação | Better Auth v1.6.20 é a nova recomendação oficial | Auth.js v5 está em modo manutenção de segurança — não receberá novas features |
| MinIO para S3 | Garage v2.x | MinIO arquivado em abril 2026 (já tratado no Phase 1) |
| `next/middleware` com `withAuth` | `middleware.ts` exportando `auth` diretamente | Simplificação — v5 é App Router first |
| Password stored as MD5 | `bcryptjs` com cost factor ≥ 10 | MD5 quebrável com GPU; bcrypt resiste a força bruta |

**Deprecated/obsoleto:**
- `pages/api/auth/[...nextauth].ts` (Pages Router): substituído por `app/api/auth/[...nextauth]/route.ts` (App Router). Auth.js v5 suporta ambos, mas novo código deve usar App Router
- `getToken()` do Auth.js: ainda funciona mas `auth()` é o padrão em v5
- `getServerSession()`: substituído por `auth()` em v5

---

## Assumptions Log

| # | Claim | Seção | Risco se Errado |
|---|-------|-------|-----------------|
| A1 | Salt para Auth.js v5 é `"authjs.session-token"` (sem `__Secure-` em dev) | Pattern 5 / Pitfall 3 | Express não consegue descriptografar token → todos os requests ao API retornam 401 |
| A2 | `maxAge: 900` na config JWT Auth.js define TTL do access token em 15 min | Pattern 2 | TTL diferente do especificado em AUTH-04 |
| A3 | bcryptjs 3.x tem mesma API de hash/compare que 2.x | Standard Stack | Quebra no `bcryptjs.compare()` se API mudou — verificar CHANGELOG antes de usar |
| A4 | `@prisma/adapter-pg` v7 funciona com o modelo `User` adicionado | Schema Pattern 1 | Migração falha — mas risk baixo pois adapter é agnóstico ao schema |

**Itens que precisam confirmação do usuário antes de executar:**
- A decisão de usar Auth.js v5 (beta, em modo manutenção) vs Better Auth v1.6.20 (stable, nova recomendação). CLAUDE.md lockeia Auth.js v5, mas a situação mudou desde que o CLAUDE.md foi escrito. O planner deve apresentar esta escolha ao usuário.

---

## Open Questions (RESOLVED)

1. **Auth.js v5 vs Better Auth — confirmar com o usuário**
   - RESOLVED: Manter Auth.js v5 (next-auth@beta) conforme CLAUDE.md. Usuário confirmou explicitamente antes do planejamento.

2. **Refresh token real (AUTH-04) vs sessão JWT longa**
   - RESOLVED: JWT com `maxAge: 7 * 24 * 3600` (7 dias) + `updateAge: 5 * 60` (5 min). Sem tabela RefreshToken para MVP. Usuário confirmou explicitamente antes do planejamento.

3. **Cookie read no Express — cookie-parser necessário**
   - RESOLVED: `cookie-parser` adicionado no Plan 03 Task 1 (`apps/api/package.json`).

---

## Environment Availability

| Dependência | Requerida por | Disponível | Versão | Fallback |
|-------------|--------------|-----------|---------|----------|
| Node.js | Tudo | ✓ | v24.14.1 | — |
| PostgreSQL | Prisma / User model | ✓ (via Docker) | 16+ | — |
| Redis | BullMQ (Phase 1) | ✓ (via Docker) | 7.x | — |
| pnpm | Monorepo | ✓ | — | — |
| bcryptjs | Hash de senha | ✗ (não instalado) | 3.0.3 | — (obrigatório) |
| jose | Decrypt JWE no Express | ✗ (não instalado) | 6.2.3 | — (obrigatório) |
| @panva/hkdf | HKDF para decrypt | ✗ (não instalado) | 1.2.1 | — (obrigatório) |
| next-auth@beta | Auth session | ✗ (não instalado) | 5.0.0-beta.31 | — (obrigatório) |
| cookie-parser | Ler session cookie no Express | ✗ (não instalado) | — | — (obrigatório) |

**Dependências faltando sem fallback (bloqueantes):**
- `next-auth@beta` — instalar em `apps/web`
- `bcryptjs` + `@types/bcryptjs` — instalar em `apps/web`
- `jose` + `@panva/hkdf` — instalar em `apps/api`
- `cookie-parser` + `@types/cookie-parser` — instalar em `apps/api`

---

## Validation Architecture

### Test Framework

| Propriedade | Valor |
|-------------|-------|
| Framework | Vitest 4.1.9 |
| Config file | Implícito (detecção automática) — cada workspace tem script `test` |
| Quick run command | `pnpm --filter api test:unit` |
| Full suite command | `pnpm test` (via Turborepo) |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Comando Automatizado | Arquivo Existe? |
|--------|----------|-----------|---------------------|-----------------|
| AUTH-01 | Login com email/senha corretos retorna sessão | unit | `pnpm --filter api test -- auth.test.ts` | ❌ Wave 0 |
| AUTH-01 | Login com senha errada retorna null | unit | `pnpm --filter api test -- auth.test.ts` | ❌ Wave 0 |
| AUTH-02 | JWT payload contém sub, empresaId, role | unit | `pnpm --filter api test -- auth.test.ts` | ❌ Wave 0 |
| AUTH-03 | OPERADOR rejeitado em rota ADMIN_EMPRESA | unit | `pnpm --filter api test -- rbac.test.ts` | ❌ Wave 0 |
| AUTH-04 | Token expira em 15 min (via config, não testável unitariamente) | manual | Verificar `session.maxAge` na config | — |
| AUTH-05 | authMiddleware + tenantMiddleware populam req.user e req.tenantClient | unit | `pnpm --filter api test -- middleware.test.ts` | ❌ Wave 0 |
| AUTH-06 | Logout limpa cookie de sessão | integration | `pnpm --filter api test -- logout.test.ts` | ❌ Wave 0 |
| TENANT-01 | Empresa suspensa bloqueia login | unit | `pnpm --filter api test -- auth.test.ts` | ❌ Wave 0 |
| TENANT-05 | Admin cria Obra apenas para sua empresa | unit | `pnpm --filter api test -- obras.test.ts` | ❌ Wave 0 |
| TENANT-06 | OPERADOR não vê obras de outro tenant | unit | `pnpm --filter api test -- obras.test.ts` | ❌ Wave 0 |

### Wave 0 Gaps

- [ ] `apps/api/src/middleware/auth.test.ts` — cobre AUTH-02, AUTH-05
- [ ] `apps/api/src/middleware/rbac.test.ts` — cobre AUTH-03
- [ ] `apps/api/src/routes/obras.test.ts` — cobre TENANT-05, TENANT-06
- [ ] `apps/web/auth.test.ts` — cobre AUTH-01, TENANT-01

---

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Aplica | Controle Padrão |
|---------------|--------|-----------------|
| V2 Authentication | sim | Auth.js v5 CredentialsProvider + bcryptjs cost 12 |
| V3 Session Management | sim | httpOnly cookie; `maxAge: 900`; `updateAge: 300` |
| V4 Access Control | sim | `requireRole()` middleware + `createTenantClient()` |
| V5 Input Validation | sim | Zod no `authorize()` callback e nos body parsers de rota |
| V6 Cryptography | sim | bcryptjs para hash; jose JWE para tokens — nunca hand-roll |

### Known Threat Patterns para o Stack

| Pattern | STRIDE | Mitigação Padrão |
|---------|--------|-----------------|
| Credential stuffing / brute force | Spoofing | `express-rate-limit` em `POST /api/auth/login` — máx 10 tentativas/min por IP |
| JWT token theft | Elevation of privilege | Cookie httpOnly + SameSite=Strict; TTL curto (15 min) |
| Tenant data leakage | Info Disclosure | `createTenantClient()` injeta empresaId em 100% das queries; não usar `prisma` raw em rotas protegidas |
| SUPER_ADMIN empresaId null bypassing tenant filter | Elevation of privilege | Checar role ANTES de chamar createTenantClient; SUPER_ADMIN usa `prisma` não-estendido |
| Replay de token expirado | Elevation of privilege | Auth.js verifica `exp` no decrypt; middleware não precisa verificar manualmente |
| CNPJ/email exposure | Info Disclosure | Nunca retornar `passwordHash` em responses; filtrar campos no select Prisma |
| Login page redirect loop | Denial of Service | Excluir `/login` do matcher do middleware.ts |

---

## Sources

### Primary (HIGH confidence)
- `authjs.dev/getting-started/providers/credentials` — CredentialsProvider setup verificado
- `authjs.dev/guides/role-based-access-control` — module augmentation e callbacks JWT/session
- `authjs.dev/getting-started/session-management/protecting` — middleware Next.js com matcher
- `authjs.dev/guides/refresh-token-rotation` — estratégia de refresh (OAuth; adaptado para Credentials)
- `npm view next-auth dist-tags` — confirmação que v5 está em `beta` tag, v4 é `latest` [VERIFIED: npm registry 2026-06-20]
- `npm view bcryptjs version` → 3.0.3 [VERIFIED: npm registry 2026-06-20]
- `npm view jose version` → 6.2.3 [VERIFIED: npm registry 2026-06-20]
- `npm view @panva/hkdf version` → 1.2.1 [VERIFIED: npm registry 2026-06-20]
- `npm view better-auth version` → 1.6.20 [VERIFIED: npm registry 2026-06-20]

### Secondary (MEDIUM confidence)
- `gist.github.com/aegrumet/9ca3e13278b8543348bfdb270133512d` — parâmetros HKDF para Auth.js v5 descriptografia (salt, info string) — verificado por múltiplas fontes secundárias
- `medium.com/@fatih969692` — incompatibilidade `jsonwebtoken.verify()` com Auth.js JWE — verificado conceptualmente
- `medium.com/@noahyoungs` — Auth.js v5 usa `A256CBC-HS512`; salt = cookie name

### Tertiary (LOW confidence — validar antes de usar)
- `github.com/nextauthjs/next-auth/discussions/13252` — status da transferência Auth.js → Better Auth (confirmado pela documentação oficial do Auth.js mas thread pode ter informações desatualizadas)
- `blog.logrocket.com/best-auth-library-nextjs-2026/` — comparação Auth.js vs Better Auth para 2026

---

## Metadata

**Confidence breakdown:**
- Standard Stack: HIGH — versões verificadas no npm registry em 2026-06-20
- Architecture Patterns: HIGH — padrões verificados na documentação oficial Auth.js v5
- Express JWT decrypt: MEDIUM — mecanismo verificado em múltiplas fontes secundárias; salt específico marcado como ASSUMED (A1)
- Refresh token: MEDIUM — Auth.js não documenta refresh para CredentialsProvider; estratégia documentada é workaround
- Auth.js v5 vs Better Auth: HIGH — status verificado via npm registry + documentação oficial

**Research date:** 2026-06-20
**Valid until:** 2026-07-20 (Auth.js v5 em beta — pode ter breaking changes; verificar nova beta antes de iniciar)
