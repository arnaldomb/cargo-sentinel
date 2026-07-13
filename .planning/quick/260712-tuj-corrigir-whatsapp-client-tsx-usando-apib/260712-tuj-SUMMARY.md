---
phase: quick
plan: 260712-tuj
subsystem: whatsapp-tenant-ui
tags: [nextjs, bff-proxy, bugfix, production-bug]
requires: []
provides: [tela de WhatsApp do tenant chamando o proxy same-origin corretamente]
affects:
  - "apps/web/src/app/(admin)/configuracoes/whatsapp/whatsapp-client.tsx"
key-decisions:
  - "Bug pré-existente de produção (não introduzido nesta sessão) — NEXT_PUBLIC_API_BASE_URL é inlined no build do Next.js e sempre teve valor definido, então a tela de WhatsApp do tenant provavelmente nunca funcionou corretamente em produção."
duration: ~10min
completed: 2026-07-13
---

# Quick Task 260712-tuj: Corrigir whatsapp-client.tsx usando URL absoluta

## Accomplishments

- Removida a lógica de `apiBaseUrl`/`resolveApiBaseUrl`/`window.location` do componente `whatsapp-client.tsx`.
- Trocadas as 7 chamadas `fetch(\`${apiBaseUrl}/api/configuracoes-whatsapp-proxy...\`)` por fetch relativo simples (`/api/configuracoes-whatsapp-proxy...`), alinhado com o padrão usado em `usuarios-tab.tsx`, `empresa-detail-shell.tsx` e `whatsapp-provision-client.tsx`.
- `pnpm --filter @cargo-sentinel/web build` passa limpo.

## Task Commits

1. **Corrigir fetch relativo em whatsapp-client.tsx** - `6be2dc2` (fix)

## Context

Descoberto pelo usuário reportando que a tela de Configurações → WhatsApp do tenant sempre mostrava "Instância ainda não provisionada" mesmo após o super admin vincular a instância Z-API (confirmado via curl direto ao backend que a instância estava corretamente vinculada). Causa raiz: `resolveApiBaseUrl()` retorna `NEXT_PUBLIC_API_BASE_URL` (inlined no build, sempre definido tanto em dev quanto produção) em vez de deixar o fetch relativo bater no proxy Next.js same-origin — a rota BFF não existe no domínio da API Express, então a chamada falhava silenciosamente. Diferente dos bugs anteriores desta sessão (cookie de sessão, thumbnail proxy), este não é específico de dev local — é um bug real que provavelmente afeta produção também.
