# Features Research — Cargo Sentinel

**Domain:** LPR vehicle monitoring SaaS for construction site security (segurança patrimonial)
**Researched:** 2026-06-20
**Overall confidence:** HIGH (core LPR features), MEDIUM (construction-specific UX), HIGH (WhatsApp/Evolution API)

---

## Table Stakes (must have or users leave)

These are features that any operator expects from an LPR monitoring dashboard. Their absence makes the product feel broken or incomplete, not merely limited.

| Feature | Why Expected | Complexity | Notes |
|---|---|---|---|
| Real-time event feed via WebSocket | Operators need to see plates as they arrive — polling is unacceptable for security | Medium | WebSocket already chosen in stack; events must appear < 2s after camera push |
| Plate photo embedded in event row | Without photo, operators cannot visually confirm OCR accuracy; every LPR product shows the crop | Low | Images come as base64 from Intelbras; store in MinIO, display thumbnail inline |
| Vehicle classification per plate (not per event) | Operators set the risk level once per plate; all future events inherit it automatically | Medium | The 5-level model (Liberado → Crítico) must persist at plate-entity level, not event level |
| Plate search and full history | "Show me every time plate ABC-1234 visited any site" is the most common forensic workflow | Medium | Filter by plate, date range, site, direction (entry/exit); show all events with photo thumbnails |
| Watchlist / blocklist that triggers alerts | If a plate is marked Suspeito or Crítico, every new read must fire an alert — this is table stakes in Milestone XProtect, Flock Safety, Avigilon | Medium | Lookup must happen server-side on every incoming POST /NotificationInfo event |
| Alert notification on dashboard (visual + sound) | A red banner or popup for high-risk plate detections; operators miss events without it | Low | Browser notification + in-page toast for levels 4–5; audible alert recommended |
| Filterable event history | Filter by date range, camera, obra, plate, classification level | Low | Standard data-grid with server-side pagination; this is expected in every VMS product |
| Multi-camera, multi-obra view | Operators with multiple cameras need a unified feed, not one tab per camera | Medium | Empresa > Obra > Câmera hierarchy must be reflected in the event stream UI |
| Role-based access (3 roles) | Operators should not touch tenant settings; admins should not see other tenants' data | Medium | Super Admin / Admin Empresa / Operador — already defined in PROJECT.md |
| JWT authentication with session management | Expected by any enterprise SaaS buyer; security auditors ask for it | Low | Already in stack (NextAuth.js + JWT) |
| Exportable reports (PDF + Excel) | Construction companies are required by clients and insurers to produce incident documentation | High | PDF: Puppeteer HTML-to-PDF with embedded photo thumbnails; Excel: ExcelJS with image cells |
| Camera health / last-seen indicator | If a camera goes offline, operators need to know immediately — silent failure is dangerous | Low | Track last event timestamp per camera; show "offline since X minutes" badge |

---

## Differentiators (competitive advantage)

These are features that set Cargo Sentinel apart from generic LPR dashboards and are the actual commercial proposition to construtoras.

### 1. Cross-Site Intelligence (the core differentiator)

**What it does:** When a plate classified as Atenção / Suspeito / Crítico is detected at any obra belonging to the same empresa, an alert fires immediately — regardless of which obra made the original classification.

**Why it is compelling:**
- Generic LPR systems (Milestone, Avigilon) support multi-site but only within a single installation, not as a shared intelligence layer across separated sites. Cargo Sentinel shares the plate risk classification across all obras of a tenant automatically.
- Construction theft in Brazil is heavily repeat-offender driven. The same vehicle will circle multiple sites before acting. Detecting this pattern across sites is impossible with per-site tools.
- "Em 1 clique, o operador classifica um veículo suspeito. Na próxima leitura em qualquer obra da empresa, o alerta dispara automaticamente." — This sentence is the entire pitch. The intelligence must be instant and automatic.

**Implementation note:** When POST /NotificationInfo arrives, the backend must query the plate classification at empresa-level (not obra-level). If classification >= Atenção, fire alert to all connected WebSocket clients for that empresa and send WhatsApp if >= Suspeito.

