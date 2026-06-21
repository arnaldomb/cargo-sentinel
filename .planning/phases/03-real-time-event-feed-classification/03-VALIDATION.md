---
phase: 03
slug: real-time-event-feed-classification
status: draft
nyquist_compliant: true
wave_0_complete: true
created: 2026-06-21
---

# Phase 03 — Validation Strategy

> Per-phase validation contract for live feed, classification, and tenant-safe realtime behavior.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Frameworks** | vitest for api/web unit+integration, browser validation for live sync |
| **Quick run command** | `pnpm --filter @cargo-sentinel/api test -- --run src/realtime src/routes` |
| **Frontend command** | `pnpm --filter @cargo-sentinel/web test -- --run` |
| **Full build check** | `pnpm build` |
| **Estimated runtime** | ~30 seconds automated + manual 2-browser pass |

---

## Sampling Rate

- **After every backend task:** run targeted api tests
- **After every frontend task:** run targeted web tests
- **After every plan:** run workspace build plus the focused phase suite
- **Before marking Phase 3 complete:** run two-browser manual sync test

---

## Per-Plan Verification Map

| Task ID | Plan | Requirement | Test Type | Automated Command | Status |
|---------|------|-------------|-----------|-------------------|--------|
| 03-01-01 | 01 | PLACA-01,02,03 | schema/unit | `pnpm --filter @cargo-sentinel/database exec prisma validate` | ⬜ pending |
| 03-01-02 | 01 | PLACA-04 | unit | `pnpm --filter @cargo-sentinel/api test -- --run src/jobs` | ⬜ pending |
| 03-01-03 | 01 | PLACA-07 | route/unit | `pnpm --filter @cargo-sentinel/api test -- --run src/routes/placas` | ⬜ pending |
| 03-02-01 | 02 | REALTIME-01,02 | integration | `pnpm --filter @cargo-sentinel/api test -- --run src/realtime` | ⬜ pending |
| 03-03-01 | 03 | REALTIME-03,05 | route/integration | `pnpm --filter @cargo-sentinel/api test -- --run src/routes/eventos` | ⬜ pending |
| 03-03-02 | 03 | REALTIME-07 | route/unit | `pnpm --filter @cargo-sentinel/api test -- --run src/routes/cameras` | ⬜ pending |
| 03-04-01 | 04 | REALTIME-04,06 | component | `pnpm --filter @cargo-sentinel/web test -- --run` | ⬜ pending |
| 03-04-02 | 04 | PLACA-05,06 | browser/manual | Browser + two sessions | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Evento novo aparece em até 2s em duas sessões | REALTIME-05 | Requer sockets reais e duas sessões simultâneas | Abrir duas janelas logadas na mesma empresa, injetar evento LPR, medir atualização do topo |
| Confirmação obrigatória para nível 4/5 | PLACA-06 | Fluxo de UX visual | Alterar classificação para `SUSPEITO` e `CRITICO`, confirmar modal antes de persistir |
| Auto-scroll pausa quando operador rola | REALTIME-06 | Depende de comportamento visual do feed | Descer o feed, gerar novos eventos, confirmar que a lista não reposiciona sozinha |
| Status de câmera reflete último evento | REALTIME-07 | Requer tempo e dados reais | Gerar evento de câmera A, verificar timestamp e badge `online`, aguardar janela e verificar `offline` |

---

## Phase Success Gate

- REST e Socket.IO usam DTOs compatíveis
- nenhuma emissão global cruza tenants
- novas placas entram como `VISITANTE`
- reclassificação cria trilha de auditoria
- duas sessões da mesma empresa convergem em até 2 segundos

---

## Validation Sign-Off

- [x] Todos os requisitos da fase têm pelo menos uma estratégia de verificação
- [x] Há mistura de verificação automatizada e manual
- [x] O risco principal de tenant leak está coberto
- [x] O gate final exige prova em duas sessões

**Approval:** pending
