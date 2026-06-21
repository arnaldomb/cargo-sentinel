# Phase 3: Real-Time Event Feed + Vehicle Classification — Research

**Researched:** 2026-06-21
**Domain:** live operator dashboard, plate classification, Socket.IO tenant rooms, event feed API, camera operational status
**Confidence:** HIGH (requirements, roadmap, current codebase, and prior phase outputs were inspected directly)

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| PLACA-01 | Entidade `Placa` com `@@unique([numero, empresaId])` | Prisma schema extension required; current schema has `Evento` but no tenant-scoped `Placa` aggregate |
| PLACA-02 | Campos: número, transportadora, motorista, tipo veículo, material, classificação, observação | Data model can live on `Placa`; avoids duplicating mutable metadata in every `Evento` |
| PLACA-03 | 5 níveis: Liberado, Visitante, Atenção, Suspeito, Crítico | Existing enum `Classificacao` in Prisma already matches the 5-level model |
| PLACA-04 | Nova placa recebe `Visitante` automaticamente | Worker already persists `Evento`; Phase 3 must upsert `Placa` before/with event write |
| PLACA-05 | Classificação inline em 1 clique no feed | Requires backend mutation endpoint + frontend popover interaction in dashboard |
| PLACA-06 | Confirmação obrigatória para nível 4 ou 5 | Best enforced in UI and revalidated in backend for defensive consistency |
| PLACA-07 | Mudança de classificação registrada com usuário e timestamp | Requires audit table separate from `Evento` to preserve history |
| REALTIME-01 | Socket.IO com rooms `empresa:{empresaId}` | Backend currently has no Socket.IO; must be added on shared HTTP server |
| REALTIME-02 | Join validado por JWT; `empresaId` vem do token | Reuse Auth.js JWE decryption pattern from Phase 2; never trust tenant from client payload |
| REALTIME-03 | Feed mostra thumbnail, placa, obra, câmera, classificação, horário, direção | Existing `Evento` plus joins to `Camera`/`Obra` can produce this DTO |
| REALTIME-04 | Linhas coloridas por classificação | Frontend concern; requires stable mapping enum → visual tokens |
| REALTIME-05 | Novos eventos entram no topo sem reload | Needs initial REST fetch plus incremental Socket.IO push |
| REALTIME-06 | Pausa auto-scroll ao rolar manualmente | Frontend state concern; should not block real-time inserts |
| REALTIME-07 | Status online/offline por câmera com timestamp do último evento | Can be derived from latest `Evento.timestamp` per camera without schema change |
</phase_requirements>

---

## Summary

Phase 3 is the first phase where the product starts to look like Cargo Sentinel instead of infrastructure. The operator must see new LPR detections in near real time, classify a plate without leaving the feed, and trust that the classification instantly applies across the tenant.

The current codebase already has the hard prerequisites:

- Auth.js login and JWT claims are working
- Express middleware already resolves tenant context
- LPR webhook ingestion, BullMQ, and `Evento` persistence already exist
- `Classificacao` enum already exists in Prisma and `Evento` already stores the current classification snapshot

The main gap is structural, not cosmetic: there is no canonical `Placa` entity, no audit log for reclassification, no feed API, no Socket.IO server, and no authenticated dashboard UI beyond the login screen.

**Primary recommendation:** execute Phase 3 in four plans:

1. Add tenant-scoped `Placa` + audit history and make the ingestion pipeline upsert it.
2. Add Socket.IO with tenant-safe auth and room broadcast primitives.
3. Add REST endpoints for initial feed and camera status, plus mutation endpoints for classification.
4. Build the dashboard UI that hydrates from REST and stays live through Socket.IO.

---

## Current State Snapshot

### Backend: already available

- `POST /api/lpr/NotificationInfo/:action` accepts Intelbras payloads and enqueues work
- BullMQ worker writes `Evento`
- `Evento` already has `placaNumero`, `classificacao`, `cameraId`, `obraId`, `empresaId`, `timestamp`, `fotoGarageKey`
- CRUD de `Obra` and `Camera` already exists behind tenant-aware middleware

