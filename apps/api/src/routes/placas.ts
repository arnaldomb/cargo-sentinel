import { Router, type Router as RouterType } from 'express';
import { requireRole } from '../middleware/rbac';
import { emitPlacaClassificada } from '../realtime/server';
import { getPresignedUrl } from '../services/garage';

const CLASSIFICACOES = ['LIBERADO', 'VISITANTE', 'ATENCAO', 'SUSPEITO', 'CRITICO'] as const;
type ClassificacaoValue = (typeof CLASSIFICACOES)[number];

const router: RouterType = Router();

router.patch(
  '/:placaId/classificacao',
  requireRole('ADMIN_EMPRESA', 'OPERADOR'),
  async (req, res) => {
    const { placaId } = req.params;
    const { classificacao, observacao } = req.body as {
      classificacao?: string;
      observacao?: string;
    };

    if (!classificacao || !CLASSIFICACOES.includes(classificacao as (typeof CLASSIFICACOES)[number])) {
      return res.status(400).json({ error: 'Classificação inválida' });
    }
    const classificacaoFinal = classificacao as ClassificacaoValue;

    try {
      const placaAtual = await req.tenantClient!.placa.findFirstOrThrow({
        where: { id: placaId },
        select: { id: true, empresaId: true, classificacao: true, observacao: true },
      });

      // INTEL-02: ao classificar como SUSPEITO/CRITICO, registrar a obra de origem
      // via o evento mais recente da placa (melhor esforço — sem evento não seta)
      let obraClassificacaoUpdate: { obraClassificacaoId: string } | Record<string, never> = {};
      if (classificacaoFinal === 'SUSPEITO' || classificacaoFinal === 'CRITICO') {
        const ultimoEvento = await req.tenantClient!.evento.findFirst({
          where: { placaId },
          orderBy: { timestamp: 'desc' },
          select: { obraId: true },
        });
        if (ultimoEvento) {
          obraClassificacaoUpdate = { obraClassificacaoId: ultimoEvento.obraId };
        }
      }

      const placa = await req.tenantClient!.placa.update({
        where: { id: placaId },
        data: {
          classificacao: classificacaoFinal,
          observacao: observacao?.trim() || null,
          ...obraClassificacaoUpdate,
        },
        select: {
          id: true,
          numero: true,
          empresaId: true,
          classificacao: true,
          observacao: true,
          updatedAt: true,
        },
      });

      const auditoria = await req.tenantClient!.classificacaoHistorico.create({
        data: {
          placaId: placa.id,
          empresaId: placa.empresaId,
          classificacaoDe: placaAtual.classificacao,
          classificacaoPara: classificacaoFinal,
          observacao: observacao?.trim() || null,
          usuarioId: req.user!.id,
        },
        select: {
          id: true,
          createdAt: true,
          classificacaoDe: true,
          classificacaoPara: true,
          usuarioId: true,
        },
      });

      emitPlacaClassificada(placa.empresaId, {
        placaId: placa.id,
        numero: placa.numero,
        classificacao: placa.classificacao,
        observacao: placa.observacao,
        updatedAt: placa.updatedAt.toISOString(),
        auditoria,
      });

      return res.json({
        placa,
        auditoria,
      });
    } catch (err: unknown) {
      const code = (err as { code?: string })?.code;
      if (code === 'P2025') return res.status(404).json({ error: 'Placa não encontrada' });
      throw err;
    }
  },
);

/**
 * GET /api/placas/:numero/historico
 *
 * Retorna eventos paginados (cursor-based) da placa em toda a empresa.
 * Filtros opcionais: obraId, cameraId, dataInicio, dataFim, cursor, limit.
 * HISTORY-01, HISTORY-04
 */
router.get(
  '/:numero/historico',
  requireRole('SUPER_ADMIN', 'ADMIN_EMPRESA', 'OPERADOR'),
  async (req, res) => {
    const numero = req.params.numero.toUpperCase().trim();
    const rawLimit = Number(req.query.limit ?? 20);
    const limit = Number.isFinite(rawLimit) ? Math.min(Math.max(rawLimit, 1), 100) : 20;
    const cursor = typeof req.query.cursor === 'string' ? req.query.cursor.trim() : undefined;
    const obraId = typeof req.query.obraId === 'string' ? req.query.obraId.trim() : undefined;
    const cameraId = typeof req.query.cameraId === 'string' ? req.query.cameraId.trim() : undefined;
    const dataInicio = typeof req.query.dataInicio === 'string' ? new Date(req.query.dataInicio) : undefined;
    const dataFim = typeof req.query.dataFim === 'string' ? new Date(req.query.dataFim) : undefined;

    // Resolve placaId a partir do número (tenantClient já filtra empresaId)
    const placa = await req.tenantClient!.placa.findFirst({
      where: { numero },
      select: {
        id: true,
        numero: true,
        classificacao: true,
        empresaTransportadora: true,
        motorista: true,
        tipoVeiculo: true,
        observacao: true,
      },
    });

    if (!placa) return res.status(404).json({ error: 'Placa não encontrada' });

    const whereFilters: Record<string, unknown> = {
      placaId: placa.id,
      ...(obraId && { obraId }),
      ...(cameraId && { cameraId }),
      ...(dataInicio || dataFim
        ? {
            timestamp: {
              ...(dataInicio && { gte: dataInicio }),
              ...(dataFim && { lte: dataFim }),
            },
          }
        : {}),
    };

    const eventos = await req.tenantClient!.evento.findMany({
      where: whereFilters,
      take: limit + 1,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      orderBy: { timestamp: 'desc' },
      select: {
        id: true,
        timestamp: true,
        direcao: true,
        fotoGarageKey: true,
        classificacao: true,
        obra: { select: { id: true, nome: true } },
        camera: { select: { id: true, codigoLpr: true } },
      },
    });

    const hasMore = eventos.length > limit;
    const page = hasMore ? eventos.slice(0, limit) : eventos;

    const items = await Promise.all(
      page.map(async (e) => ({
        id: e.id,
        timestamp: e.timestamp.toISOString(),
        direcao: e.direcao,
        classificacao: e.classificacao,
        thumbnailUrl: e.fotoGarageKey ? await getPresignedUrl(e.fotoGarageKey) : null,
        obra: e.obra,
        camera: e.camera,
      })),
    );

    return res.json({
      placa,
      items,
      nextCursor: hasMore ? page[page.length - 1]?.id ?? null : null,
    });
  },
);

/**
 * GET /api/placas/:numero/classificacoes
 *
 * Retorna audit trail cronológico de classificação com nome do usuário responsável.
 * HISTORY-02
 */
router.get(
  '/:numero/classificacoes',
  requireRole('SUPER_ADMIN', 'ADMIN_EMPRESA', 'OPERADOR'),
  async (req, res) => {
    const numero = req.params.numero.toUpperCase().trim();

    const placa = await req.tenantClient!.placa.findFirst({
      where: { numero },
      select: { id: true, numero: true, classificacao: true },
    });

    if (!placa) return res.status(404).json({ error: 'Placa não encontrada' });

    const historico = await req.tenantClient!.classificacaoHistorico.findMany({
      where: { placaId: placa.id },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        createdAt: true,
        classificacaoDe: true,
        classificacaoPara: true,
        observacao: true,
        usuario: { select: { id: true, nome: true } },
      },
    });

    return res.json({
      placa,
      items: historico.map((h) => ({
        ...h,
        createdAt: h.createdAt.toISOString(),
      })),
    });
  },
);

export default router;
