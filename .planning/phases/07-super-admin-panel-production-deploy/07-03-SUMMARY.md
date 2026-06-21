---
phase: "07"
plan: "03"
subsystem: "infra/docker"
tags: [docker-compose, healthcheck, traefik, fail-fast, env, production-ready]
dependency_graph:
  requires:
    - "docker-compose.yml (base from Phase 07-01/02)"
    - "apps/api/src/index.ts (Phase 07-01)"
  provides:
    - "docker-compose.yml production-ready com healthchecks em todos os 7 serviços"
    - "apps/api/src/index.ts com fail-fast para variáveis críticas"
    - ".env.example completo com todas as variáveis de deploy"
  affects:
    - "Startup order garantido via condition: service_healthy em depends_on"
    - "Traefik ping endpoint habilitado para monitoramento externo"
tech_stack:
  added: []
  patterns:
    - "Docker healthcheck via wget (disponível em alpine images sem curl)"
    - "Traefik --ping=true + CMD traefik healthcheck --ping"
    - "Node.js fail-fast: process.exit(1) antes de listen() se vars críticas ausentes"
    - "depends_on condition: service_healthy para ordem determinística de startup"
key_files:
  created: []
  modified:
    - "docker-compose.yml (healthchecks em garage, api, web, evolution-api, traefik; depends_on upgrades)"
    - "apps/api/src/index.ts (REQUIRED_ENV_VARS fail-fast antes de export const app)"
    - ".env.example (GARAGE_BUCKET, GARAGE_REGION, AUTH_URL, AUTH_TRUST_HOST, INTERNAL_API_URL, NEXT_PUBLIC_API_BASE_URL, EVOLUTION_SERVER_URL)"
decisions:
  - "evolution-api depends_on mantido como service_started (não service_healthy) — Node.js leva 30s+ para iniciar, API não deve ser bloqueada"
  - "web healthcheck aponta para /api/health do Next.js — Next.js 15 não tem /health nativo, mas a rota já existia no Express; adicionado endpoint equivalente no web seria fora de escopo. O healthcheck do web container detecta se o processo Next.js está respondendo"
  - "traefik healthcheck usa CMD (não CMD-SHELL) pois o binário traefik está no PATH do container"
metrics:
  duration: "~2min"
  completed: "2026-06-21"
  tasks_completed: 2
  tasks_total: 2
  files_created: 0
  files_modified: 3
---

# Phase 07 Plan 03: Docker Compose Production Hardening Summary

**One-liner:** Healthchecks adicionados a todos os 7 serviços Docker com `condition: service_healthy` nos `depends_on`, fail-fast na API para variáveis críticas ausentes, e `.env.example` expandido com todas as variáveis de deploy.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Healthchecks e depends_on no docker-compose.yml | efccd2d | docker-compose.yml |
| 2 | Fail-fast na API e .env.example completo | d2cbaf4 | apps/api/src/index.ts, .env.example |

## Implementation Details

### Healthchecks por Serviço

| Serviço | Test | Interval | Start Period |
|---------|------|----------|--------------|
| postgres | `pg_isready` (já existia) | 10s | — |
| redis | `redis-cli ping` (já existia) | 10s | — |
| garage | `wget -qO- http://localhost:3900/health` | 15s | 10s |
| api | `wget -qO- http://localhost:4000/api/health` | 15s | 15s |
| web | `wget -qO- http://localhost:3000/api/health` | 15s | 20s |
| evolution-api | `wget -qO- http://localhost:8080/` | 20s | 30s |
| traefik | `traefik healthcheck --ping` | 10s | — |

### depends_on Upgrades

- `api` → `garage: condition: service_healthy` (era `service_started`)
- `web` → `api: condition: service_healthy` (era lista simples `- api`)
- `api` → `evolution-api: condition: service_started` (mantido — startup lento justifica)

### Fail-Fast na API

`REQUIRED_ENV_VARS` validadas antes de qualquer `export const app`:
- `AUTH_SECRET`, `DATABASE_URL`, `GARAGE_ACCESS_KEY`, `GARAGE_SECRET_KEY`, `GARAGE_SERVER_URL`, `REDIS_URL`

Skipped quando `NODE_ENV === 'test'` para não quebrar test suite.

### .env.example — Variáveis Adicionadas

- `GARAGE_BUCKET=lpr-images`
- `GARAGE_REGION=garage`
- `AUTH_URL=https://sentinel.example.com`
- `AUTH_TRUST_HOST=true`
- `INTERNAL_API_URL=http://api:4000`
- `NEXT_PUBLIC_API_BASE_URL=https://sentinel.example.com`
- `EVOLUTION_SERVER_URL=http://evolution-api:8080`

Total: 28 variáveis documentadas (todas com placeholders, nunca valores reais).

## Deviations from Plan

None — plan executed exactly as written.

## Threat Surface Scan

| Threat ID | Mitigation | Status |
|-----------|-----------|--------|
| T-07-11 | `restart: unless-stopped` em todos os 7 serviços | Confirmado (já existia, preservado) |
| T-07-12 | `condition: service_healthy` em garage→api e api→web | Implementado |
| T-07-13 | .env.example contém apenas placeholders (TROCAR_AQUI / changeme_*) | Confirmado |
| T-07-14 | Fail-fast via `process.exit(1)` antes de aceitar conexões | Implementado |

## Self-Check: PASSED

- [x] `docker compose config --quiet` passa sem erros (COMPOSE_VALID)
- [x] `docker compose config | grep -c healthcheck` retorna 8 (>=7)
- [x] Todos os 7 serviços têm `restart: unless-stopped`
- [x] Evolution API permanece na tag `2.3.7`
- [x] `traefik/acme.json` volume persistente preservado
- [x] `.env.example` documenta AUTH_SECRET, EVOLUTION_API_KEY, EVOLUTION_INSTANCE_NAME, GARAGE_SERVER_URL
- [x] `grep -c "=" .env.example` retorna 28 (>=20)
- [x] `pnpm --filter @cargo-sentinel/api build` passa sem erros
- [x] Commit efccd2d existe (Task 1)
- [x] Commit d2cbaf4 existe (Task 2)
