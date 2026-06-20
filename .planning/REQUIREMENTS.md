# Requirements — Cargo Sentinel

## v1 Requirements

### INFRA — Infraestrutura e Monorepo

- [ ] **INFRA-01**: Monorepo Turborepo 2.x + pnpm com workspaces: `apps/web`, `apps/api`, `packages/database`, `packages/shared`, `packages/ui`
- [ ] **INFRA-02**: `packages/database` exporta `createTenantClient(prisma, empresaId)` — injeta `empresaId` em toda operação via Prisma `$extends`
- [ ] **INFRA-03**: Docker Compose com serviços: `web` (Next.js), `api` (Express), `postgres`, `garage` (S3), `redis`, `traefik`
- [ ] **INFRA-04**: Traefik v3 roteando por path: `/media/*` → Garage, `/api/*` → Express, `/*` → Next.js
- [ ] **INFRA-05**: `acme.json` em volume persistente para certificados Let's Encrypt

### LPR — Ingestão de Eventos de Câmera

- [ ] **LPR-01**: Endpoint `POST /api/lpr/NotificationInfo/:action` aceita payload Intelbras com imagem base64
- [ ] **LPR-02**: Endpoint retorna HTTP 200 imediatamente e processa evento de forma assíncrona via BullMQ
- [ ] **LPR-03**: Idempotência via `idempotencyKey = SHA256(cameraId + placa + timestamp)` — câmera pode reenviar sem duplicar evento
- [ ] **LPR-04**: Imagem decodificada de base64 e enviada ao Garage (nunca armazenada em base64 no banco)
- [ ] **LPR-05**: `fotoGarageKey` (object key) salvo no banco — URL presignada gerada sob demanda com TTL 5 min

### STORAGE — Armazenamento de Imagens

- [ ] **STORAGE-01**: Garage v2.x rodando como serviço Docker com bucket `lpr-images`
- [ ] **STORAGE-02**: `GARAGE_SERVER_URL` configurado com URL pública HTTPS (evita falha de assinatura presigned URL)
- [ ] **STORAGE-03**: API gera presigned GET URLs para cada imagem — frontend nunca acessa Garage diretamente

### AUTH — Autenticação e Autorização

- [ ] **AUTH-01**: Usuário pode fazer login com email/senha
- [ ] **AUTH-02**: JWT contém `{ sub, empresaId, role, iat, exp }` — Super Admin tem `empresaId: null` explícito
- [ ] **AUTH-03**: Três roles: `SUPER_ADMIN`, `ADMIN_EMPRESA`, `OPERADOR` com permissões distintas
- [ ] **AUTH-04**: Token de acesso com TTL 15 min — refresh token em cookie httpOnly
- [ ] **AUTH-05**: Middleware Express valida JWT e injeta `req.tenantClient = createTenantClient(prisma, req.user.empresaId)`
- [ ] **AUTH-06**: Usuário pode fazer logout de qualquer página

### TENANT — Hierarquia Multi-Tenant

- [ ] **TENANT-01**: Entidade `Empresa` (tenant) com CNPJ, nome, status (ativo/suspenso)
- [ ] **TENANT-02**: Entidade `Obra` pertence a uma `Empresa` — com nome, endereço, status
- [ ] **TENANT-03**: Entidade `Camera` pertence a uma `Obra` com código único (`LPR-0001`), IP, status
- [ ] **TENANT-04**: `empresaId` denormalizado em `Camera` e `Evento` para queries cross-site eficientes
- [ ] **TENANT-05**: Admin Empresa pode criar/editar/desativar Obras e Câmeras da sua empresa
- [ ] **TENANT-06**: Operador vê apenas as obras/câmeras da sua empresa

### PLACA — Cadastro e Classificação de Veículos

- [ ] **PLACA-01**: Entidade `Placa` com `@@unique([numero, empresaId])` — classificação é por tenant
- [ ] **PLACA-02**: Campos: número, empresa transportadora, motorista, tipo veículo, material, classificação (1-5), observação
- [ ] **PLACA-03**: Classificação em 5 níveis: Liberado (1), Visitante (2), Atenção (3), Suspeito (4), Crítico (5)
- [ ] **PLACA-04**: Nova placa detectada automaticamente recebe classificação padrão Visitante (2)
- [ ] **PLACA-05**: Operador classifica veículo em 1 clique no feed — popover inline sem navegar de página
- [ ] **PLACA-06**: Confirmação obrigatória para escalar para nível 4 ou 5
- [ ] **PLACA-07**: Mudança de classificação registrada em log de auditoria com usuário e timestamp

