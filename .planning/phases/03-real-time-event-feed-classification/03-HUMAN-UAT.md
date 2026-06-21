---
status: planned
phase: 03-real-time-event-feed-classification
updated: 2026-06-21
---

# Phase 03 — Human UAT

## Objetivo

Validar o fluxo operacional real da Fase 3 com duas sessões do mesmo tenant, confirmando feed ao vivo, classificação inline e status de câmera.

## Pré-requisitos

- stack Docker local rodando
- seed aplicado
- duas janelas autenticadas como usuários da mesma empresa
- ao menos uma câmera cadastrada e apta a gerar evento LPR

## Cenários

### 1. Primeiro evento de placa nova

- gerar um evento LPR para uma placa nunca vista
- confirmar que ela aparece no topo do feed
- confirmar badge `Visitante`

### 2. Reclassificação inline

- na janela A, abrir o seletor inline da placa
- mudar para `Atenção`
- confirmar atualização imediata da própria linha
- confirmar refletiu na janela B em até 2 segundos

### 3. Escalada para nível crítico

- na janela A, alterar a mesma placa para `Suspeito`
- confirmar que a UI exige confirmação explícita
- repetir para `Crítico`

### 4. Auto-scroll

- na janela B, rolar o feed para baixo
- gerar novos eventos
- confirmar que a tela não reposiciona automaticamente
- confirmar que existe affordance para voltar ao topo

### 5. Status da câmera

- identificar a câmera que acabou de emitir evento
- confirmar `online` e timestamp coerente
- após a janela de expiração configurada, confirmar transição para `offline`

## Resultado Esperado

- operador vê novos eventos sem reload
- classificação é aplicada sem sair da página
- confirmação existe para níveis 4 e 5
- duas sessões da mesma empresa convergem rapidamente
- status de câmera acompanha o último evento observado
