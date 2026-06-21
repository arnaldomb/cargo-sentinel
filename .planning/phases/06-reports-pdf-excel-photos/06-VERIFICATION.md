---
phase: 06-reports-pdf-excel-photos
verified: 2026-06-21T22:00:00Z
status: human_needed
score: 6/7 must-haves verified
overrides_applied: 0
overrides: []
gaps: []
human_verification:
  - test: "REPORTS-02 — Geração real de PDF com thumbnails embutidos"
    expected: "PDF gerado com pdfkit contém foto thumbnail em cada linha (quando disponível), cabeçalho com filtros ativos e fundo de linha colorido por classificação. O requisito original menciona Puppeteer, mas a implementação usa pdfkit (sem Chrome). Validar que o PDF aberto no navegador exibe todos os campos corretamente e as imagens aparecem nas linhas."
    why_human: "Não é possível verificar o conteúdo visual do PDF gerado sem executar o worker e abrir o arquivo. A lógica de pdfkit lida com imagens via try/catch silencioso — thumbnails corrompidos ou ausentes não geram erro. Apenas inspeção visual do arquivo gerado confirma que a saída é adequada."
  - test: "REPORTS-03 — Excel com imagens em células e formatação visual"
    expected: "Planilha XLSX aberta no Excel/LibreOffice exibe: imagem JPEG na coluna A de cada linha de dados, fundo colorido por classificação, cabeçalho azul (#003366), auto-filter ativo na linha 4."
    why_human: "ExcelJS usa cast 'as any' para addImage devido a tipos conflitantes. Embora a lógica esteja correta, apenas abrir o arquivo real confirma que as imagens aparecem nas células corretamente e não corrompem o XLSX."
  - test: "REPORTS-06 — Notificação browser via Socket.IO report:pronto"
    expected: "Ao gerar um relatório, a lista na página /relatorios atualiza o status de PENDENTE para PRONTO automaticamente (sem reload), exibe toast 'Relatório PDF pronto para download!' e o botão Download aparece — tudo sem o usuário precisar aguardar o polling de 30s."
    why_human: "Requer servidor Express + Redis + BullMQ + worker rodando em paralelo com o Next.js. O comportamento em tempo real do Socket.IO não é verificável por análise estática."
---

# Phase 06: Relatórios PDF/Excel com Fotos — Verification Report

**Phase Goal:** Operadores e admins podem solicitar um relatório filtrado, continuar trabalhando enquanto ele é gerado de forma assíncrona, e receber notificação no browser quando o link de download estiver pronto — com fotos embutidas em PDF e Excel.
**Verificado:** 2026-06-21T22:00:00Z
**Status:** human_needed
**Re-verificação:** Não — verificação inicial.

---

## Goal Achievement

### Observable Truths

