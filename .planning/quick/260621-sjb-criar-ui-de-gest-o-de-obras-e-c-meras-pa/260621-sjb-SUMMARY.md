---
phase: quick-260621-sjb
plan: "01"
subsystem: web-frontend
tags: [gestao, obras, cameras, proxy, server-actions, sidebar]
dependency_graph:
  requires: []
  provides: [gestao-ui, obras-crud, cameras-crud]
  affects: [sidebar, obras-proxy]
tech_stack:
  added: []
  patterns:
    - Server Component + fetch direto (mesmo padrão buscar/page.tsx)
    - Proxy Next.js encaminhando cookies para Express API
    - useActionState com Server Actions para formulários
    - Client Components isolados para delete com confirm()
key_files:
  created:
    - apps/web/src/app/api/obras-proxy/route.ts
    - apps/web/src/app/api/obras-proxy/[id]/route.ts
    - apps/web/src/app/api/obras-proxy/[id]/cameras/route.ts
    - apps/web/src/app/api/obras-proxy/[id]/cameras/[cameraId]/route.ts
    - apps/web/src/app/(admin)/gestao/actions.ts
    - apps/web/src/app/(admin)/gestao/page.tsx
    - apps/web/src/app/(admin)/gestao/nova-obra-form.tsx
    - apps/web/src/app/(admin)/gestao/delete-obra-button.tsx
    - apps/web/src/app/(admin)/gestao/obras/nova/page.tsx
    - apps/web/src/app/(admin)/gestao/obras/[id]/page.tsx
    - apps/web/src/app/(admin)/gestao/obras/[id]/delete-camera-button.tsx
    - apps/web/src/app/(admin)/gestao/obras/[id]/cameras/nova-camera-form.tsx
    - apps/web/src/app/(admin)/gestao/obras/[id]/cameras/nova/page.tsx
  modified:
    - apps/web/src/components/sidebar.tsx
decisions:
  - "Proxies em [id]/ (não [obraId]/) para gestão — evita conflito com rota existente [obraId]/cameras"
  - "Páginas de detalhe buscam GET /api/obras (lista) e filtram pelo id — Express não tem GET /obras/:id individual"
  - "Server Actions chamam API Express diretamente (não passam pelo proxy Next.js) — padrão mais simples para actions"
metrics:
  duration: "~20 min"
  completed_date: "2026-06-21"
  tasks_completed: 3
  tasks_total: 4
  files_created: 13
  files_modified: 1
---

# Quick Task 260621-sjb: UI de Gestão de Obras e Câmeras — Summary

**One-liner:** UI completa de gestão CRUD para obras e câmeras LPR via 4 proxies Next.js, Server Actions, páginas Server Component com auth guard ADMIN_EMPRESA e link na sidebar.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Criar proxies Next.js para obras e câmeras | 37fbe1f | 4 rotas proxy criadas |
| 2 | Server Actions e páginas de gestão | ee34204 | actions.ts, gestao/page.tsx, formulários |
| 3 | Página detalhe obra + delete buttons + sidebar | 4869010 | obras/[id]/page.tsx, 2 delete buttons, sidebar |
| 4 | checkpoint:human-verify | — | Aguardando verificação humana |

## What Was Built

### Proxies Next.js (Task 1)
- `GET + POST /api/obras-proxy` — lista e cria obras
- `PUT + DELETE /api/obras-proxy/[id]` — atualiza e soft-delete obra
- `GET + POST /api/obras-proxy/[id]/cameras` — lista e cria câmeras
- `PUT + DELETE /api/obras-proxy/[id]/cameras/[cameraId]` — atualiza e soft-delete câmera

Todos os proxies encaminham cookies via `cookieStore.toString()` e propagam status HTTP upstream sem try/catch extra.

### Server Actions e Páginas (Task 2)
- `actions.ts`: `criarObra` e `criarCamera` como Server Actions com `'use server'`, chamam Express diretamente com cookie forwarding
- `gestao/page.tsx`: Server Component com auth guard ADMIN_EMPRESA, lista obras ativas com `_count?.cameras`, tabela com `hover:bg-slate-50`
- `nova-obra-form.tsx`: Client Component com `useActionState(criarObra, null)` — campos nome (required) e endereco (optional)
- `obras/nova/page.tsx`: página com auth guard que renderiza `NovaObraForm`
- `cameras/nova-camera-form.tsx`: Client Component com `useActionState(criarCamera.bind(null, obraId), null)` — campos codigoLpr (required) e ip (optional)
- `obras/[id]/cameras/nova/page.tsx`: página com auth guard que renderiza `NovaCameraForm`

### Detalhe + Delete + Sidebar (Task 3)
- `obras/[id]/page.tsx`: busca lista de obras e filtra por id (workaround — Express sem GET /obras/:id), busca câmeras, tabela com status badges (verde/cinza), importa `DeleteObraButton` e `DeleteCameraButton`
- `delete-obra-button.tsx`: `'use client'`, fetch DELETE com confirm(), redirect para /gestao em sucesso
- `delete-camera-button.tsx`: `'use client'`, fetch DELETE com confirm(), router.refresh() em sucesso
- `sidebar.tsx`: adicionado import `Settings` de lucide-react, link "Gestão" visível apenas para `userRole === 'ADMIN_EMPRESA'`, posicionado antes de "Alertas WhatsApp"

## Deviations from Plan

None — plan executed exactly as written. Paths de import corrigidos durante execução (TypeScript confirmou antes do commit).

## Known Stubs

None — todos os campos exibidos buscam dados reais da API Express. `_count?.cameras` pode retornar `—` se a API não incluir `_count` na resposta, mas isso é comportamento defensivo correto, não stub.

## Threat Surface Scan

Nenhuma nova superfície além do especificado no `<threat_model>` do plano. Os auth guards (`if role !== 'ADMIN_EMPRESA' redirect('/')`) estão presentes em todas as 4 páginas Server Component (T-sjb-01 mitigado). Proxies encaminham cookies reais — Express valida JWT e empresaId (T-sjb-02 mitigado).

## Self-Check: PASSED

- 13 arquivos criados: todos encontrados em disco
- 1 arquivo modificado (sidebar.tsx): confirmado
- 3 commits verificados: 37fbe1f, ee34204, 4869010
