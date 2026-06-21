# Roadmap: Cargo Sentinel

## Overview

Cargo Sentinel is built in 7 phases (plus a decimal polish phase) that follow a strict dependency order: the monorepo
scaffold and LPR ingestion pipeline come first (Phase 1), then multi-tenant auth unlocks
all tenant-scoped work (Phase 2), then the real-time operator UI (Phase 3), then
UI/design polish to brand standards (Phase 3.5), then cross-site intelligence and
WhatsApp alerts (Phase 4), then plate history (Phase 5), then async reports (Phase 6),
and finally the Super Admin panel and production deploy (Phase 7). Every phase closes
with something a human can verify in a browser or terminal.

## Phases

**Phase Numbering:**
- Integer phases (1-7): Planned milestone work for v1
- Decimal phases (e.g., 2.1): Urgent insertions via /gsd-insert-phase

- [x] **Phase 1: Monorepo + LPR Ingestion + Storage** - Foundation scaffold, camera webhook, Garage image storage
- [x] **Phase 2: Auth + Multi-Tenant Hierarchy** - JWT auth with 3 roles and full Empresa > Obra > Camera data model
- [x] **Phase 3: Real-Time Event Feed + Vehicle Classification** - Live operator dashboard and 5-level plate classification (completed 2026-06-21)
- [x] **Phase 3.5: UI Design Polish — Identidade Visual ggtech** - Apply ggtech brand colors, typography, and consistent component library across all screens (completed 2026-06-21)
- [x] **Phase 4: Cross-Site Intelligence + WhatsApp Alerts** - Multi-site threat correlation and async WhatsApp notifications (completed 2026-06-21)
- [x] **Phase 5: Plate History + Profile** - Full plate timeline, cross-site search, and audit trail (completed 2026-06-21)
- [ ] **Phase 6: Reports PDF + Excel with Photos** - Async filtered reports with embedded thumbnails
- [ ] **Phase 7: Super Admin Panel + Production Deploy** - Tenant management and Hostinger VPS launch

## Phase Details

### Phase 1: Monorepo + LPR Ingestion + Storage
**Goal**: The project builds, Docker Compose runs all services, and the system can receive a real Intelbras camera webhook, store the photo in Garage, and persist the event record in Postgres — with idempotency and async processing.
**Depends on**: Nothing (first phase)
**Requirements**: INFRA-01, INFRA-02, INFRA-03, INFRA-04, INFRA-05, LPR-01, LPR-02, LPR-03, LPR-04, LPR-05, STORAGE-01, STORAGE-02, STORAGE-03
**Success Criteria** (what must be TRUE):
  1. `pnpm build` succeeds across all workspaces (web, api, packages/database, packages/shared, packages/ui)
  2. `docker compose up` starts all 6 services (web, api, postgres, garage, redis, traefik) with no errors
  3. A POST to `/api/lpr/NotificationInfo/vehicle` with a sample Intelbras payload returns HTTP 200 immediately and the event appears in Postgres within 3 seconds
  4. The same payload sent twice results in exactly 1 event row (idempotency via SHA256 key)
  5. `createTenantClient(prisma, empresaId)` is exported from packages/database and callable in a unit test
**Plans**: 4 plans
Plans:
- [x] 01-01-PLAN.md — Turborepo + pnpm monorepo scaffold (5 workspaces, pnpm build green) [INFRA-01]
- [x] 01-02-PLAN.md — Prisma schema + createTenantClient + schema push to Postgres [INFRA-02]
- [x] 01-03-PLAN.md — Docker Compose (6 services) + Garage + Traefik routing + acme.json [INFRA-03, INFRA-04, INFRA-05, STORAGE-01]
- [x] 01-04-PLAN.md — LPR webhook + BullMQ async worker + Garage upload + presigned URLs [LPR-01..05, STORAGE-02, STORAGE-03]

