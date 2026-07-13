---
phase: quick
plan: 260712-udi
subsystem: whatsapp-integration
tags: [zapi, alertas, imagens]
requires:
  - phase: quick-260712-o0s
    provides: cliente Z-API (zapi.service.ts), alert-worker Z-API-only
provides:
  - sendWhatsAppImage() no cliente Z-API
  - alertas WhatsApp com foto do evento anexada
affects:
  - apps/api/src/jobs/worker.ts
  - apps/api/src/jobs/alert-worker.ts
key-decisions:
  - "Imagem enviada como base64 inline (data URI), não como URL pública presignada do Garage — evita depender de GARAGE_SERVER_URL/rede pública, que já se mostrou frágil em dev nesta sessão. ImageBase64 já está disponível no payload do webhook LPR antes do upload pro Garage."
duration: ~15min
completed: 2026-07-13
---

# Quick Task 260712-udi: Enviar foto do evento no alerta WhatsApp

## Accomplishments

- `zapi.service.ts`: nova função `sendWhatsAppImage(cfg, to, imageDataUri, caption?)` via `POST /send-image` (mesmo padrão de `sendWhatsAppText`).
- `WhatsAppAlertPayload` ganhou campo opcional `fotoBase64`; `worker.ts` preenche com `data:image/jpeg;base64,${ImageBase64}` (buffer já disponível antes do upload pro Garage, evitando dependência de URL pública).
- `alert-worker.ts`: envio usa `sendWhatsAppImage` (mensagem como legenda) quando `fotoBase64` presente; mantém `sendWhatsAppText` como fallback sem foto.
- Teste novo cobrindo o caminho com foto (`sendWhatsAppImage` chamado 2x — destino e grupo — com o data URI e a legenda corretos); 14 testes existentes preservados (15/15 total).
- `pnpm --filter @cargo-sentinel/api build` passa.

## Task Commits

1. **sendWhatsAppImage + fotoBase64 + envio condicional** - `a4786cb` (feat)

## Context

Solicitado pelo usuário referenciando a documentação pública da Z-API no Postman/developer.z-api.io para o endpoint de envio de imagem. Decisão de usar base64 inline em vez de URL presignada do Garage foi motivada pelos múltiplos bugs de configuração de rede pública (URL de produção vazando pra dev) já corrigidos nesta mesma sessão — base64 inline não depende de nenhuma URL pública alcançável pela Z-API.