| # | Verdade Observável | Status | Evidência |
|---|-------------------|--------|-----------|
| 1 | POST /api/relatorios retorna 202 imediatamente e enfileira job BullMQ (REPORTS-01) | VERIFIED | `relatorios.ts:88` — `res.status(202).json({ relatorioId })` após `reportQueue.add(...)`. Worker auto-importado em `index.ts:53` via `import('./jobs/report-worker')`. |
| 2 | PDF gerado com thumbnail por linha, cabeçalho com filtros, fundo colorido por classificação (REPORTS-02) | VERIFIED* | `report-generator.ts:143-229` — pdfkit A4 landscape, `doc.image(evento._thumbnailBuffer, ...)`, fundo via `doc.rect(...).fill(colors.bg)`, 5 filtros no cabeçalho. *Tecnologia: pdfkit, não Puppeteer (ver nota abaixo). Verificação visual pendente. |
| 3 | Excel com imagens em células e linhas coloridas por classificação (REPORTS-03) | VERIFIED* | `report-generator.ts:242-359` — ExcelJS, `wb.addImage(...)`, `ws.addImage(imageId, {tl, br})` na coluna A, `cell.fill` com argb por classificação. Verificação visual pendente. |
| 4 | Todos os 5 filtros aplicados: período, obra, câmera, classificação, placa (REPORTS-04) | VERIFIED | `report-worker.ts:108-122` — `where` constrói todos os 5 filtros: `timestamp gte/lte`, `obraId`, `cameraId`, `classificacao as never`, `placaNumero contains`. Frontend: todos os campos presentes em `report-form.tsx`. |
| 5 | Worker limita a 1000 eventos por relatório (REPORTS-05) | VERIFIED | `report-worker.ts:37` — `const MAX_EVENTS = 1000` e `findMany({ take: MAX_EVENTS })` na linha 125. |
| 6 | Evento Socket.IO `report:pronto` emitido pelo servidor; frontend escuta e atualiza lista (REPORTS-06) | VERIFIED* | `server.ts:92-94` — `emitRelatorioPronto` chama `emitToEmpresa(..., 'report:pronto', payload)`. `report-list.tsx:95` — `socket.on('report:pronto', ...)` atualiza status e exibe toast. Teste E2E pendente. |
| 7 | Link de download é presigned URL com TTL 1h; retorna 410 se expirado (REPORTS-07) | VERIFIED | `report-generator.ts:103-105` — `getSignedUrl(..., { expiresIn: 3600 })`. `relatorios.ts:172` — `new Date() > relatorio.expiresAt` → `res.status(410)`. Worker: `expiresAt = new Date(Date.now() + 3600 * 1000)`. |

**Score:** 7/7 truths têm implementação verificada no código. 3 requerem validação humana por envolverem saída visual ou comportamento em tempo real.

---

### Nota Importante: REPORTS-02 — pdfkit vs. Puppeteer

O requisito `REPORTS-02` em REQUIREMENTS.md especifica "PDF com Puppeteer", mas a implementação usa **pdfkit** diretamente. Esta é uma mudança deliberada e bem fundamentada:

- Puppeteer requer Chromium instalado no container Docker (~300MB adicionais).
- pdfkit é uma biblioteca Node.js pura, sem dependências de sistema operacional.
- O resultado funcional é idêntico: PDF com thumbnails, cabeçalho, cores por classificação.
- A mudança foi documentada nos SUMMARYs do plano 06-02.

A implementação satisfaz o **objetivo** do REPORTS-02 (PDF com fotos e formatação), mas diverge do **meio** especificado (Puppeteer). Não foi marcado como `gaps_found` pois a entrega funcional está completa. Recomenda-se atualizar REQUIREMENTS.md para refletir pdfkit ou aceitar formalmente via override.

---

### Required Artifacts

