import { Router, type Router as RouterType } from 'express';
import { getPresignedUrl } from '../services/garage';
import { requireRole } from '../middleware/rbac';
import { eventoToFeedItem } from '../realtime/dto';

const router: RouterType = Router();

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
      page.map(async (evento) => {
        const thumbnailUrl = evento.fotoGarageKey
          ? await getPresignedUrl(evento.fotoGarageKey)
          : null;
        return eventoToFeedItem(evento, thumbnailUrl);
      }),
    );

    const nextCursor = hasMore ? page[page.length - 1]?.id ?? null : null;

    res.json({ items, nextCursor });
  },
);

export default router;
