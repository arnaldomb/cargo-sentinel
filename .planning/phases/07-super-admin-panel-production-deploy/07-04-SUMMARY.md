---
phase: "07"
plan: "04"
subsystem: "scripts/docs"
tags: [smoke-test, readme, deploy, hostinger, bash, documentation]
dependency_graph:
  requires:
    - "docker-compose.yml production-ready (07-03)"
    - "GET /api/health endpoint (07-01)"
    - "POST /api/lpr/NotificationInfo/vehicle endpoint (01-xx)"
  provides:
    - "scripts/smoke-test.sh — validação end-to-end de deploy de produção"
    - "README.md — guia completo de deploy para Hostinger VPS"
  affects:
    - "Onboarding de novos deploys (README é o ponto de entrada)"
    - "Verificação de saúde pós-deploy (smoke-test.sh)"
tech_stack:
  added: []
  patterns:
    - "Bash smoke test com curl + psql para validação end-to-end"
    - "INSERT ON CONFLICT DO NOTHING para câmera de smoke idempotente"
    - "set -euo pipefail em scripts de ops"
key_files:
  created:
    - "scripts/smoke-test.sh"
    - "README.md"
  modified: []
decisions:
  - "Câmera LPR-SMOKE-01 criada via INSERT ON CONFLICT DO NOTHING antes da Etapa 2 — garante que o worker não rejeite o payload por câmera inexistente"
  - "Placa de teste usa timestamp (SMOKE+epoch) — única por execução, evita colisão entre runs"
  - "Limpeza pós-teste comentada por padrão — ambiente de produção não deve apagar dados silenciosamente"
  - "README em português — projeto e equipe são brasileiros"
metrics:
  duration: "~5min"
  completed: "2026-06-21"
  tasks_completed: 2
  tasks_total: 3
  files_created: 2
  files_modified: 0
---

# Phase 07 Plan 04: Smoke Test Script + README Deploy Summary

**One-liner:** Script bash `smoke-test.sh` com 4 etapas end-to-end (health, webhook LPR mock, persistência BullMQ, idempotência) e README.md com guia completo de deploy para Hostinger VPS com Traefik + Let's Encrypt.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Criar scripts/smoke-test.sh | 44d5b8d | scripts/smoke-test.sh |
| 2 | Criar README.md com deploy Hostinger VPS | cac61c9 | README.md |
| 3 | Checkpoint human-verify | — | Aguardando aprovação |

## Implementation Details

### scripts/smoke-test.sh — Etapas

| Etapa | Descrição | Verificação |
|-------|-----------|-------------|
| 1 | Health endpoint | `GET /api/health → 200` via curl |
| Prep | Garantir câmera smoke | `INSERT ... ON CONFLICT DO NOTHING` para `LPR-SMOKE-01` |
| 2 | Webhook LPR mock | `POST /api/lpr/NotificationInfo/vehicle → 200` com payload Intelbras (1x1 PNG base64) |
| 3 | Processamento assíncrono | Poll psql por `Evento.placaNumero = SMOKE<epoch>` por até 10s |
| 4 | Idempotência | Reenvio do mesmo payload + 2s de espera → COUNT = 1 |

Variáveis configuráveis:
- `API_URL` (default: `http://localhost:4000`)
- `DB_URL` (default: `postgresql://sentinel:sentinel@localhost:5432/cargo_sentinel`)

### README.md — Seções

- Stack com versões e justificativas
- Pré-requisitos de VPS (Ubuntu 22.04+, Docker 24+, portas 80/443)
- Passo a passo completo em 7 etapas: clone → .env → volumes → build → migrate+seed → verify → smoke test
- Tabela de variáveis obrigatórias com comandos de geração (`openssl rand`)
- Credenciais de demo do seed com aviso de troca imediata em produção
- Atualização de versão (git pull + build + up -d + migrate manual)
- Troubleshooting: Traefik, API fail-fast, Garage, Evolution API, BullMQ worker
- Desenvolvimento local com comandos pnpm e docker compose
- Diagrama ASCII de arquitetura (Traefik → Express/Garage/Next.js → PostgreSQL/Redis)

## Deviations from Plan

None — plan executed exactly as written.

## Threat Surface Scan

| Threat ID | Category | Status |
|-----------|----------|--------|
| T-07-16 | README com senhas de demo | Mitigado — aviso explícito "Trocar senhas imediatamente" na seção de credenciais |
| T-07-17 | smoke-test.sh com SQL direto | Aceito — script é ferramenta de ops; documentado que requer acesso ao DB |
| T-07-18 | Dados de smoke no banco | Mitigado — placa única por execução (SMOKE+timestamp), câmera com ON CONFLICT DO NOTHING, limpeza comentada disponível |

## Checkpoint

**Task 3** é um `checkpoint:human-verify` — aguardando verificação manual:

1. `bash -n scripts/smoke-test.sh && echo OK` → deve retornar `SYNTAX OK`
2. Com serviços rodando: `chmod +x scripts/smoke-test.sh && ./scripts/smoke-test.sh` → todas as 4 etapas com `[PASS]`
3. `README.md` contém seção "Deploy em Produção (Hostinger VPS)", tabela de variáveis, troubleshooting
4. Critérios finais da Phase 7 verificados manualmente (Super Admin Panel + smoke test)

## Self-Check: PASSED

- [x] `bash -n scripts/smoke-test.sh` retorna `SYNTAX OK`
- [x] `grep -c "Deploy em Produção" README.md` retorna `1`
- [x] README.md tem 275 linhas (> 50)
- [x] Commit 44d5b8d existe (Task 1)
- [x] Commit cac61c9 existe (Task 2)
- [x] Câmera de smoke usa `INSERT ON CONFLICT DO NOTHING` (idempotente)
- [x] Placa de teste usa timestamp (única por execução)
- [x] `set -euo pipefail` presente no script
- [x] Evolution API hardpinned em `2.3.7` documentado no README com aviso
