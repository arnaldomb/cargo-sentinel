---
phase: 03-real-time-event-feed-classification
reviewed: pending
depth: planned
files_reviewed: 0
status: not_started
---

# Phase 03: Code Review Plan

## Review Focus

- isolamento de tenant no Socket.IO
- ausência de `io.emit()` global
- integridade do modelo `Placa` e da trilha de auditoria
- custo das queries do feed e do status de câmera
- consistência entre DTO REST e payload Socket.IO
- UX de confirmação para níveis 4 e 5

## Must Check

1. Nenhuma emissão realtime usa tenant vindo do cliente.
2. Nenhuma query do feed cruza `empresaId`.
3. Worker LPR e mutation de classificação concordam sobre a fonte de verdade da classificação.
4. O feed não depende de full-table scan para carregar os últimos eventos.
5. O frontend não perde eventos ao abrir duas sessões na mesma empresa.

## Initial Risks

- vazamento cross-tenant por room incorreta ou broadcast global
- auditoria incompleta em mudança de classificação
- divergência entre estado REST inicial e estado recebido por socket
- cálculo ingênuo de status de câmera com consulta cara demais
