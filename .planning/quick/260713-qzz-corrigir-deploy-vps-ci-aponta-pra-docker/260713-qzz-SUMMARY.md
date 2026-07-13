---
phase: quick
plan: 260713-qzz
subsystem: deploy-infra
tags: [traefik, docker-compose, ci-cd, vps]
requires: []
provides: [deploy VPS compatível com Traefik compartilhado do opencheck]
affects:
  - .github/workflows/deploy.yml
  - docker-compose.vps.yml
  - README.md
key-decisions:
  - "CI aponta explicitamente para docker-compose.vps.yml em vez de depender de qual arquivo está nomeado docker-compose.yml no VPS (decisão do usuário: não deve ter Traefik próprio no que sobe, já existe um compartilhado no VPS)."
duration: ~15min
completed: 2026-07-13
---

# Quick Task 260713-qzz: Compatibilidade de deploy com Traefik compartilhado (opencheck)

## Accomplishments

- Pesquisa comparativa (agente Explore) confirmou: `docker-compose.vps.yml` do cargo-sentinel já segue o mesmo padrão de `docker-compose.yml` do opencheck (rede externa `proxy`, sem Traefik próprio, certresolver `letsencrypt`, labels `traefik.docker.network=proxy`). Sem colisão de router names (`sentinel-*` vs `opencheck-*`) nem de domínios.
- 3 lacunas corrigidas:
  1. `.github/workflows/deploy.yml` — CI passa a rodar `docker compose -f docker-compose.vps.yml pull/up -d --force-recreate` explicitamente, eliminando a ambiguidade de qual arquivo é `docker-compose.yml` no VPS.
  2. `docker-compose.vps.yml` — serviço `web` ganhou `healthcheck: disable: true`, replicando o requisito documentado pelo opencheck (Next.js standalone atrás de Traefik host-mode).
  3. `README.md` — seção "Deploy em Produção" reescrita do zero para descrever o fluxo real (Traefik compartilhado, rede `proxy`, `docker-compose.vps.yml`), removendo instruções obsoletas (Evolution API, acme.json como se fosse produção, credenciais de seed desatualizadas).
- `docker compose -f docker-compose.vps.yml config --quiet` valida sem erros.

## Task Commits

1. **Fix CI + healthcheck + README** - `93bb047` (fix, commit único cobrindo as 3 tasks)

## Context

Usuário pediu para comparar o cargo-sentinel com o opencheck (já rodando na VPS) para garantir compatibilidade com o Traefik compartilhado, confirmando explicitamente que o cargo-sentinel não deve subir Traefik próprio. Pesquisa via agente Explore mapeou toda a topologia de rede/labels/CI dos dois projetos antes de qualquer mudança.
