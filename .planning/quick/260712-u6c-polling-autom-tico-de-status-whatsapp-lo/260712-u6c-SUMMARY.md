---
phase: quick
plan: 260712-u6c
subsystem: whatsapp-integration
tags: [nextjs, bullmq, observability, ux, bugfix]
requires: []
provides:
  - polling automático de status na tela WhatsApp do tenant
  - logs explícitos de skip no alert-worker (visibilidade de por que um alerta não foi enviado)
affects:
  - "apps/web/src/app/(admin)/configuracoes/whatsapp/whatsapp-client.tsx"
  - apps/api/src/jobs/alert-worker.ts
key-decisions:
  - "Investigação real via Redis (bull:alert-jobs) confirmou: o job do alerta SUSPEITO da placa AB12344 processou com sucesso no BullMQ, mas o envio Z-API foi silenciosamente pulado porque a instância ainda não estava CONECTADO no momento do evento — não era erro de código, era falta de visibilidade + timing (usuário ainda não tinha escaneado o QR)."
duration: ~20min
completed: 2026-07-13
---

# Quick Task 260712-u6c: Polling de status WhatsApp + logs de skip no alert-worker

## Accomplishments

- `alert-worker.ts`: bloco `alert:whatsapp` reestruturado com early returns logados para cada motivo de skip (config ausente, desativado, não conectado, credenciais ausentes, classificação fora do filtro, sem destino). 14/14 testes de `alert-worker.test.ts` passam sem alteração.
- `whatsapp-client.tsx`: novo `useEffect` com `setInterval` (4s) que faz polling silencioso de `/api/configuracoes-whatsapp-proxy/status` enquanto a instância está vinculada mas não `CONECTADO`, com cleanup via `clearInterval`. Indicador visual "Aguardando conexão... verificando automaticamente" adicionado.
- Ambos os builds (`api`, `web`) passam limpos.

## Task Commits

1. **Logs de skip no alert-worker** - `98f525c` (feat)
2. **Polling automático de status no whatsapp-client.tsx** - `245097e` (feat)

## Context

Reportado pelo usuário após testar o fluxo real: escaneou o QR e a tela "demorou para atualizar" (sem polling, exigia clique manual em "Verificar Status"), e uma mensagem de alerta SUSPEITO não chegou ao grupo. Investigação via `docker exec redis-cli` nas chaves `bull:alert-jobs:*` confirmou que o job processou com sucesso mas pulou o envio real por timing (instância ainda não conectada no momento do evento) — sem nenhum log explicando isso. Ambos os problemas corrigidos nesta tarefa; não houve bug de lógica no fluxo de envio em si.
