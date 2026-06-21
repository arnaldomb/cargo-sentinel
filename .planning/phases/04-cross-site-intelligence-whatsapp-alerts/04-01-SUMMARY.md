---
phase: "4"
plan: "01"
subsystem: "schema + messaging"
tags: [prisma, whatsapp, evolution-api, docker, alerts]
dependency_graph:
  requires: []
  provides:
    - "Placa.obraClassificacaoId — campo para detecção cross-site"
    - "ConfiguracaoAlerta model — números WhatsApp por obra"
    - "Evolution API v2.3.7 container — canal de entrega WhatsApp"
    - "sendAlertaWhatsApp() — wrapper HTTP para Plans 04-02/04-03"
  affects:
    - "packages/database — novo model e campo no schema Prisma"
    - "docker-compose.yml — novo serviço evolution-api"
    - "apps/api — novo serviço whatsapp.ts"
tech_stack:
  added:
    - "Evolution API v2.3.7 (atendai/evolution-api:2.3.7) — Docker container"
    - "fetch nativo Node 18+ — sem nova dependência npm"
  patterns:
    - "Never-throw service wrapper — retorna WhatsAppSendResult { success, messageId?, error? }"
    - "Named Prisma relation PlacaClassificacaoObra — evita ambiguidade com múltiplas relações Placa→Obra"
    - "EVOLUTION_API_KEY via env var — chave nunca hardcoded (T-04-01)"
key_files:
  created:
    - "apps/api/src/services/whatsapp.ts"
    - "apps/api/src/services/whatsapp.test.ts"
  modified:
    - "packages/database/prisma/schema.prisma"
    - "docker-compose.yml"
decisions:
  - "atendai/evolution-api:2.3.7 HARD-PINNED — nunca 2.4.0+ (requer license server externo)"
  - "fetch nativo Node 18+ em vez de axios — zero nova dependência npm"
  - "sendAlertaWhatsApp nunca lança exceção — retorna WhatsAppSendResult para facilitar uso em BullMQ workers"
  - "normalizePhone exportada separadamente — testável de forma isolada"
  - "evolution-api sem labels Traefik — acesso apenas via rede interna sentinel (T-04-04)"
  - "api.depends_on evolution-api:service_started — garante container disponível antes do Express iniciar"
metrics:
  duration: "3 min"
  completed_date: "2026-06-21"
  tasks_completed: 3
  tasks_total: 3
  files_created: 2
  files_modified: 2
---

# Phase 4 Plan 01: Schema + Evolution API Service Summary

**One-liner:** Schema Prisma estendido com `obraClassificacaoId` e `ConfiguracaoAlerta`, Evolution API v2.3.7 adicionado ao docker-compose com acesso interno apenas, e wrapper `sendAlertaWhatsApp()` com 7 testes unitários passando.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Atualizar schema Prisma — obraClassificacaoId + ConfiguracaoAlerta | 9742cdf | packages/database/prisma/schema.prisma |
| 2 | Evolution API v2.3.7 no docker-compose | 5e39f51 | docker-compose.yml |
| 3 | WhatsApp service wrapper com testes | 976d052 | apps/api/src/services/whatsapp.ts, apps/api/src/services/whatsapp.test.ts |

## Schema Changes

### Campo adicionado: `Placa.obraClassificacaoId`

```prisma
obraClassificacaoId String?
obraClassificacao   Obra?  @relation("PlacaClassificacaoObra", fields: [obraClassificacaoId], references: [id])
```

- Opcional (`String?`) — placas existentes sem classificação manual continuam funcionando
- Named relation `PlacaClassificacaoObra` — necessário porque `Placa` agora tem duas relações com `Obra` (via `Evento.obraId` e direta)
- Serve como mecanismo central de detecção cross-site no Plan 04-02: `evento.obraId != placa.obraClassificacaoId`

### Model criado: `ConfiguracaoAlerta`

```prisma
model ConfiguracaoAlerta {
  id        String   @id @default(cuid())
  obraId    String
  empresaId String
  telefone  String   // E.164: +5511999999999
  ativo     Boolean  @default(true)
  createdAt DateTime @default(now())
  obra      Obra     @relation(fields: [obraId], references: [id])
  empresa   Empresa  @relation(fields: [empresaId], references: [id])

  @@unique([obraId, telefone])  // ALERTS-05: sem duplicata por obra
  @@index([empresaId])
  @@index([obraId])
}
```