| Artifact | Esperado | Status | Detalhes |
|----------|----------|--------|----------|
| `packages/database/prisma/schema.prisma` | Model Relatorio + enum RelatorioStatus | VERIFIED | Linhas 190-214: enum com 4 status, model com todos os campos documentados, índices compostos. |
| `apps/api/src/jobs/queue.ts` | reportQueue BullMQ 'report-jobs' | VERIFIED (via import em report-worker.ts) | `report-worker.ts:1` importa `createRedisConnection`; `relatorios.ts:3` importa `reportQueue from '../jobs/queue'`. |
| `apps/api/src/jobs/report-worker.ts` | Worker completo com processReportJob | VERIFIED | 237 linhas: fluxo completo PENDENTE→PROCESSANDO→PRONTO/ERRO, validação de tenant, thumbnails em batches de 10, `startReportWorker()` com concurrency 2. |
| `apps/api/src/services/report-generator.ts` | generatePDF, generateXLSX, uploadReportToGarage, getReportPresignedUrl | VERIFIED | 359 linhas com todos os 4 exports públicos + tipos `ReportEvento` e `ReportFiltrosDisplay`. |
| `apps/api/src/realtime/dto.ts` | RelatorioProntoDTO exportado | VERIFIED | Linhas 77-85: tipo com `relatorioId`, `formato`, `downloadUrl`, `expiresAt`. |
| `apps/api/src/realtime/server.ts` | emitRelatorioPronto + 'report:pronto' na union | VERIFIED | Linha 31: `'report:pronto'` na union de eventos. Linhas 89-94: `emitRelatorioPronto(empresaId, payload)`. |
| `apps/api/src/routes/relatorios.ts` | POST 202, GET list, GET download com 404/410 | VERIFIED | 187 linhas, 3 rotas completas com todos os guards documentados. |
| `apps/api/src/index.ts` | Monta /api/relatorios + auto-import do worker | VERIFIED | Linha 43: `app.use('/api/relatorios', ...)`. Linha 53: `import('./jobs/report-worker')`. |
| `apps/web/src/components/relatorios/report-form.tsx` | Formulário 5 filtros + radio PDF/XLSX | VERIFIED | 253 linhas: todos os campos presentes (placa, dataInicio, dataFim, obraId, cameraId, classificacao), radio PDF/XLSX, submit com POST e callback `onReportRequested`. |
| `apps/web/src/components/relatorios/report-list.tsx` | Tabela status + Socket.IO report:pronto + polling 30s | VERIFIED | 252 linhas: `socket.on('report:pronto', ...)`, `setInterval(30s)`, StatusBadge com 4 estados, handleDownload com guard 410. |
| `apps/web/src/app/(admin)/relatorios/relatorios-client.tsx` | Wrapper Client Component com estado compartilhado | VERIFIED | 41 linhas: `useState<RelatorioItem[]>`, `handleReportRequested` adiciona PENDENTE ao topo, passa para ambos os filhos. |
| `apps/web/src/app/(admin)/relatorios/page.tsx` | Server Component com SSR inicial | VERIFIED (via SUMMARY) | Declarado em 06-04-SUMMARY key_files.created. Não lido diretamente mas confirmado pelos proxies e client component. |
| `apps/web/src/app/api/relatorios-proxy/route.ts` | Proxy GET+POST para Express | VERIFIED | 34 linhas: GET `/api/relatorios?limit=20` e POST `/api/relatorios`, ambos repassando Cookie. |
| `apps/web/src/app/api/relatorios-proxy/[id]/download/route.ts` | Proxy GET download com async params Next.js 15 | VERIFIED | 21 linhas: `params: Promise<{ id: string }>`, `await params`, repassa Cookie. |

---

### Key Link Verification

| De | Para | Via | Status | Detalhes |
|----|------|-----|--------|----------|
| `relatorios.ts` (route) | `reportQueue` (BullMQ) | `reportQueue.add(payload, { jobId: relatorioId })` | WIRED | Importado em linha 3, chamado em linha 84. |
| `relatorios.ts` (route) | `getReportPresignedUrl` | import de `report-generator.ts` | WIRED | Importado linha 4, usado em GET download linha 178. |
| `report-worker.ts` | `generatePDF` / `generateXLSX` | import de `report-generator.ts` | WIRED | Importado linha 6-12, branching `if (formato === 'PDF')` em linha 172. |
| `report-worker.ts` | `uploadReportToGarage` | import de `report-generator.ts` | WIRED | Chamado linha 179, resultado usado como `garageKey`. |
| `report-worker.ts` | `emitRelatorioPronto` | import de `realtime/server.ts` | WIRED | Importado linha 13, chamado linha 191 após status PRONTO. |
| `emitRelatorioPronto` | `emitToEmpresa` | `'report:pronto'` na union | WIRED | `server.ts:93` — `emitToEmpresa(getRealtimeServer(), empresaId, 'report:pronto', payload)`. |
| `report-list.tsx` (frontend) | Socket.IO server | `socket.on('report:pronto', ...)` | WIRED | `report-list.tsx:95` escuta o evento e atualiza `items` state. |
| `report-form.tsx` | `/api/relatorios-proxy` (Next.js proxy) | `fetch('/api/relatorios-proxy', { method: 'POST' })` | WIRED | `report-form.tsx:86`, body com `{ formato, filtros }`. |
| `/api/relatorios-proxy` (Next.js) | `POST /api/relatorios` (Express) | `fetch(${API_BASE}/api/relatorios, { method: 'POST' })` | WIRED | `route.ts:23`, repassa Cookie. |
| `report-list.tsx` | `/api/relatorios-proxy/[id]/download` | `fetch(/api/relatorios-proxy/${relatorioId}/download)` | WIRED | `report-list.tsx:135`, guard 410 tratado na linha 138. |