### Phase 2: Auth + Multi-Tenant Hierarchy
**Goal**: Users can authenticate, and every API call is scoped to the correct tenant via the JWT-injected tenant client — with the full Empresa > Obra > Camera hierarchy manageable by the right role.
**Depends on**: Phase 1
**Requirements**: AUTH-01, AUTH-02, AUTH-03, AUTH-04, AUTH-05, AUTH-06, TENANT-01, TENANT-02, TENANT-03, TENANT-04, TENANT-05, TENANT-06
**Success Criteria** (what must be TRUE):
  1. An Admin Empresa can log in with email/password and receive a JWT containing empresaId, role, and expiry
  2. An authenticated Admin can create an Obra and assign a Camera — and neither appears in another tenant's API responses
  3. An Operador token grants read-only access to obras/cameras of their empresa and is rejected by admin-only endpoints
  4. A Super Admin JWT carries `empresaId: null` and can query any tenant without error
  5. After logout, the refresh token cookie is cleared and previously issued tokens cannot refresh
**Plans**: 4 plans
Plans:
- [x] 02-01-PLAN.md — User model + Role enum + seed demo users [AUTH-03, TENANT-01..04]
- [x] 02-02-PLAN.md — Auth.js v5 login/logout + JWT claims [AUTH-01, AUTH-02, AUTH-04, AUTH-06]
- [x] 02-03-PLAN.md — Express auth/tenant/RBAC middleware [AUTH-05, AUTH-03, TENANT-06]
- [x] 02-04-PLAN.md — CRUD Obras/Câmeras com isolamento de tenant [TENANT-05, TENANT-06]

### Phase 3: Real-Time Event Feed + Vehicle Classification
**Goal**: Operators see a live feed of all LPR events for their empresa with color-coded classification, can classify a plate in one click from the feed, and the classification change is reflected instantly for all connected users of that tenant.
**Depends on**: Phase 2
**Requirements**: PLACA-01, PLACA-02, PLACA-03, PLACA-04, PLACA-05, PLACA-06, PLACA-07, REALTIME-01, REALTIME-02, REALTIME-03, REALTIME-04, REALTIME-05, REALTIME-06, REALTIME-07
**Success Criteria** (what must be TRUE):
  1. New LPR events appear in the operator's browser feed within 2 seconds, color-coded by classification level (green to red), without a page reload
  2. An unknown plate detected for the first time automatically shows as Visitante (level 2) in the feed
  3. Operator can open an inline popover on any feed row and change classification with one click — confirmation dialog appears for levels 4 and 5
  4. After classifying a plate, the change is visible to a second browser window logged in as the same tenant within 2 seconds
  5. Each camera in the sidebar shows online/offline status with timestamp of last received event
**Plans**: 4 plans
Plans:
- [x] 03-01-PLAN.md — `Placa` + auditoria + endpoint de reclassificação [PLACA-01, PLACA-02, PLACA-03, PLACA-04, PLACA-07]
- [x] 03-02-PLAN.md — Socket.IO + auth JWE + rooms por tenant [REALTIME-01, REALTIME-02]
- [x] 03-03-PLAN.md — Feed REST + status de câmeras + emissão realtime [REALTIME-03, REALTIME-05, REALTIME-07]
- [x] 03-04-PLAN.md — Dashboard web + classificação inline + confirmação crítica [PLACA-05, PLACA-06, REALTIME-04, REALTIME-06]
**UI hint**: yes

