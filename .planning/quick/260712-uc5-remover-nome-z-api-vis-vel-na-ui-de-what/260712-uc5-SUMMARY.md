---
phase: quick
plan: 260712-uc5
subsystem: whatsapp-integration-ui
tags: [nextjs, branding, ux]
requires: []
provides: [UI de WhatsApp sem mencionar o nome do provedor]
affects:
  - "apps/web/src/app/(admin)/configuracoes/whatsapp/*"
  - "apps/web/src/app/(superadmin)/admin/empresas/[id]/whatsapp/*"
duration: ~5min
completed: 2026-07-13
---

# Quick Task 260712-uc5: Remover nome "Z-API" da UI

## Accomplishments

- Removidas todas as 12 ocorrências de "Z-API" em textos visíveis (títulos, descrições, confirmações, labels) nas telas de WhatsApp do tenant e do superadmin.
- Código interno (zapi.service.ts, ZAPI_CLIENT_TOKEN, rotas, nomes de arquivo) mantido sem alteração.
- `pnpm --filter @cargo-sentinel/web build` passa.

## Task Commits

1. **Remover "Z-API" das strings de UI** - `fe9418e` (fix)

## Context

Solicitado pelo usuário ao revisar a tela de configuração de WhatsApp — não quer o nome do provedor de integração exposto na interface.