**UX implication:** The alert must say "Placa ABC-1234 (Suspeito) detectada em Obra Pinheiros — classificada originalmente em Obra Mooca." The cross-site context is what makes the alert actionable.

### 2. 1-Click Classification with Instant Propagation

**What it does:** From the event feed row, the operator clicks a color button to classify the vehicle. The classification immediately propagates to all future events at all obras.

**Why it matters:** Most LPR tools require navigating to a separate "vehicle database" screen to set a watchlist entry. That friction means operators defer classification and lose the benefit. Inline classification converts the event feed from a passive log into an active intelligence tool.

**UX pattern:** Each event row shows 5 colored buttons (or a color-coded dropdown). Clicking one shows a confirmation popover ("Classificar ABC-1234 como Suspeito para todas as obras de [Empresa]?") with confirm/cancel. Confirmation time should be under 3 seconds total.

### 3. WhatsApp Alerts for Levels 4 and 5 (Suspeito / Crítico)

**What it does:** When a classified vehicle at level 4–5 is detected, the system sends a WhatsApp message with plate number, site name, timestamp, and the event photo to a configured list of supervisors.

**Why it matters in Brazil:** WhatsApp penetration in Brazil is ~95% of smartphone users. Security supervisors already live in WhatsApp groups. Sending an alert there is dramatically more likely to be seen than an email or SMS. Competitors (foreign LPR products) do not have this integration out of the box.

**Implementation approach:** Evolution API is the correct choice. It is open-source, self-hosted, integrates natively with Docker and MinIO (already in the stack), supports webhooks and real-time delivery, and has production deployments on Hostinger VPS (the deploy target). It runs on Baileys (WhatsApp Web protocol) and does not require Meta Business API approval. Risk: WhatsApp can block the number if it detects automation — mitigate by using a dedicated number, sending only triggered alerts (not broadcast campaigns), and keeping message volume low. Evolution API Lite is sufficient for this use case (no chatbot, no audio — pure outbound alerts).

**Message format:**
```
[CARGO SENTINEL] Alerta Nível 4 - Suspeito
Placa: ABC-1234
Obra: Vila Madalena - Bloco B
Câmera: LPR-0003 (Entrada Principal)
Hora: 14:32 - 20/06/2026
[foto anexada como imagem]
```

### 4. Plate Profile Page (Vehicle Intelligence Card)

**What it does:** A dedicated page per plate number showing: current classification + who set it + when, full timeline of all detections across all obras with photos, frequency analysis (how many times per week/month), and a notes/observation field.

**Why it matters:** The forensic investigation workflow — "show me everything about this plate" — is how security managers build cases for police reports (Boletim de Ocorrência). Having all evidence consolidated in one printable page saves hours.

**UX pattern:** Access via clicking the plate number anywhere in the UI. The page is the "source of truth" for that plate within the empresa. Classification is changed from this page with an audit log (who changed, when, previous level).

### 5. Construction-Site-Specific Classification Defaults

**What it does:** The default interpretation of each level maps directly to canteiro de obra context, not generic corporate security. The Visitante level (2) maps to "fornecedor não agendado" workflows. The Liberado level (1) maps to approved prestadores/transportadoras.

**Why it matters:** Generic LPR tools have "allow/deny/alert" which is parking-lot thinking. Construction sites have complex logistics with approved suppliers, occasional visitors, and recurring service vehicles. The 5-level model maps naturally to construction operations if the UI labels and help text use construction vocabulary.

---

## Anti-Features (deliberately NOT build in v1)

These are features that would seem reasonable to include but are traps that increase complexity, operator friction, or development time without proportional value in v1.

