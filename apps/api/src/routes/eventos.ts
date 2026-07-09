import { Router, type Router as RouterType } from 'express';
import { getThumbnailProxyUrl } from '../services/garage';
import { requireRole } from '../middleware/rbac';
import { eventoToFeedItem } from '../realtime/dto';

const router: RouterType = Router();

/**
 * GET /api/eventos/buscar
 *
 * Busca cross-filter de eventos com cursor pagination (HISTORY-03, HISTORY-04).
 * Filtros: placa (partial, case-insensitive), dataInicio, dataFim, obraId, cameraId.
 * Sem filtros, retorna os 20 eventos mais recentes da empresa.
 *
 * ATENÇÃO: rota estática /buscar registrada ANTES de qualquer rota parametrizada /:id
 * para evitar que "buscar" seja interpretado como um ID.
 */
router.get(
  '/buscar',
  requireRole('SUPER_ADMIN', 'ADMIN_EMPRESA', 'OPERADOR'),
  async (req, res) => {
    const rawLimit = Number(req.query.limit ?? 20);
    const limit = Number.isFinite(rawLimit) ? Math.min(Math.max(rawLimit, 1), 100) : 20;
    const cursor = typeof req.query.cursor === 'string' ? req.query.cursor.trim() : undefined;
    const placa = typeof req.query.placa === 'string' ? req.query.placa.trim() : undefined;
    const obraId = typeof req.query.obraId === 'string' ? req.query.obraId.trim() : undefined;
    const cameraId = typeof req.query.cameraId === 'string' ? req.query.cameraId.trim() : undefined;
    const dataInicio = typeof req.query.dataInicio === 'string' ? new Date(req.query.dataInicio) : undefined;
    const dataFim = typeof req.query.dataFim === 'string' ? new Date(req.query.dataFim) : undefined;

    const where: Record<string, unknown> = {
      ...(placa && { placaNumero: { contains: placa, mode: 'insensitive' } }),
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
      where,
      take: limit + 1,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      orderBy: { timestamp: 'desc' },
      select: {
        id: true,
        timestamp: true,
        placaNumero: true,
        placaId: true,
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
        placaNumero: e.placaNumero,
        placaId: e.placaId,
        direcao: e.direcao,
        classificacao: e.classificacao,
        thumbnailUrl: e.fotoGarageKey ? getThumbnailProxyUrl(e.fotoGarageKey) : null,
        obra: e.obra,
        camera: e.camera,
      })),
    );

    res.json({ items, nextCursor: hasMore ? page[page.length - 1]?.id ?? null : null });
  },
);

/**
 * GET /api/eventos/feed?limit=50&cursor=<eventoId>
 *
 * Cursor-based paginated feed scoped to the authenticated tenant.
 * Uses tenantClient so empresaId is always filtered server-side.
 *
 * Cursor: opaque evento ID.  Items with id < cursor (keyset after last seen)
 * are returned by ordering timestamp DESC and using cursor as a "before" pivot.
 * Clients pass the `id` of the last item received as the next cursor.
 *
 * nextCursor is null when fewer items than `limit` were returned.
 */
router.get(
  '/feed',
  requireRole('SUPER_ADMIN', 'ADMIN_EMPRESA', 'OPERADOR'),
  async (req, res) => {
    const rawLimit = Number(req.query.limit ?? 20);
    const limit = Number.isFinite(rawLimit) ? Math.min(Math.max(rawLimit, 1), 100) : 20;
    const cursor = typeof req.query.cursor === 'string' ? req.query.cursor.trim() : undefined;

    const eventos = await req.tenantClient!.evento.findMany({
      where: {},
      // Fetch one extra to detect if a next page exists
      take: limit + 1,
      ...(cursor
        ? {
            cursor: { id: cursor },
            skip: 1, // skip the cursor item itself
          }
        : {}),
      orderBy: { timestamp: 'desc' },
      select: {
        id: true,
        timestamp: true,
        placaId: true,
        placaNumero: true,
        classificacao: true,
        direcao: true,
        fotoGarageKey: true,
        obra: {
          select: { id: true, nome: true },
        },
        camera: {
          select: { id: true, codigoLpr: true },
        },
      },
    });

    const hasMore = eventos.length > limit;
    const page = hasMore ? eventos.slice(0, limit) : eventos;

    const items = await Promise.all(
      page.map((evento) => {
        const thumbnailUrl = evento.fotoGarageKey
          ? getThumbnailProxyUrl(evento.fotoGarageKey)
          : null;
        return eventoToFeedItem(evento, thumbnailUrl);
      }),
    );

    const nextCursor = hasMore ? page[page.length - 1]?.id ?? null : null;

    res.json({ items, nextCursor });
  },
);

export default router;
