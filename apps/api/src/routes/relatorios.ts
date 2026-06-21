import { Router, type Router as RouterType } from 'express';
import { requireRole } from '../middleware/rbac';
import { reportQueue } from '../jobs/queue';
import { getReportPresignedUrl } from '../services/report-generator';
import type { ReportJobPayload } from '../jobs/report-worker';

const router: RouterType = Router();

// ============================================================
// POST /api/relatorios
// Enfileira geração assíncrona e retorna 202 imediatamente.
// REPORTS-01: não bloqueia — BullMQ processa em background.
// REPORTS-04: filtros opcionais validados aqui.
// criadoPor e empresaId SEMPRE do JWT — nunca do body (T-06-12).
// ============================================================
router.post(
  '/',
  requireRole('SUPER_ADMIN', 'ADMIN_EMPRESA', 'OPERADOR'),
  async (req, res) => {
    const { formato, filtros = {} } = req.body as {
      formato: unknown;
      filtros?: {
        dataInicio?: string;
        dataFim?: string;
        obraId?: string;
        cameraId?: string;
        classificacao?: string;
        placa?: string;
      };
    };

    // Validação de formato (T-06-11)
    if (formato !== 'PDF' && formato !== 'XLSX') {
      res.status(400).json({ error: 'formato deve ser PDF ou XLSX' });
      return;
    }

    // Validação de classificação (enum Prisma) (T-06-11)
    const validClassificacoes = ['LIBERADO', 'VISITANTE', 'ATENCAO', 'SUSPEITO', 'CRITICO'];
    if (filtros.classificacao && !validClassificacoes.includes(filtros.classificacao)) {
      res.status(400).json({ error: 'classificacao inválida' });
      return;
    }

    // Validar datas (ISO string)
    if (filtros.dataInicio && Number.isNaN(new Date(filtros.dataInicio).getTime())) {
      res.status(400).json({ error: 'dataInicio inválida' });
      return;
    }
    if (filtros.dataFim && Number.isNaN(new Date(filtros.dataFim).getTime())) {
      res.status(400).json({ error: 'dataFim inválida' });
      return;
    }

    // T-06-12: criadoPor e empresaId SEMPRE do JWT — nunca do body
    const empresaId = req.user!.empresaId;
    const criadoPor = req.user!.id;

    if (!empresaId) {
      res.status(403).json({ error: 'Usuário sem empresa associada' });
      return;
    }

    // Criar registro Relatorio em PENDENTE antes de enfileirar
    const relatorio = await req.tenantClient!.relatorio.create({
      data: {
        empresaId,
        formato,
        filtros: filtros as object,
        criadoPor,
        status: 'PENDENTE',
      },
    });

    // Enfileirar job — REPORTS-01: 202 imediato
    // jobId = relatorioId garante idempotência (T-06-10: mesmo relatorio não gera dois jobs)
    const payload: ReportJobPayload = {
      relatorioId: relatorio.id,
      empresaId,
      formato,
      filtros,
      criadoPor,
    };
    await reportQueue.add(`relatorio-${relatorio.id}`, payload, {
      jobId: relatorio.id,
    });

    res.status(202).json({ relatorioId: relatorio.id });
  },
);

// ============================================================
// GET /api/relatorios
// Lista relatórios do usuário atual com cursor pagination.
// OPERADOR vê apenas os próprios; ADMIN vê da empresa toda.
// ============================================================
router.get(
  '/',
  requireRole('SUPER_ADMIN', 'ADMIN_EMPRESA', 'OPERADOR'),
  async (req, res) => {
    const rawLimit = Number(req.query.limit ?? 20);
    const limit = Number.isFinite(rawLimit) ? Math.min(Math.max(rawLimit, 1), 50) : 20;
    const cursor = typeof req.query.cursor === 'string' ? req.query.cursor.trim() : undefined;
    const role = req.user!.role;
    const userId = req.user!.id;

    // Operador vê apenas os próprios relatórios; Admin e Super Admin veem da empresa toda
    const criadoPorFilter = role === 'OPERADOR' ? { criadoPor: userId } : {};

    const relatorios = await req.tenantClient!.relatorio.findMany({
      where: criadoPorFilter,
      take: limit + 1,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      orderBy: { criadoEm: 'desc' },
      select: {
        id: true,
        formato: true,
        status: true,
        filtros: true,
        expiresAt: true,
        erroMsg: true,
        criadoEm: true,
        // garageKey não exposto diretamente — apenas via /download (T-06-09)
      },
    });

    const hasMore = relatorios.length > limit;
    const page = hasMore ? relatorios.slice(0, limit) : relatorios;

    res.json({
      items: page,
      nextCursor: hasMore ? page[page.length - 1]?.id ?? null : null,
    });
  },
);

// ============================================================
// GET /api/relatorios/:id/download
// Gera presigned URL se relatório PRONTO e não expirado.
// T-06-09: tenantClient garante isolamento; garageKey nunca exposta diretamente.
// REPORTS-07: link expira em 1 hora (expiresAt gravado pelo worker).
// ============================================================
router.get(
  '/:id/download',
  requireRole('SUPER_ADMIN', 'ADMIN_EMPRESA', 'OPERADOR'),
  async (req, res) => {
    const { id } = req.params;

    // tenantClient filtra automaticamente por empresaId (T-06-09)
    const relatorio = await req.tenantClient!.relatorio.findUnique({
      where: { id },
      select: { id: true, status: true, garageKey: true, expiresAt: true },
    });

    // 404 se não existe ou pertence a outro tenant (tenantClient já filtra por empresaId)
    if (!relatorio) {
      res.status(404).json({ error: 'Relatório não encontrado' });
      return;
    }

    if (relatorio.status !== 'PRONTO') {
      res.status(404).json({ error: 'Relatório não está pronto' });
      return;
    }

    if (!relatorio.garageKey || !relatorio.expiresAt) {
      res.status(500).json({ error: 'Estado interno inválido do relatório' });
      return;
    }

    // REPORTS-07: verificar expiração
    if (new Date() > relatorio.expiresAt) {
      res.status(410).json({ error: 'Link expirado — solicite um novo relatório' });
      return;
    }

    // Gerar nova presigned URL (TTL 3600s) — garageKey nunca vai ao cliente (T-06-09)
    const downloadUrl = await getReportPresignedUrl(relatorio.garageKey);

    res.json({
      downloadUrl,
      expiresAt: relatorio.expiresAt.toISOString(),
    });
  },
);

export default router;