| Anti-Feature | Why Avoid | What to Do Instead |
|---|---|---|
| Live video streaming from cameras | Intelbras LPR cameras push events, not streams. Adding RTSP/RTMP streaming requires a different infrastructure layer (media server, HLS/WebRTC). Operators do not need to watch video — they need to see plate events. | Show the captured event photo. A still image from the moment of detection is sufficient and already provided by the camera payload. |
| Automatic classification rules (e.g., classify by vehicle type or time-of-day) | Sounds smart, but auto-classification creates false confidence. If the system auto-marks a plate as Liberado because it arrived at 8am, operators stop verifying. In construction security, human judgment at classification time is the safeguard. | Build the rule engine in v2 after operators have used the manual workflow long enough to know what they'd actually automate. |
| Map/geographic view of obras | Visually appealing but adds significant frontend complexity (maps integration, geocoding, marker management). The hierarchy Empresa > Obra > Câmera is already navigable via dropdown. A map adds no operational value for the alert workflow. | Use a simple list/tree of obras. Add map in v2. |
| Mobile app (iOS/Android) | Native app doubles the codebase, requires app store approval, and the primary users are control room operators at desks. The WebSocket dashboard works on tablets via browser. | Ensure the Next.js dashboard is responsive enough for tablet use. Native app is v2. |
| Email alert delivery | Email has high latency and low open rates for urgent security alerts. It is not the right channel for a "suspect vehicle detected" notification. Adding email also requires email infrastructure (SMTP, template management). | WhatsApp only for v1. Add email as optional secondary channel in v2. |
| In-app billing and subscription management | Payment processing, dunning, proration, invoice generation are a full product unto themselves. Early customers will be manually onboarded. | Super admin creates and configures tenants manually. Stripe integration is v2. |
| User-configurable webhook output | Operators and admins at construction companies are not developers. They will not configure webhooks. Building a webhook config UI adds complexity with near-zero v1 utilization. | Hard-code the Evolution API integration. Expose a generic webhook endpoint in v2 for enterprise integration requests. |
| Plate OCR confidence scoring display | Showing "82% confidence" to a non-technical operator creates confusion and decision paralysis. They do not know what to do with a confidence score. | Filter out reads below a threshold server-side (configurable per camera, hidden from operators). Show only high-confidence reads in the feed. |
| Multi-language support | The market is Brazil. All users speak Portuguese. Internationalization adds translation overhead and complicates UI copy decisions. | Build in Portuguese (pt-BR) exclusively for v1. |
| Visitor pre-registration / access scheduling | Useful but requires a completely separate workflow (receptionist pre-registers plate, system looks it up on arrival). This is a different product surface area. | Show "unclassified" plates as Visitante by default. Pre-registration is a v2 feature tied to logistics management. |

---

## Feature Complexity Notes

These are implementation details that are non-obvious and need to be scoped correctly in the roadmap.

### Report Generation is Harder Than It Looks

Generating PDF or Excel reports with embedded photos is the highest-complexity feature in v1.

**PDF approach:** Puppeteer (headless Chrome) is the correct tool for Node.js. The flow is: API generates an HTML template with event data and base64-encoded images → Puppeteer renders the HTML → exports to PDF. Key pitfall: for reports with many events (50+ photos), Puppeteer memory usage spikes. Implement pagination (max 30 events per PDF page) and stream the PDF back rather than building it in memory. Use `waitUntil: 'networkidle0'` to ensure images load before printing.

**Excel approach:** ExcelJS (not openpyxl — the stack is Node.js). ExcelJS supports embedded images via `worksheet.addImage()`. Set row height explicitly to match image dimensions. This is the preferred format for Brazilian construction companies who want to process data in Excel.

**Design decision:** Generate reports on-demand (user clicks "Generate" with filters applied) rather than scheduled reports in v1. Scheduled reports require a job queue (BullMQ or similar) and email delivery — both out of scope.

### WhatsApp Number Blocking Risk

Evolution API uses the WhatsApp Web protocol (Baileys), not the official Meta Cloud API. WhatsApp can detect and block numbers running on this protocol. Mitigation:
- Use a dedicated WhatsApp number purchased specifically for Cargo Sentinel alerts (not a personal number).
- Send only triggered alerts (one message per event, not campaigns).
- Keep daily message volume low per number (< 200/day is safe for triggered alerting).
- Implement exponential backoff retry in the Evolution API integration — do not hammer a failed delivery.
- If a tenant wants guaranteed delivery with no block risk, document the path to official Meta Business API in the future (v2 option).