### Phase 3.5: UI Design Polish — Identidade Visual ggtech
**Goal**: Apply the ggtech/opencheck visual identity consistently across all existing screens: dark-blue sidebar (#003366), primary action buttons (#0056b3), secondary accent (#007bff), Roboto for body text and Open Sans for headings via `next/font`, consistent button/input/card/badge sizing, and a fixed sidebar layout that collapses on mobile.
**Depends on**: Phase 3
**Requirements**: UI-01, UI-02, UI-03, UI-04, UI-05
**Success Criteria** (what must be TRUE):
  1. Sidebar background is `#003366` with white text; active nav item highlighted with `#0056b3`
  2. All primary action buttons use `#0056b3` fill with white text; secondary actions use `#007bff` outline variant
  3. Body text renders in Roboto, section headings in Open Sans — both loaded via `next/font/google` (no FOUT)
  4. Dashboard is usable on 375px viewport: sidebar collapses to icon rail or hamburger, feed remains scrollable
  5. Classification badge colors match spec: Liberado=green, Visitante=gray, Atenção=yellow, Suspeito=orange, Crítico=red
**Plans**: 3 plans
Plans:
- [x] 03.5-01-PLAN.md — Design tokens + typography: next/font/google para Roboto + Open Sans, variáveis CSS no layout raiz [UI-02, UI-03]
- [x] 03.5-02-PLAN.md — Sidebar responsiva + layout wrapper: drawer mobile com hamburger, colapso em lg, sem overflow-x [UI-01, UI-05]
- [x] 03.5-03-PLAN.md — Component polish: cores de badge corrigidas (spec UI-04), botões e inputs de login com tokens Tailwind [UI-02, UI-04]
**UI hint**: yes

### Phase 4: Cross-Site Intelligence + WhatsApp Alerts
**Goal**: When a plate classified as Suspeito or Critico is detected at any obra of the empresa, a full-screen alert fires in the operator dashboard and a WhatsApp message is sent to the configured numbers — with deduplication preventing spam.
**Depends on**: Phase 3
**Requirements**: INTEL-01, INTEL-02, INTEL-03, INTEL-04, INTEL-05, ALERTS-01, ALERTS-02, ALERTS-03, ALERTS-04, ALERTS-05, ALERTS-06
**Success Criteria** (what must be TRUE):
  1. A plate classified as Suspeito in Obra A, when detected by a camera in Obra B, triggers a cross-site alert message in the feed of all operators of that empresa
  2. The cross-site alert overlay displays: plate number, classification level, detected obra, and the obra where it was originally classified
  3. A WhatsApp message is delivered to the admin-configured number within 10 seconds of a level 4 or 5 detection
  4. Sending the same plate twice within 5 minutes results in exactly 1 WhatsApp message (deduplication window enforced)
  5. Admin can add/remove WhatsApp numbers per obra from the management UI
**Plans**: 4 plans
Plans:
- [x] 04-01-PLAN.md — Schema (ConfiguracaoAlerta + obraClassificacaoId) + Evolution API v2.3.7 + WhatsApp service [INTEL-01, INTEL-02, ALERTS-01, ALERTS-06]
- [x] 04-02-PLAN.md — Cross-site detection em worker.ts + BullMQ alert queue + alert-worker.ts com dedup Redis [INTEL-01, INTEL-02, ALERTS-02, ALERTS-03, ALERTS-04, ALERTS-05]
- [x] 04-03-PLAN.md — Socket.IO emitAlertaCrossSite + CrossSiteAlertDTO em dto.ts [INTEL-03, INTEL-04, ALERTS-02]
- [x] 04-04-PLAN.md — Overlay full-screen no dashboard + admin UI para configuração de números WhatsApp [INTEL-03, INTEL-05, ALERTS-06]
**UI hint**: yes

### Phase 5: Plate History + Profile
**Goal**: Any operator can look up any plate and see its complete detection history across all obras of their empresa — with a full classification audit trail and cursor-based pagination that does not degrade on large datasets.
**Depends on**: Phase 4
**Requirements**: HISTORY-01, HISTORY-02, HISTORY-03, HISTORY-04
**Success Criteria** (what must be TRUE):
  1. Clicking a plate number from the live feed opens a profile page listing every detection across all obras, with obra name, camera, timestamp, direction, and thumbnail
  2. The classification timeline shows every level change with the user who made it and the exact timestamp
  3. Searching by plate number, date range, obra, or camera returns filtered results with no full-table scan (cursor pagination)
  4. A plate with 10,000+ events paginates without timeout or memory error
**Plans**: 3 plans
Plans:
- [x] 05-01-PLAN.md — Backend Plate Profile API: índice composto + GET /placas/:numero/historico + GET /placas/:numero/classificacoes + GET /eventos/buscar [HISTORY-01, HISTORY-02, HISTORY-03, HISTORY-04]
- [x] 05-02-PLAN.md — Página de perfil de placa /placas/[numero]: detecções paginadas + audit trail de classificações + link no feed [HISTORY-01, HISTORY-02]
- [x] 05-03-PLAN.md — Página de busca /buscar: formulário cross-filter + tabela cursor-paginada + dropdown dinâmico de câmeras [HISTORY-03, HISTORY-04]

### Phase 6: Reports PDF + Excel with Photos
**Goal**: Operators and admins can request a filtered report, continue working while it generates asynchronously, and receive a browser notification when the download link is ready — with photos embedded in both PDF and Excel formats.
**Depends on**: Phase 5
**Requirements**: REPORTS-01, REPORTS-02, REPORTS-03, REPORTS-04, REPORTS-05, REPORTS-06, REPORTS-07
**Success Criteria** (what must be TRUE):
  1. Requesting a report returns immediately (no spinner blocking the UI) and a WebSocket notification appears in the browser when the file is ready
  2. The PDF report includes one row per event with an embedded thumbnail, a header showing active filters, and classification color coding
  3. The Excel report includes plate images embedded in cells, with rows color-formatted by classification level (green to red)
  4. Applying filters (date range, obra, camera, classification, plate) correctly limits report contents
  5. Reports capped at 1,000 events and the download link expires after 1 hour
**Plans**: 4 plans
Plans:
- [ ] 06-01-PLAN.md — Schema Relatorio + BullMQ reportQueue + worker stub [REPORTS-01]
- [ ] 06-02-PLAN.md — Worker completo: generatePDF (pdfkit) + generateXLSX (exceljs) + Garage upload + Socket.IO report:pronto [REPORTS-02, REPORTS-03, REPORTS-05, REPORTS-06, REPORTS-07]
- [ ] 06-03-PLAN.md — REST API: POST /api/relatorios (202 async), GET list, GET/:id/download [REPORTS-01, REPORTS-04, REPORTS-05, REPORTS-07]
- [ ] 06-04-PLAN.md — Frontend: /relatorios page, ReportForm com filtros, ReportList com Socket.IO, link na sidebar [REPORTS-01, REPORTS-04, REPORTS-06, REPORTS-07]

### Phase 7: Super Admin Panel + Production Deploy
**Goal**: The Super Admin can manage all tenants from a dedicated panel, and the full application is running on the Hostinger VPS under Traefik with HTTPS — accessible at its production domain.
**Depends on**: Phase 6
**Requirements**: SADMIN-01, SADMIN-02, SADMIN-03, SADMIN-04, SADMIN-05
**Success Criteria** (what must be TRUE):
  1. Super Admin dashboard lists all empresas with their status, obra count, camera count, and event count
  2. Super Admin can create a new empresa and its initial Admin Empresa user in one form — the new tenant can immediately log in
  3. Super Admin can suspend an empresa — all logins for that tenant are rejected until reactivated
  4. Super Admin can generate an impersonation token and act as any tenant for support purposes
  5. Production URL responds with HTTPS (Let's Encrypt certificate), all 6 services healthy, and a real Intelbras camera payload round-trips end-to-end
**Plans**: TBD
**UI hint**: yes

## Progress

**Execution Order:**
Phases execute in numeric order: 1 → 2 → 3 → 3.5 → 4 → 5 → 6 → 7

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Monorepo + LPR Ingestion + Storage | 4/4 | Complete | 2026-06-20 |
| 2. Auth + Multi-Tenant Hierarchy | 4/4 | Complete | 2026-06-21 |
| 3. Real-Time Event Feed + Classification | 4/4 | Complete | 2026-06-21 |
| 3.5. UI Design Polish — Identidade Visual ggtech | 3/3 | Complete    | 2026-06-21 |
| 4. Cross-Site Intelligence + WhatsApp Alerts | 4/4 | Complete    | 2026-06-21 |
| 5. Plate History + Profile | 3/3 | Complete    | 2026-06-21 |
| 6. Reports PDF + Excel with Photos | 0/4 | Not started | - |
| 7. Super Admin Panel + Production Deploy | 0/TBD | Not started | - |
