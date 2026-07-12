---
phase: quick
plan: 260712-rtv
subsystem: dev-environment
tags: [docker, auth-js, cookies, local-dev]
requires: []
provides: [login funcional em dev local via docker-compose]
affects: [docker-compose.override.yml]
key-files:
  modified:
    - docker-compose.override.yml
key-decisions:
  - "Fix isolado no docker-compose.override.yml (dev-only) — não tocar em docker-compose.yml de produção, onde AUTH_COOKIE_DOMAIN/AUTH_URL de produção continuam corretos."
duration: ~10min
completed: 2026-07-12
---

# Quick Task 260712-rtv: Corrigir cookie de sessão Auth.js em dev local

## Accomplishments

- Diagnosticado: `AUTH_COOKIE_DOMAIN=.ggtronic.com.br` (herdado do `.env` de produção) fazia o navegador rejeitar o cookie `__Secure-authjs.session-token` ao acessar `http://localhost:3000` — o atributo `Domain` do cookie não corresponde ao host da requisição, então nenhum navegador aceita/envia o cookie de volta.
- Corrigido em `docker-compose.override.yml` (serviço `web`): `NODE_ENV: development`, `AUTH_URL: "http://localhost:3000"`, `AUTH_COOKIE_DOMAIN: ""`.
- Validado via curl simulando o fluxo completo de login (csrf → callback/credentials → session) com as 3 contas seed — todas retornam sessão válida.

## Task Commits

1. **Task 1: Sobrescrever AUTH_URL/AUTH_COOKIE_DOMAIN/NODE_ENV para dev local no override** - `10fce52` (fix)

## Context

Descoberto ao testar o login logo após o rebuild/reseed do docker (quick tasks 260712-o0s e 260712-rh1) — usuário reportou "não está logando com o super admin". Causa raiz não relacionada ao trabalho de Z-API; era configuração de ambiente (.env de produção sendo usado para acesso via localhost).
