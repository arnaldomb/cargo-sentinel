import { Router, type Router as RouterType } from 'express';
import { requireRole } from '../middleware/rbac';
import { getLastCameraHeartbeat, isCameraOnline } from '../lpr/heartbeat';

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

    const now = Date.now();
    const items = cameras.map((camera) => {
      const lastHeartbeat = getLastCameraHeartbeat(camera.codigoLpr);
      const ultimoEventoEm = lastHeartbeat ? lastHeartbeat.toISOString() : null;
      const status = isCameraOnline(camera.codigoLpr, now) ? 'online' : 'offline';

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
