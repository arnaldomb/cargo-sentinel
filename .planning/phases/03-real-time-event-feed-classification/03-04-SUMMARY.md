---
phase: 03
plan: 04
title: Dashboard Operacional + Classificação Inline
status: complete
completed: 2026-06-21
duration_minutes: 45
tasks_completed: 6
tasks_total: 6
files_created: 10
files_modified: 4
commits:
  - 5aa643d
  - 8b41bbe
  - e97c6d1
  - 6d4a593
subsystem: web
tags:
  - dashboard
  - realtime
  - tailwind
  - socket.io
  - classification
  - testing
dependency_graph:
  requires:
    - 03-03-PLAN.md
  provides:
    - dashboard operacional autenticado
    - feed ao vivo com classificação inline
    - confirmação modal para níveis críticos
  affects:
    - apps/web/src/app/
    - apps/web/src/components/
    - apps/web/src/lib/
tech_stack:
  added:
    - tailwindcss@^3.4 (Tailwind CSS v3 — estilo principal)
    - postcss + autoprefixer (pipeline de CSS)
    - @testing-library/react (testes de componente)
    - @testing-library/user-event (interações de usuário em testes)
    - @testing-library/jest-dom (matchers DOM)
    - jsdom (ambiente de testes de componente)
  patterns:
    - vitest projects split: node (lib utils) + jsdom (componentes React)
    - ClassificationBadge: componente puro, estilo por enum via Tailwind
    - ClassificationPopover: close em Escape + clique externo via useEffect
    - CriticalConfirmDialog: modal com foco gerenciado e impacto operacional explícito
    - auto-scroll com ref pinnedToTop: pausa quando usuário desce feed
key_files:
  created:
    - apps/web/tailwind.config.ts
    - apps/web/postcss.config.js
    - apps/web/src/app/globals.css
    - apps/web/src/components/classification-badge.tsx
    - apps/web/src/components/classification-popover.tsx
    - apps/web/src/components/critical-confirm-dialog.tsx
    - apps/web/src/components/classification-badge.test.tsx
    - apps/web/src/components/classification-popover.test.tsx
    - apps/web/src/components/critical-confirm-dialog.test.tsx
    - apps/web/src/test-setup.ts
  modified:
    - apps/web/src/app/layout.tsx (importar globals.css)
    - apps/web/src/app/page.tsx (app shell com Tailwind e brand colors)
    - apps/web/src/components/dashboard-client.tsx (Tailwind, componentes extraídos)
    - apps/web/src/lib/dashboard.ts (getClassificationTailwindClasses, getClassificationLabel, paleta corrigida)
    - apps/web/src/lib/dashboard.test.ts (atualizar cores para nova paleta)
    - apps/web/vitest.config.ts (projetos node + jsdom)
decisions:
  - "Tailwind instalado como devDep no app web — sem Tailwind no root workspace (correto para monorepo)"
  - "vitest.projects (v4 API) com dois ambientes: node para utils, jsdom para componentes React"
  - "SUSPEITO=orange (#f97316), CRITICO=red (#b91c1c) — corrigido vs implementação anterior (ambos eram variantes de vermelho)"
  - "CriticalConfirmDialog em vez de window.confirm — modal com contexto de impacto operacional"
  - "getClassificationColor mantido para border-left inline (não mapeável por classe Tailwind dinâmica)"
metrics:
  duration_minutes: 45
  completed: 2026-06-21
---

# Phase 03 Plan 04: Dashboard Operacional + Classificação Inline — Summary

**One-liner:** Dashboard autenticado com sidebar de câmeras, feed Socket.IO ao vivo, badges coloridas por enum (verde→vermelho), popover inline de reclassificação e modal de confirmação para SUSPEITO/CRITICO usando Tailwind v3 com brand colors ggtech.

## Tasks Completed