### Backend: missing for Phase 3

- No `Placa` model
- No classification audit model
- No endpoint to list the feed
- No endpoint to reclassify a plate
- No Socket.IO server
- No room auth or tenant broadcast layer
- No camera status query

### Frontend: already available

- Login page and session flow
- Protected `/` route

### Frontend: missing for Phase 3

- No authenticated app shell
- No dashboard route or layout
- No live feed
- No sidebar
- No inline classification control
- No camera status UI

---

## Standard Stack

### Core additions for this phase

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `socket.io` | `^4.8.x` | WebSocket abstraction for live events | Matches project stack decision; tenant rooms and ack flows are first-class |
| `socket.io-client` | `^4.8.x` | Browser live feed client | Same protocol/version as server |
| `zod` | `^4.x` | Parse feed and mutation payloads at API boundary | Prevents malformed classification mutations |

### Optional in this phase

| Library | Purpose | When to Use |
|---------|---------|-------------|
| `@socket.io/redis-adapter` | Multi-instance broadcast | Add if the API is horizontally scaled; not required for local single-container execution |
| `date-fns` | Feed timestamp formatting | Use if raw `Intl.DateTimeFormat` becomes repetitive |

---

## Recommended Data Model

### 1. `Placa` is the source of truth for current classification

`Evento` is immutable history of detections. `Placa` should represent the tenant-wide current state of a vehicle.

Recommended shape:

```prisma
model Placa {
  id                 String         @id @default(cuid())
  numero             String
  empresaId          String
  empresaTransportadora String?
  motorista          String?
  tipoVeiculo        String?
  material           String?
  observacao         String?
  classificacao      Classificacao  @default(VISITANTE)
  createdAt          DateTime       @default(now())
  updatedAt          DateTime       @updatedAt
  empresa            Empresa        @relation(fields: [empresaId], references: [id])
  eventos            Evento[]
  historico          ClassificacaoHistorico[]

  @@unique([numero, empresaId])
  @@index([empresaId, classificacao])
}
```

### 2. Classification history must be separate from `Evento`

`Evento` answers "what was seen". Audit answers "who changed the risk level and when".

Recommended shape:

```prisma
model ClassificacaoHistorico {
  id              String        @id @default(cuid())
  placaId         String
  empresaId       String
  classificacaoDe Classificacao?
  classificacaoPara Classificacao
  observacao      String?
  usuarioId       String
  createdAt       DateTime      @default(now())

  placa           Placa         @relation(fields: [placaId], references: [id])
  empresa         Empresa       @relation(fields: [empresaId], references: [id])
  usuario         User          @relation(fields: [usuarioId], references: [id])

  @@index([placaId, createdAt(sort: Desc)])
  @@index([empresaId, createdAt(sort: Desc)])
}
```

### 3. `Evento` should reference `Placa`

Add nullable-to-required path carefully:

- introduce `placaId String?` first
- backfill from existing `placaNumero + empresaId`
- then make it required only if the migration path is safe

For Phase 3 implementation, a pragmatic first step is:

- add `placaId String?`
- always populate it for new events
- keep `placaNumero` on `Evento` for denormalized search/display

---

## API Contracts

### Initial feed endpoint

Recommended:

```http
GET /api/eventos/feed?limit=50&cursor=<optional>
```

Response DTO:

```json
{
  "items": [
    {
      "id": "evt_123",
      "timestamp": "2026-06-21T03:50:00.000Z",
      "placaNumero": "ABC1234",
      "placaId": "pla_123",
      "classificacao": "VISITANTE",
      "direcao": "ENTRADA",
      "obra": { "id": "obr_1", "nome": "Obra Centro" },
      "camera": { "id": "cam_1", "codigoLpr": "LPR-0001" },
      "thumbnailUrl": "https://...",
      "isNovaPlaca": true
    }
  ],
  "nextCursor": "evt_122"
}
```

