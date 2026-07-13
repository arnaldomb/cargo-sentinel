---
phase: quick
plan: 260713-rxh
subsystem: deploy-infra
tags: [traefik, docker-compose, hostinger, vps]
requires:
  - phase: quick-260713-qzz
    provides: docker-compose.vps.yml compatível com Traefik compartilhado (conteúdo agora é o docker-compose.yml da raiz)
provides: [docker-compose.yml correto para deploy real via Hostinger Docker Manager]
affects:
  - docker-compose.yml
  - docker-compose.local.yml
  - .github/workflows/deploy.yml
  - README.md
key-decisions:
  - "Hostinger Docker Manager sempre usa docker-compose.yml da raiz, sem opção de escolher arquivo — confirmado pelo usuário. Única solução viável: inverter os arquivos (raiz = versão compartilhada, local.yml = standalone), replicando exatamente a estrutura do opencheck."
  - "Packages GHCR do cargo-sentinel (api/web/migrate) estavam privados — diferente do opencheck-api (público) — o que quebraria docker compose pull mesmo com o arquivo certo. Usuário optou por tornar públicos (mesma decisão do opencheck) em vez de configurar autenticação no VPS."
duration: ~20min
completed: 2026-07-13
---

# Quick Task 260713-rxh: Inverter arquivos compose para compatibilidade com Hostinger Docker Manager

## Accomplishments

- Diagnosticado em produção real: usuário tentou subir via Hostinger Docker Manager (deploy git-based), o painel puxou `docker-compose.yml` (standalone, Traefik próprio) e falhou com `address already in use` na porta 80 — conflito com o Traefik compartilhado (`traefik-traefik-1`) já rodando pro opencheck.
- `docker-compose.yml` (raiz) e `docker-compose.vps.yml` trocaram de papel: raiz agora é a versão sem Traefik próprio (o que Hostinger/CI usam por padrão); versão standalone renomeada para `docker-compose.local.yml`.
- `.github/workflows/deploy.yml` simplificado de volta (sem `-f`, já que o arquivo padrão agora é o certo).
- README.md: seção de deploy cobre as duas rotas reais (Hostinger Docker Manager git-based, e SSH manual), com aviso sobre visibilidade dos packages GHCR; comandos de dev local atualizados para `-f docker-compose.local.yml -f docker-compose.override.yml` explícito.
- Descoberto e reportado ao usuário: packages `cargo-sentinel-{api,web,migrate}` no GHCR são privados (`docker pull` retorna `unauthorized`), diferente de `opencheck-api` (público) — bloquearia o `docker compose pull` mesmo com o compose correto. Usuário decidiu tornar públicos manualmente (ação fora do repositório, não automatizável via API disponível).
- Ambos os composes (`docker-compose.yml` e `docker-compose.local.yml` + override) validados com `docker compose config --quiet`.

## Task Commits

1. **Inverter arquivos compose + CI + README** - `97f9579` (fix)

## Context

Usuário estava fazendo o primeiro deploy real via painel Hostinger e recebeu o erro de porta 80 em uso — confirmando exatamente o risco identificado na tarefa anterior (260713-qzz), mas por um caminho diferente do previsto (Hostinger Docker Manager em vez de GitHub Actions CI). A CI nunca chegou a rodar com sucesso até este ponto: não há secrets VPS_HOST/VPS_USER/VPS_SSH_KEY configurados no repositório (usuário optou por fazer deploy manual/via Hostinger em vez de configurar a CI SSH).