| # | Task | Commit | Files |
|---|------|--------|-------|
| 1 | App shell autenticado com Tailwind + brand colors | 5aa643d, 8b41bbe | layout.tsx, page.tsx, globals.css, tailwind.config.ts, postcss.config.js |
| 2 | Clientes REST + Socket.IO no dashboard-client | 8b41bbe | dashboard-client.tsx, dashboard.ts |
| 3 | Componentes do feed (Badge, Popover, EventRow) | e97c6d1 | classification-badge.tsx, classification-popover.tsx, critical-confirm-dialog.tsx |
| 4 | Auto-scroll controlado com affordance | 8b41bbe | dashboard-client.tsx (pinnedToTopRef) |
| 5 | Confirmação modal para SUSPEITO e CRITICO | e97c6d1 | critical-confirm-dialog.tsx |
| 6 | Testes de componentes (28 testes totais) | 6d4a593 | *.test.tsx, vitest.config.ts, test-setup.ts |

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Tailwind não estava instalado no app web**
- **Found during:** Task 1
- **Issue:** O login page usava classes Tailwind mas o pacote não estava instalado — classes eram ignoradas. A instrução `CLAUDE.md` e as critical rules do plano exigem Tailwind para todo estilo.
- **Fix:** `pnpm --filter @cargo-sentinel/web add -D tailwindcss@^3.4 postcss autoprefixer` + `tailwind.config.ts` + `postcss.config.js` + `globals.css`
- **Files modified:** apps/web/package.json, pnpm-lock.yaml, + arquivos de config novos
- **Commit:** 5aa643d

**2. [Rule 1 - Bug] Paleta de cores inconsistente com o spec do plano**
- **Found during:** Task 3
- **Issue:** Implementação anterior usava `#dc2626` (vermelho) para SUSPEITO e `#7f1d1d` (vermelho escuro) para CRITICO. O plano especifica SUSPEITO=orange, CRITICO=red.
- **Fix:** `getClassificationColor` atualizado: SUSPEITO→`#f97316` (orange), CRITICO→`#b91c1c` (red-700). `dashboard.test.ts` atualizado para nova paleta.
- **Files modified:** apps/web/src/lib/dashboard.ts, apps/web/src/lib/dashboard.test.ts
- **Commit:** 8b41bbe

**3. [Rule 1 - Bug] `vitest.workspace` removido no Vitest 4 — erro de startup**
- **Found during:** Task 6
- **Issue:** A opção `test.workspace` foi removida no Vitest 4. Ao tentar usar projetos separados (node + jsdom) com essa API, o runner falhava na inicialização.
- **Fix:** Migrado para `test.projects` (nova API do Vitest 4).
- **Files modified:** apps/web/vitest.config.ts
- **Commit:** 6d4a593

**4. [Rule 2 - Missing] `window.confirm` substituído por modal próprio**
- **Found during:** Task 5
- **Issue:** A implementação anterior usava `window.confirm` para confirmação de SUSPEITO/CRITICO — sem contexto de impacto operacional, sem acessibilidade, bloqueante para testes.
- **Fix:** Criado `CriticalConfirmDialog` com modal próprio, mensagem de impacto, foco gerenciado e close via Escape.
- **Files modified:** apps/web/src/components/critical-confirm-dialog.tsx, dashboard-client.tsx
- **Commit:** e97c6d1

## Known Stubs

- **Thumbnail:** Quando `thumbnailUrl` é null, exibe texto "Sem foto" — placeholder intencional enquanto integração com Garage S3 não está implementada (prevista em fase posterior).

## Verification

```
pnpm --filter @cargo-sentinel/web exec vitest run
# Test Files  5 passed (5)
# Tests  28 passed (28)

pnpm --filter @cargo-sentinel/web build
# ✓ Compiled successfully
# Route / — 16.4 kB | First Load JS 119 kB
```

## Self-Check

### Files exist:
- apps/web/tailwind.config.ts — FOUND
- apps/web/postcss.config.js — FOUND
- apps/web/src/app/globals.css — FOUND
- apps/web/src/components/classification-badge.tsx — FOUND
- apps/web/src/components/classification-popover.tsx — FOUND
- apps/web/src/components/critical-confirm-dialog.tsx — FOUND

### Commits exist:
- 5aa643d — FOUND
- 8b41bbe — FOUND
- e97c6d1 — FOUND
- 6d4a593 — FOUND

## Self-Check: PASSED