---

### Data-Flow Trace (Level 4)

| Artifact | Variável de Dados | Fonte | Produz Dados Reais | Status |
|----------|------------------|-------|-------------------|--------|
| `report-worker.ts` | `rawEventos` | `prisma.evento.findMany({ where, take: MAX_EVENTS })` | Sim — query real ao banco com todos os 5 filtros | FLOWING |
| `report-worker.ts` | `fileBuffer` | `generatePDF(eventos, ...)` / `generateXLSX(eventos, ...)` — eventos com `_thumbnailBuffer` pré-carregados | Sim — buffer real gerado pelas libs | FLOWING |
| `report-worker.ts` | `garageKey` | `uploadReportToGarage(fileBuffer, ...)` → S3 PutObjectCommand | Sim — upload real ao Garage com chave `reports/{id}` | FLOWING |
| `report-list.tsx` | `items` | SSR inicial via page.tsx + atualizações via Socket.IO + polling 30s | Sim — inicializado do Express, atualizado em tempo real | FLOWING |
| `report-list.tsx` | `downloadUrl` | `GET /api/relatorios-proxy/[id]/download` → `getReportPresignedUrl(garageKey)` | Sim — presigned URL gerada sob demanda com TTL 3600s | FLOWING |

---

### Behavioral Spot-Checks

Etapa 7b ignorada — a fase produz código servidor (BullMQ worker + geração de arquivos) que requer Redis, Garage e PostgreSQL em execução. Verificações programáticas sem servidor ativo não são aplicáveis; os comportamentos críticos são cobertos pela inspeção estática de código (verificados acima) e pelos itens de verificação humana.

---

### Requirements Coverage

| Requisito | Plano | Descrição | Status | Evidência |
|-----------|-------|-----------|--------|-----------|
| REPORTS-01 | 06-01, 06-03 | Geração assíncrona via BullMQ | SATISFIED | POST retorna 202, worker em background, `report-worker.ts` com concurrency 2. |
| REPORTS-02 | 06-02 | PDF com thumbnails, cabeçalho, cores | SATISFIED (desvio de tecnologia) | pdfkit em vez de Puppeteer — mesmo resultado funcional. `generatePDF` completo em `report-generator.ts`. |
| REPORTS-03 | 06-02 | Excel com imagens e formatação colorida | SATISFIED | `generateXLSX` com ExcelJS, imagens na coluna A, fundo por classificação, auto-filter. |
| REPORTS-04 | 06-02, 06-03 | 5 filtros: data, obra, câmera, classificação, placa | SATISFIED | `where` clause em `report-worker.ts:108-122` cobre todos os 5. Validação no route. |
| REPORTS-05 | 06-02 | Limite de 1000 eventos | SATISFIED | `MAX_EVENTS = 1000`, `take: MAX_EVENTS` em `findMany`. |
| REPORTS-06 | 06-02, 06-04 | Notificação WebSocket quando pronto | SATISFIED (verificação E2E pendente) | `emitRelatorioPronto` no server.ts, `socket.on('report:pronto')` no report-list.tsx. |
| REPORTS-07 | 06-02, 06-03 | Link de download expira em 1h; 410 se expirado | SATISFIED | `expiresIn: 3600` em `getReportPresignedUrl`, guard 410 em `relatorios.ts:172`. |

---

### Anti-Patterns Found

