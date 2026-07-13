---
phase: quick
plan: 260713-sjb
subsystem: deploy-infra
tags: [docker-compose, garage, hostinger, configs]
requires:
  - phase: quick-260713-rxh
    provides: docker-compose.yml (raiz) correto pro Hostinger Docker Manager
provides: [garage.toml embutido no compose, sem dependência de bind mount de arquivo]
affects:
  - docker-compose.yml
  - .env.example
  - README.md
key-decisions:
  - "Usado o recurso configs: (Compose) com content inline em vez de bind mount de arquivo — Hostinger Docker Manager só copia o docker-compose.yml pra pasta persistente do projeto, nunca o resto do repositório (garage/garage.toml nunca existia no host, Docker criava uma pasta vazia no lugar)."
  - "rpc_secret e admin_token do Garage, antes hardcoded como placeholders dev no garage.toml, agora vêm de GARAGE_RPC_SECRET/GARAGE_ADMIN_TOKEN no .env — interpolados no config inline pelo próprio Compose."
duration: ~25min
completed: 2026-07-13
---

# Quick Task 260713-sjb: garage.toml embutido no docker-compose.yml

## Accomplishments

- Diagnosticado em produção real (logs do usuário via SSH): `docker logs cargo-sentinel_garage` mostrava `Error: IO error: Is a directory (os error 21)` ao ler `/etc/garage.toml`. `docker inspect` confirmou o bind mount source `/docker/lprsentinel/garage/garage.toml` — e esse caminho era uma PASTA (criada automaticamente pelo Docker porque o arquivo nunca existiu ali).
- Causa raiz: Hostinger Docker Manager clona o repo pra build em `/tmp/`, mas o deploy persistente roda a partir de `/docker/lprsentinel/`, onde só o `docker-compose.yml` é colocado — nenhum outro arquivo do repositório (incluindo `garage/garage.toml`) chega lá.
- Corrigido: `docker-compose.yml` ganhou um bloco `configs: garage_toml: content: |...` com o TOML completo embutido, interpolando `${GARAGE_RPC_SECRET}`/`${GARAGE_ADMIN_TOKEN}`. Serviço `garage` trocou o bind mount por `configs: [{source: garage_toml, target: /etc/garage.toml}]`.
- `.env.example` ganhou as duas variáveis novas. README.md atualizado (removida a instrução de `curl` do garage.toml, explicado o porquê do config inline).
- De quebra: revertido um valor real de `ZAPI_CLIENT_TOKEN` que estava carregado (não commitado) em `.env.example` — restaurado ao placeholder antes do commit, já que esse arquivo é versionado.
- Validado com `docker compose -f docker-compose.yml config` — conteúdo do garage.toml interpolado corretamente, sem warnings de sintaxe.

## Task Commits

1. **garage.toml via configs inline** - `36524de` (fix)

## Context

Terceira iteração de correção do deploy real no Hostinger nesta sessão (depois de 260713-qzz e 260713-rxh). Usuário estava fazendo o deploy de verdade via painel Hostinger Docker Manager e reportando os erros em tempo real; cada iteração corrigiu uma camada diferente do mesmo problema geral (ferramentas de deploy git-based que só entendem "docker-compose.yml na raiz" e não replicam o resto da estrutura do repositório).