### Cross-Site Alert Fan-out

When a high-risk plate is detected, the system must:
1. Query the plate's classification at empresa level.
2. If level >= 3, fan-out WebSocket message to all connected clients for that empresa.
3. If level >= 4, send WhatsApp to the configured supervisor list for that obra (not empresa-wide, to avoid noise).
4. Log the alert with a reference to the triggering event for audit.

The fan-out to WebSocket clients must be scoped to empresa, not obra — all operators across all obras of the empresa must see the cross-site alert. This is the key implementation difference from a per-site LPR tool.

### Camera Offline Detection

Intelbras cameras push events; they do not respond to polls. The only way to detect a camera offline is to notice that no events have arrived from a given camera ID for an unexpected period. Implement a scheduled job (cron, every 5 minutes) that checks `last_event_at` per camera. If > 30 minutes with no event during business hours, mark as potentially offline and show a warning badge. This avoids the false alarm of night-time silence.

### OCR Error Handling

Intelbras LPR cameras have a known OCR error pattern with similar characters (0/O, 1/I, 5/S in Brazilian plates). The system should:
- Store the raw OCR result as-is — do not correct.
- When looking up a plate for classification, also query common 1-character substitutions (fuzzy match optional in v2).
- In v1: display the OCR result exactly as received and let the operator correct via the plate profile page (manual edit of plate string with note).

---

## UX Patterns for Operators

Operators at construction sites are typically non-technical security guards working 8-12 hour shifts. UX must optimize for these constraints:

### The Central Tension: Alert Fatigue vs. Missed Alerts

Research shows that SOC analysts miss critical alerts when > 50% of alerts are false positives. In a construction site context, if every unclassified vehicle triggers a visual alert, operators will start ignoring the feed within days. The solution:

- **Default state for new plates is Visitante (level 2), not Crítico.** New plates appear in the feed with a neutral blue badge. They do not trigger audio or popup alerts. Operators classify when they have time.
- **Only levels 4 and 5 trigger intrusive alerts** (audio, popup, WhatsApp). Levels 1–3 update the feed silently.
- **"Unclassified" is the most common state.** A construction site has hundreds of different trucks, suppliers, and delivery vehicles. The feed will be mostly unclassified plates. This is normal. The value is in having a fast path to classify the suspicious ones.

### Classification UX — The 1-Click Requirement

The classification action must be achievable in a single click from the event feed without leaving the current view:

1. Event row shows the plate photo, plate string, camera name, time, current classification badge.
2. Clicking the classification badge opens an inline popover with 5 colored buttons.
3. Clicking a button triggers an optimistic update (badge changes immediately) + API call.
4. If the plate was previously unclassified and is now set to level 4+, a confirmation modal appears: "Isso vai disparar alertas em todas as obras de [Empresa]. Confirmar?"
5. No page navigation required.

Avoid: dropdown menus with text levels only (slow to scan), modal forms that require input (adds friction), navigation away from the feed (operator loses context of real-time stream).

### Event Feed Design

- **Newest-first, auto-scroll to top with new events.** New events should appear at the top with a brief highlight animation (yellow flash for 2 seconds).
- **Pause auto-scroll when user is scrolling history.** A "New events: 3 — click to resume" bar at the top prevents losing position.
- **Sticky header with active filters.** Operators quickly lose track of whether they are filtered to a specific obra. The active filters should be visually prominent at all times.
- **Color-coded rows by classification level.** The entire row background should tint to the classification color at low opacity. A Crítico event row has a red tint. This allows peripheral vision scanning without reading text.
- **Confidence filter hidden by default.** Low-confidence reads appear in the feed but are slightly dimmed. A toggle lets operators hide reads below a threshold — not exposed by default.

### Cross-Site Alert Design

When a cross-site alert fires, it must communicate three things immediately:
1. Which plate (the risk trigger)
2. Where it appeared now (current obra)
3. Why it is flagged (original classification + where classified)