### REALTIME — Painel em Tempo Real

- [ ] **REALTIME-01**: Socket.IO com rooms por tenant (`empresa:{empresaId}`) — nunca `io.emit()` global
- [ ] **REALTIME-02**: Room join validado por JWT no middleware Socket.IO — `empresaId` do token, nunca do cliente
- [ ] **REALTIME-03**: Feed de eventos mostra: foto thumbnail, placa, obra, câmera, classificação, horário, direção
- [ ] **REALTIME-04**: Linhas coloridas conforme classificação (verde → vermelho)
- [ ] **REALTIME-05**: Novos eventos aparecem no topo do feed sem reload de página
- [ ] **REALTIME-06**: Feed pausa auto-scroll quando operador rola manualmente
- [ ] **REALTIME-07**: Indicador de status de cada câmera (online/offline) com timestamp do último evento

### INTELLIGENCE — Inteligência Multisite

- [ ] **INTEL-01**: A cada evento LPR, sistema consulta classificação da placa no nível da empresa (não da obra)
- [ ] **INTEL-02**: Se placa é Suspeito (4) ou Crítico (5) e detectada em obra diferente da classificação original → dispara alerta cross-site
- [ ] **INTEL-03**: Alerta cross-site exibe: "Placa [XXX] (Suspeito) detectada em [Obra B] — classificada originalmente em [Obra A]"
- [ ] **INTEL-04**: Alerta cross-site transmitido via Socket.IO para sala da empresa inteira
- [ ] **INTEL-05**: Overlay de alerta em tela cheia para níveis 4 e 5 com botão de dispensar

### ALERTS — Notificações WhatsApp

- [ ] **ALERTS-01**: Evolution API v2.3.7 (hard-pinned) em container Docker para envio WhatsApp
- [ ] **ALERTS-02**: Alertas WhatsApp disparados apenas para níveis 4 (Suspeito) e 5 (Crítico)
- [ ] **ALERTS-03**: Envio via BullMQ (concurrência 1) — nunca direto do webhook handler
- [ ] **ALERTS-04**: Dedup por placa: janela 5 min para Suspeito, 15 min para Crítico (evita spam)
- [ ] **ALERTS-05**: `INSERT ON CONFLICT DO NOTHING` para evitar duplicação em race conditions multisite
- [ ] **ALERTS-06**: Admin configura lista de números WhatsApp por obra para receber alertas

### HISTORY — Histórico e Perfil de Placa

- [ ] **HISTORY-01**: Página de perfil de placa: todas as detecções, obras, câmeras, horários
- [ ] **HISTORY-02**: Timeline cronológica de classificações com usuário responsável
- [ ] **HISTORY-03**: Busca de histórico por placa, data, hora, obra, câmera
- [ ] **HISTORY-04**: Paginação de eventos (cursor-based) — sem full-table scan

### REPORTS — Relatórios PDF e Excel

- [ ] **REPORTS-01**: Geração de relatório é assíncrona via BullMQ — não bloqueia request handler
- [ ] **REPORTS-02**: PDF com Puppeteer: foto thumbnail em cada linha, cabeçalho com filtros aplicados
- [ ] **REPORTS-03**: Excel com ExcelJS: imagem embutida por linha, formatação colorida por classificação
- [ ] **REPORTS-04**: Filtros: período (data/hora), obra, câmera, classificação, placa
- [ ] **REPORTS-05**: Limite de 1.000 eventos por relatório (performance)
- [ ] **REPORTS-06**: Notificação WebSocket quando relatório está pronto para download
- [ ] **REPORTS-07**: Link de download com presigned URL — expira em 1 hora

### SUPERADMIN — Painel Super Admin

- [ ] **SADMIN-01**: Super Admin vê lista de todas as empresas com status, número de obras, câmeras, eventos
- [ ] **SADMIN-02**: Super Admin pode criar nova empresa (tenant) com admin inicial
- [ ] **SADMIN-03**: Super Admin pode suspender/reativar empresa
- [ ] **SADMIN-04**: Super Admin pode impersonar empresa para suporte (token temporário)
- [ ] **SADMIN-05**: Dashboard de uso: eventos/dia por empresa, câmeras ativas, alertas gerados

---

## v2 Requirements (deferred)

- Mapa geográfico das obras com status visual
- Regras automáticas de classificação por horário/frequência
- Câmeras não-Intelbras (ONVIF genérico)
- App mobile (React Native)
- Billing integrado (Asaas ou Stripe)
- Email alerts
- OCR confidence score filtering
- Multi-idioma
- Exportação para BO (Boletim de Ocorrência)
- Integração com câmeras de vídeo (RTSP)

