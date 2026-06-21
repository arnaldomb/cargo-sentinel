# Cargo Sentinel

## What This Is

Plataforma SaaS multi-tenant de inteligência de perímetro logístico para canteiros de obra. Monitora entrada, saída e recorrência de veículos via câmeras LPR Intelbras, classificando cada placa em 5 níveis de risco (Liberado → Crítico) e cruzando eventos entre múltiplas obras da mesma empresa em tempo real.

Não é só um receptor LPR — é inteligência operacional para prevenção de furtos em construção civil.

## Core Value

**Em 1 clique, o operador classifica um veículo suspeito. Na próxima leitura em qualquer obra da empresa, o alerta dispara automaticamente.**

## Context

- **Domínio:** Segurança patrimonial + logística de obras
- **Usuário primário:** Operadores de segurança em canteiros (não técnicos)
- **Comprador:** Construtoras médias/grandes com múltiplas obras simultâneas
- **Referência de UI/UX:** [D:\GGTRONIC\Desenvolvimeto\ctrl-safe\opencheck] — mesmas cores, mesmo padrão de menu
  - `ggtech-darkblue`: #003366 (sidebar)
  - `ggtech-blue`: #0056b3 (primary actions)
  - `ggtech-lightblue`: #007bff (secondary accent)
  - Fonts: Roboto (body) + Open Sans (headings)
  - Icons: Lucide React
- **Câmeras suportadas:** Intelbras LPR (payload JSON com base64 de imagem)
- **Deploy:** Hostinger VPS + Docker + Traefik (mesmo padrão que opencheck)

## Hierarquia de dados

```
Empresa (tenant)
 └── Obras (sites)
      └── Câmeras LPR (com ID único: LPR-0001, LPR-0002...)
           └── Eventos (placa + foto + timestamp + direção)
```

## Classificação de veículos (5 níveis)

| Nível | Nome       | Cor     | Ação automática              |
|-------|------------|---------|------------------------------|
| 1     | Liberado   | 🟢 Verde  | Nenhuma                     |
| 2     | Visitante  | 🔵 Azul   | Validar com responsável     |
| 3     | Atenção    | 🟡 Amarelo| Observação obrigatória      |
| 4     | Suspeito   | 🟠 Laranja| Alerta para supervisores    |
| 5     | Crítico    | 🔴 Vermelho| Alerta global + WhatsApp   |

## Stack decidida

| Camada       | Tecnologia                          |
|-------------|-------------------------------------|
| Frontend    | Next.js 15 + TypeScript + Tailwind v3  |
| Backend API | Node.js + Express + Socket.IO          |
| Database    | PostgreSQL + Prisma v6.9+              |
| Imagens     | Garage v2.x (S3-compat, OSS — MinIO arquivado abr/2026) |
| Monorepo    | Turborepo 2.x + pnpm                   |
| Deploy      | Docker Compose + Traefik v3            |
| Alertas     | WebSocket (painel) + WhatsApp via Evolution API v2.3.7 (pinado) |
| Auth        | Auth.js v5 (NextAuth) + JWT             |
| Filas       | BullMQ + Redis (webhooks async, WhatsApp, relatórios) |

## Roles

- **Super Admin** — Acessa todos os tenants, gerencia planos/clientes
- **Admin Empresa** — Gerencia obras, câmeras, usuários da empresa
- **Operador** — Monitora eventos em tempo real, classifica veículos

## Requirements

### Validated

- [x] Receber eventos LPR via POST /NotificationInfo/:action com foto base64 — Validated in Phase 01: Monorepo LPR Ingestion
- [x] Armazenar fotos em Garage S3-compat com referência no banco — Validated in Phase 01
- [x] Stack local Docker Compose sobe com 6 serviços (web, api, postgres, garage, redis, traefik) — Validated locally em 2026-06-21
- [x] Autenticação JWT com 3 roles (super admin, admin, operador) — Validated in Phase 02: Auth.js v5 JWT sessions
- [x] Multi-tenancy: cada empresa isolada no mesmo banco via tenantClient — Validated in Phase 02
- [x] Hierarquia: Empresa > Obra > Câmera com CRUD protegido por RBAC — Validated in Phase 02

### Active
- [ ] Classificação de veículos em 5 níveis com 1 clique
- [ ] Inteligência multisite: alerta quando placa suspeita aparece em outra obra
- [ ] Painel ao vivo com eventos em tempo real via WebSocket
- [ ] Histórico da placa (todas as aparições, obras, horários)
- [ ] Relatórios filtráveis (data, hora, placa, obra) em PDF e Excel com fotos
- [ ] Super admin: gerenciar tenants, planos, usuários
- [ ] WhatsApp via Evolution API para placas nível 4 e 5
- [ ] Docker Compose + Traefik para deploy em VPS

### Out of Scope (v1)

- Mapa geográfico das obras — v2
- Regras automáticas de classificação por horário — v2
- Integração com câmeras que não sejam Intelbras LPR — v2
- App mobile — v2
- Streaming de vídeo ao vivo — v2
- Cobrança / billing integrado — v2

## Key Decisions

| Decisão | Rationale | Outcome |
|---------|-----------|---------|
| Monorepo Turborepo + pnpm | Mesmo padrão que opencheck — facilita compartilhar tipos e componentes | — Pending |
| MinIO para imagens | Self-hosted S3-compat, sem custo externo, escala para VPS | — Pending |
| Row-level multitenancy (1 banco) | Mais simples de operar do que 1 banco por tenant | — Pending |
| Inteligência multisite no v1 | É o principal diferencial comercial — sem isso não há proposta de valor suficiente | — Pending |
| UI = clone do opencheck | Mesmas cores e padrão de menu acelera desenvolvimento e mantém consistência da marca | — Pending |

## Evolution

Este documento evolui em transições de fase e marcos de milestone.

**Após cada fase** (`/gsd-transition`):
1. Requisitos invalidados? → Mover para Out of Scope
2. Requisitos validados? → Mover para Validated
3. Novos requisitos? → Adicionar em Active
4. Decisões a registrar? → Adicionar em Key Decisions

---
*Last updated: 2026-06-21 — Phase 02 complete (Auth + Multi-tenant), local stack + login validated*