Pattern: Full-screen overlay (cannot be missed) with: large plate number, large red badge "SUSPEITO — Detectado em Obra Pinheiros", smaller text "Classificado por João Silva em Obra Mooca em 15/06/2026 às 09:14", dismiss button + escalation button ("Notificar Supervisor").

### Report Generation UX

- Reports are generated from a filter page that mirrors the event history filters.
- Format selection: PDF (for printing/sending to clients) or Excel (for data processing).
- Show a preview of how many events will be included: "Relatório com 47 eventos, 47 fotos — pode demorar 30 segundos."
- Generate asynchronously with a loading state. Do not block the UI during generation.
- Filename convention: `cargo-sentinel-OBRA-AAAA-MM-DD.pdf` — makes filing easy.

### Super Admin Panel (tenant management UX)

The super admin is GGTronic staff — one or two technical people. It does not need to be polished consumer UX:

- Tenant list with: empresa name, plan tier, number of obras, number of cameras, number of events (last 30 days), account status (active/suspended).
- Create tenant: empresa name, primary admin email, plan.
- Suspend/reactivate tenant: one-click toggle with confirmation.
- Impersonate tenant: "View as this tenant" link that opens the dashboard in the tenant's context — critical for support.
- Usage metrics per tenant: events/month, WhatsApp messages sent, storage used (MB), cameras configured.
- No billing integration in v1 — track manually, bill externally.

---

## Sources

- [Impakter — LPR Ultimate Guide 2026](https://impakter.com/top-license-plate-recognition-system-the-ultimate-guide-for-2026/)
- [Avigilon VehicleManager Enterprise](https://www.avigilon.com/vehicle-manager-enterprise)
- [Milestone XProtect LPR Features](https://doc.milestonesys.com/latest/en-US/add-ons/add-on_lpr/sc_workingwithxprlpr.htm)
- [Milestone XProtect LPR Alarms](https://doc.milestonesys.com/latest/en-US/add-ons/add-on_lpr/lpr_alarmstriggeredbylpr.htm)
- [Flock Safety Platform](https://www.flocksafety.com/products/flock-safety-platform)
- [Flock Safety National LPR Network](https://www.flocksafety.com/products/national-lpr-network)
- [SoundThinking — Investigative Benefits of LPR](https://www.soundthinking.com/blog/investigative-benefits-of-license-plate-recognition/)
- [Evolution API GitHub](https://github.com/EvolutionAPI/evolution-api)
- [Evolution API on Hostinger](https://www.hostinger.com/applications/evolution-api)
- [Gurusup — Evolution API Overview](https://gurusup.com/blog/evolution-api-whatsapp)
- [ACM — Alert Fatigue in SOCs](https://dl.acm.org/doi/10.1145/3723158)
- [GlitchLabs — Admin Dashboard UX Patterns 2026](https://www.glitchlabs.app/insights/admin-dashboard-ux-patterns)
- [Puppeteer PDF Generation Guide](https://latenode.com/blog/complete-guide-to-pdf-generation-with-puppeteer-from-simple-documents-to-complex-reports)
- [Browserless — Puppeteer PDF Generator](https://www.browserless.io/blog/puppeteer-pdf-generator)
- [TrueLook — AI Security for Construction Jobsites 2026](https://www.truelook.com/blog/ai-security-solutions-for-construction-jobsites)
- [Sirix — Construction Site Security Technology Trends 2026](https://sirixmonitoring.com/blog/construction-site-security-technology-trends/)
- [AECweb — Segurança Patrimonial em Canteiros de Obra](https://www.aecweb.com.br/revista/materias/5-praticas-que-ajudam-a-garantir-a-seguranca-patrimonial-nos-canteiros-de-obras/20681)
- [Coram AI — Best LPR Software](https://www.coram.ai/post/best-license-plate-recognition-software)
- [Medium — Alert Fatigue and Dashboard Overload 2026](https://medium.com/design-bootcamp/alert-fatigue-and-dashboard-overload-why-cybersecurity-needs-better-ux-1f3bd32ad81c)
