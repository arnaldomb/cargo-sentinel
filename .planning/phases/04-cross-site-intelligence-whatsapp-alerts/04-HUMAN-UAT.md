---
status: partial
phase: 04-cross-site-intelligence-whatsapp-alerts
source: [04-VERIFICATION.md]
started: 2026-06-21T14:30:00.000Z
updated: 2026-06-21T14:30:00.000Z
---

## Current Test

[aguardando teste humano]

## Tests

### 1. Fluxo end-to-end cross-site

expected: Placa classificada como SUSPEITO na Obra A → câmera em Obra B lê a mesma placa → overlay full-screen aparece no dashboard em <2s → mensagem WhatsApp chega no número configurado em <10s.
result: [pending]

### 2. Deduplicação WhatsApp

expected: Mesma placa lida duas vezes em <5 minutos (SUSPEITO) → apenas 1 mensagem WhatsApp enviada. Segunda leitura não gera nova mensagem.
result: [pending]

### 3. CRUD admin de números WhatsApp

expected: Admin acessa /configuracoes/alertas → seleciona obra → adiciona número E.164 (+5511999999999) → número aparece na lista → botão remover apaga o número. Número inválido (sem +) mostra erro de validação.
result: [pending]

### 4. Proteção de rota por role

expected: Usuário com role OPERADOR ao tentar acessar /configuracoes/alertas é redirecionado para / sem ver o conteúdo da página.
result: [pending]

## Summary

total: 4
passed: 0
issues: 0
pending: 4
skipped: 0
blocked: 0

## Gaps