- `@@unique([obraId, telefone])` implementa ALERTS-05 nativamente no banco
- `empresaId` denormalizado para queries cross-tenant eficientes
- Relações inversas adicionadas em `Obra.configuracoes` e `Empresa.configuracoes`

### Relações inversas adicionadas

```prisma
// Obra
configuracoes       ConfiguracaoAlerta[]
placasClassificadas Placa[] @relation("PlacaClassificacaoObra")

// Empresa
configuracoes ConfiguracaoAlerta[]
```

## Evolution API Docker Service

Tag exata confirmada: `atendai/evolution-api:2.3.7`

Configuração de segurança aplicada:
- Sem labels Traefik — container não roteado pelo proxy reverso (T-04-04)
- Sem exposição de porta no host — apenas acessível via rede Docker `sentinel`
- `AUTHENTICATION_API_KEY` via `${EVOLUTION_API_KEY}` — nunca hardcoded (T-04-01)
- `DATABASE_ENABLED: "false"` — usa Redis para sessões (sem dependência adicional de DB)

O serviço `api` recebe as env vars:
```yaml
EVOLUTION_API_URL: http://evolution-api:8080
EVOLUTION_API_KEY: ${EVOLUTION_API_KEY}
EVOLUTION_INSTANCE_NAME: ${EVOLUTION_INSTANCE_NAME:-cargo-sentinel}
```

## WhatsApp Service Interface

```typescript
export interface WhatsAppSendResult {
  success: boolean;
  messageId?: string;
  error?: string;
}

export function normalizePhone(telefone: string): string
export async function sendAlertaWhatsApp(telefone: string, mensagem: string): Promise<WhatsAppSendResult>
```

Padrão de retorno para consumidores (Plan 04-02 alert-worker):
```typescript
const result = await sendAlertaWhatsApp(telefone, mensagem);
if (!result.success) {
  logger.error({ error: result.error }, 'WhatsApp alert failed');
  // não relançar — BullMQ gerencia retry
}
```

## Test Results

```
Tests  7 passed (7)
  normalizePhone
    ✓ strips leading + from E.164 number
    ✓ leaves number without + unchanged
  sendAlertaWhatsApp
    ✓ returns failure when EVOLUTION_API_URL is not set
    ✓ returns failure when EVOLUTION_API_KEY is not set
    ✓ returns success with messageId on 200 response
    ✓ returns failure with error string on non-200 HTTP response
    ✓ returns failure on network error
```

## Deviations from Plan

### Auto-fixed Issues

Nenhum — plano executado exatamente como escrito.

**Nota:** O plano previa 6 testes, mas o arquivo de teste implementado tem 7 (sendAlertaWhatsApp tem 5 casos, não 4 — separou `EVOLUTION_API_KEY` missing em teste próprio). Todos passando.

## Requirements Addressed

| REQ-ID | Status |
|--------|--------|
| INTEL-01 | Fundação: `obraClassificacaoId` disponível para worker de detecção |
| INTEL-02 | Fundação: campo para comparar obra de classificação vs obra atual |
| ALERTS-01 | Completo: Evolution API v2.3.7 container no docker-compose |
| ALERTS-05 | Completo: `@@unique([obraId, telefone])` no ConfiguracaoAlerta |
| ALERTS-06 | Fundação: model ConfiguracaoAlerta pronto para CRUD no Plan 04-04 |

## Known Stubs

Nenhum — este plano cria infraestrutura (schema, docker, service), não UI ou dados mock.

## Threat Flags

| Flag | File | Description |
|------|------|-------------|
| threat_flag: env_var_required | docker-compose.yml | `EVOLUTION_API_KEY` e `EVOLUTION_INSTANCE_NAME` precisam ser adicionados ao `.env.example` — documentar antes do deploy |

## Self-Check: PASSED

- packages/database/prisma/schema.prisma — FOUND, `prisma validate` OK
- docker-compose.yml — FOUND, `atendai/evolution-api:2.3.7` presente
- apps/api/src/services/whatsapp.ts — FOUND
- apps/api/src/services/whatsapp.test.ts — FOUND, 7/7 testes passando
- Commits: 9742cdf, 5e39f51, 976d052 — todos presentes em `git log`