### Camera status endpoint

Recommended:

```http
GET /api/cameras/status
```

Status derivation:

- `online` if `ultimoEventoEm >= now - 5 minutes`
- `offline` otherwise

This can be computed from latest `Evento` per camera; no schema change is required in the first iteration.

### Classification mutation endpoint

Recommended:

```http
PATCH /api/placas/:placaId/classificacao
Content-Type: application/json
```

Payload:

```json
{
  "classificacao": "SUSPEITO",
  "observacao": "Carga fora de rota"
}
```

Rules:

- roles allowed: `ADMIN_EMPRESA`, `OPERADOR`
- tenant comes from `req.tenantClient`, never from body
- escalating to `SUSPEITO` or `CRITICO` should require explicit confirmation intent from the UI
- backend still validates the target enum and writes audit history
- after mutation, emit a tenant-scoped socket event

---

## Socket.IO Contract

### Authentication

- Socket handshake must read the same Auth.js cookie used in HTTP
- server decrypts the JWE using the same Phase 2 HKDF + `jose.jwtDecrypt` pattern
- if no valid tenant claim exists, reject the connection

### Rooms

- Every authenticated non-superadmin socket joins exactly one room: `empresa:{empresaId}`
- Never accept room names or tenant IDs sent by the browser
- Never use `io.emit()` for tenant events

### Event names

Recommended event vocabulary:

- `feed:evento-novo`
- `feed:placa-classificada`
- `feed:camera-status`

Payloads should be DTOs, not raw Prisma objects.

---

## UI Architecture

### Recommended route shape

- Keep `/` as the authenticated dashboard landing page
- Add an app shell with:
  - left sidebar for cameras/status
  - main column for live feed
  - top bar for tenant context and logout

### Feed behavior

- Initial load comes from REST
- New rows are prepended from Socket.IO
- If the operator is at the top, auto-scroll keeps the top anchored
- If the operator scrolls down, freeze auto-scroll and show a "novos eventos" affordance

### Classification UX

- Feed row shows current badge color
- Clicking the badge opens a small inline selector
- Choosing `SUSPEITO` or `CRITICO` must open a confirmation dialog
- Successful mutation updates local state immediately, then reconciles with the broadcast

---

## Risks And Pitfalls

1. **Tenant leak through global broadcast**
   - Never call `io.emit()`
   - Always emit to `empresa:{empresaId}`

2. **Race between classification mutation and new event ingestion**
   - `Placa` is the source of truth for current classification
   - worker should read or create `Placa` before persisting the event snapshot

3. **Expensive camera status queries**
   - derive from indexed latest-event queries
   - do not scan the full event table on every dashboard refresh

4. **UI drift between initial REST state and live socket events**
   - standardize DTOs so REST and Socket.IO payloads share the same shape

5. **Over-coupling Phase 3 to cross-site alerts**
   - Phase 3 stops at tenant-local realtime feed and classification
   - cross-site intelligence belongs to Phase 4

---

## Recommended Plan Split

| Plan | Scope | Requirements |
|------|-------|--------------|
| 03-01 | `Placa` + audit schema + ingestion upsert + classification mutation endpoint | PLACA-01, PLACA-02, PLACA-03, PLACA-04, PLACA-07 |
| 03-02 | Socket.IO bootstrap, JWE auth, tenant rooms, emit helpers | REALTIME-01, REALTIME-02 |
| 03-03 | Feed REST, camera status REST, socket emission wiring | REALTIME-03, REALTIME-05, REALTIME-07 |
| 03-04 | Dashboard UI, color mapping, inline popover, confirmation flow, auto-scroll pause | PLACA-05, PLACA-06, REALTIME-04, REALTIME-06 |

---

## Exit Criteria For Planning

- Phase 3 has executable plans with clear file targets
- Every PLACA and REALTIME requirement maps to a plan
- Validation strategy covers REST, Socket.IO, and browser behavior
- Human UAT includes two-browser verification for tenant sync