---

## Out of Scope (v1)

- **Live video streaming** — câmeras Intelbras LPR não suportam no modelo push; foto capturada é suficiente
- **Auto-classificação por horário** — cria falsa confiança e reduz vigilância do operador; manual é feature, não limitação
- **RLS PostgreSQL** — Prisma não gera DDL de RLS; `createTenantClient()` é suficiente para esta escala
- **Email alerts** — canal errado para Brasil em v1; WhatsApp tem 95% de penetração
- **Tailwind v4** — shadcn/ui não totalmente migrado; usar v3
- **MinIO** — OSS arquivado em abril/2026; usar Garage v2.x
- **Evolution API 2.4.0+** — requer license server externo; pinado em 2.3.7

---

## Traceability

| REQ-ID | Phase | Status |
|--------|-------|--------|
| INFRA-01 | Phase 1 | Pending |
| INFRA-02 | Phase 1 | Pending |
| INFRA-03 | Phase 1 | Pending |
| INFRA-04 | Phase 1 | Pending |
| INFRA-05 | Phase 1 | Pending |
| LPR-01 | Phase 1 | Pending |
| LPR-02 | Phase 1 | Pending |
| LPR-03 | Phase 1 | Pending |
| LPR-04 | Phase 1 | Pending |
| LPR-05 | Phase 1 | Pending |
| STORAGE-01 | Phase 1 | Pending |
| STORAGE-02 | Phase 1 | Pending |
| STORAGE-03 | Phase 1 | Pending |
| AUTH-01 | Phase 2 | Pending |
| AUTH-02 | Phase 2 | Pending |
| AUTH-03 | Phase 2 | Pending |
| AUTH-04 | Phase 2 | Pending |
| AUTH-05 | Phase 2 | Pending |
| AUTH-06 | Phase 2 | Pending |
| TENANT-01 | Phase 2 | Pending |
| TENANT-02 | Phase 2 | Pending |
| TENANT-03 | Phase 2 | Pending |
| TENANT-04 | Phase 2 | Pending |
| TENANT-05 | Phase 2 | Pending |
| TENANT-06 | Phase 2 | Pending |
| PLACA-01 | Phase 3 | Pending |
| PLACA-02 | Phase 3 | Pending |
| PLACA-03 | Phase 3 | Pending |
| PLACA-04 | Phase 3 | Pending |
| PLACA-05 | Phase 3 | Pending |
| PLACA-06 | Phase 3 | Pending |
| PLACA-07 | Phase 3 | Pending |
| REALTIME-01 | Phase 3 | Pending |
| REALTIME-02 | Phase 3 | Pending |
| REALTIME-03 | Phase 3 | Pending |
| REALTIME-04 | Phase 3 | Pending |
| REALTIME-05 | Phase 3 | Pending |
| REALTIME-06 | Phase 3 | Pending |
| REALTIME-07 | Phase 3 | Pending |
| INTEL-01 | Phase 4 | Pending |
| INTEL-02 | Phase 4 | Pending |
| INTEL-03 | Phase 4 | Pending |
| INTEL-04 | Phase 4 | Pending |
| INTEL-05 | Phase 4 | Pending |
| ALERTS-01 | Phase 4 | Pending |
| ALERTS-02 | Phase 4 | Pending |
| ALERTS-03 | Phase 4 | Pending |
| ALERTS-04 | Phase 4 | Pending |
| ALERTS-05 | Phase 4 | Pending |
| ALERTS-06 | Phase 4 | Pending |
| HISTORY-01 | Phase 5 | Pending |
| HISTORY-02 | Phase 5 | Pending |
| HISTORY-03 | Phase 5 | Pending |
| HISTORY-04 | Phase 5 | Pending |
| REPORTS-01 | Phase 6 | Pending |
| REPORTS-02 | Phase 6 | Pending |
| REPORTS-03 | Phase 6 | Pending |
| REPORTS-04 | Phase 6 | Pending |
| REPORTS-05 | Phase 6 | Pending |
| REPORTS-06 | Phase 6 | Pending |
| REPORTS-07 | Phase 6 | Pending |
| SADMIN-01 | Phase 7 | Pending |
| SADMIN-02 | Phase 7 | Pending |
| SADMIN-03 | Phase 7 | Pending |
| SADMIN-04 | Phase 7 | Pending |
| SADMIN-05 | Phase 7 | Pending |