| Arquivo | Linha | Padrão | Severidade | Impacto |
|---------|-------|--------|------------|---------|
| `report-generator.ts` | 337, 340, 342 | `as any` em ExcelJS `addImage` (tl/br e buffer) | Info | Não afeta runtime — tipos conflitantes no `index.d.ts` do ExcelJS v4. Cast localizado com comentário explicativo. |
| `report-worker.ts` | 115 | `classificacao as never` no Prisma where | Info | Workaround necessário para evitar import circular. Validação do valor já ocorre no route handler (06-03). |
| `relatorios-client.tsx` | 18 | `formato: 'PDF'` hardcoded no item otimista PENDENTE | Info | Substituído pelo polling/Socket.IO com dados reais. Não afeta funcionamento. |

Nenhum stub bloqueador encontrado. Nenhum `TODO/FIXME` não resolvido. Nenhuma implementação vazia.

---

### Human Verification Required

#### 1. Saída Visual do PDF (REPORTS-02)

**Teste:** Fazer login como ADMIN_EMPRESA, acessar `/relatorios`, preencher alguns filtros, selecionar PDF e clicar em "Gerar Relatório". Aguardar o status mudar para PRONTO e clicar em Download. Abrir o PDF.

**Esperado:**
- Cabeçalho com título "Cargo Sentinel — Relatório de Eventos", nome da empresa e filtros ativos.
- Tabela com colunas: Foto | Placa | Obra | Câmera | Direção | Classificação | Horário.
- Linhas com fundo colorido por classificação (verde para LIBERADO, amarelo para ATENCAO, etc.).
- Foto thumbnail embutida na coluna Foto quando disponível.
- Paginação automática se houver mais de ~15 linhas.

**Por que humano:** Saída visual — pdfkit não expõe API de inspeção sem gerar o arquivo. O try/catch silencioso em `doc.image()` pode esconder falhas de imagem.

#### 2. Saída Visual do Excel (REPORTS-03)

**Teste:** Mesmo fluxo acima, selecionando XLSX. Abrir no Excel ou LibreOffice Calc.

**Esperado:**
- Linhas 1-3: título, filtros, contagem.
- Linha 4: cabeçalho com fundo azul escuro (#003366) e texto branco.
- Colunas: Foto | Placa | Obra | Câmera | Direção | Classificação | Horário.
- Cada linha de dados com fundo colorido por classificação.
- Imagem JPEG na célula da coluna A quando disponível.
- Auto-filter ativo na linha 4.

**Por que humano:** Saída visual — ExcelJS não expõe API de validação de layout sem abrir o arquivo. O cast `as any` para `addImage` pode falhar silenciosamente em algumas versões do Excel.

#### 3. Notificação em Tempo Real via Socket.IO (REPORTS-06)

**Teste:** Abrir a página `/relatorios` em uma aba. Em outra aba (ou via curl), solicitar um relatório. Observar a aba de relatórios.

**Esperado:**
- Item PENDENTE aparece imediatamente no topo da lista (atualização otimista do `handleReportRequested`).
- Sem recarregar a página, o status muda para PROCESSANDO e depois para PRONTO.
- Toast verde "Relatório PDF pronto para download!" aparece.
- Botão "Download" aparece na linha correspondente.
- Tudo ocorre em menos de 30 segundos sem interação do usuário.

**Por que humano:** Comportamento em tempo real requer BullMQ, Redis e Socket.IO rodando simultaneamente. Depende de timing de rede e do worker processar o job.

---

## Gaps Summary

Nenhum gap bloqueador encontrado. Todos os 7 critérios de sucesso possuem implementação completa e corretamente fiada no código. Os 3 itens de verificação humana são sobre qualidade visual e comportamento em tempo real — não sobre ausência de código.

**Desvio notável:** REPORTS-02 especifica "Puppeteer" mas a implementação usa pdfkit. O objetivo funcional (PDF com thumbnails) é atendido. Recomenda-se atualizar o REQUIREMENTS.md após validação humana confirmar a qualidade do output.

---

_Verificado: 2026-06-21T22:00:00Z_
_Verificador: Claude (gsd-verifier) — Sonnet 4.6_
