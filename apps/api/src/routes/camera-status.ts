import { Router, type Router as RouterType } from 'express';
import { requireRole } from '../middleware/rbac';

const ONLINE_WINDOW_MS = 5 * 60 * 1000;

const router: RouterType = Router();

router.get(
  '/status',
  requireRole('SUPER_ADMIN', 'ADMIN_EMPRESA', 'OPERADOR'),
  async (req, res) => {
    const cameras = await req.tenantClient!.camera.findMany({
      where: { ativo: true },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        codigoLpr: true,
        ip: true,
        createdAt: true,
        obra: {
          select: { id: true, nome: true },
        },
      },
    });

    const latestByCamera =
      cameras.length === 0
        ? []
        : await req.tenantClient!.evento.groupBy({
            by: ['cameraId'],
            where: { cameraId: { in: cameras.map((camera) => camera.id) } },
            _max: { timestamp: true },
          });

    const latestMap = new Map(
      latestByCamera.map((item) => [item.cameraId, item._max.timestamp ?? null]),
    );

    const now = Date.now();
    const items = cameras.map((camera) => {
      const ultimoEvento = latestMap.get(camera.id) ?? null;
      const ultimoEventoEm = ultimoEvento ? ultimoEvento.toISOString() : null;
      const status =
        ultimoEvento && now - ultimoEvento.getTime() <= ONLINE_WINDOW_MS ? 'online' : 'offline';

      return {
        id: camera.id,
        codigoLpr: camera.codigoLpr,
        ip: camera.ip,
        obra: camera.obra,
        ultimoEventoEm,
        status,
      };
    });

    res.json({ items });
  },
);

export default router;
