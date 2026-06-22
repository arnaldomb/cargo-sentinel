import { Router, type Router as RouterType } from 'express';
import { requireRole } from '../middleware/rbac';

const router: RouterType = Router({ mergeParams: true }); // herda :obraId do parent router

/**
 * GET /api/obras/:obraId/cameras
 * Lista câmeras ativas da obra, verificando pertencimento ao tenant via obra.
 * TENANT-06: OPERADOR+ pode listar.
 */
router.get(
  '/',
  requireRole('SUPER_ADMIN', 'ADMIN_EMPRESA', 'OPERADOR'),
  async (req, res) => {
    const { obraId } = req.params;
    try {
      // Verifica que a obra pertence ao tenant (tenantClient injeta WHERE empresaId)
      await req.tenantClient!.obra.findFirstOrThrow({ where: { id: obraId } });
    } catch (err: unknown) {
      const code = (err as { code?: string })?.code;
      if (code === 'P2025') return res.status(404).json({ error: 'Obra não encontrada' });
      throw err;
    }
    const cameras = await req.tenantClient!.camera.findMany({
      where: { obraId, ativo: true },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true, codigoLpr: true, nome: true, ip: true, ativo: true, createdAt: true,
        eventos: { select: { timestamp: true }, orderBy: { timestamp: 'desc' }, take: 1 },
      },
    });
    res.json(cameras);
  },
);

/**
 * POST /api/obras/:obraId/cameras
 * Cria câmera e associa à obra. empresaId denormalizado a partir do req.user (nunca do body).
 * TENANT-05: ADMIN_EMPRESA+ pode criar.
 */
router.post(
  '/',
  requireRole('SUPER_ADMIN', 'ADMIN_EMPRESA'),
  async (req, res) => {
    const { obraId } = req.params;
    const { codigoLpr, nome, ip } = req.body as { codigoLpr?: string; nome?: string; ip?: string };
    if (!codigoLpr || typeof codigoLpr !== 'string' || codigoLpr.trim().length < 3) {
      return res.status(400).json({ error: 'Campo codigoLpr é obrigatório (mínimo 3 caracteres)' });
    }
    // empresaId vem do req.user (token) — nunca do body (T-02-22)
    const empresaId = req.user!.empresaId;
    if (!empresaId) {
      return res.status(400).json({ error: 'SUPER_ADMIN deve informar empresaId ao criar câmera' });
    }
    try {
      // Verifica pertencimento da obra ao tenant antes de criar câmera (T-02-21)
      await req.tenantClient!.obra.findFirstOrThrow({ where: { id: obraId } });
      const camera = await req.tenantClient!.camera.create({
        data: {
          codigoLpr: codigoLpr.trim(),
          nome: nome?.trim() || null,
          ip: ip?.trim() || null,
          obraId,
          empresaId, // denormalizado (TENANT-04)
        },
      });
      res.status(201).json(camera);
    } catch (err: unknown) {
      const code = (err as { code?: string })?.code;
      if (code === 'P2025') return res.status(404).json({ error: 'Obra não encontrada' });
      if (code === 'P2002') return res.status(409).json({ error: 'codigoLpr já existe' });
      throw err;
    }
  },
);

/**
 * PUT /api/obras/:obraId/cameras/:id
 * Atualiza câmera. Verifica pertencimento de obra e câmera ao tenant.
 * TENANT-05: ADMIN_EMPRESA+ pode editar.
 */
router.put(
  '/:id',
  requireRole('SUPER_ADMIN', 'ADMIN_EMPRESA'),
  async (req, res) => {
    const { obraId, id } = req.params;
    const { codigoLpr, nome, ip } = req.body as { codigoLpr?: string; nome?: string; ip?: string };
    if (!codigoLpr || typeof codigoLpr !== 'string' || codigoLpr.trim().length < 3) {
      return res.status(400).json({ error: 'Campo codigoLpr é obrigatório (mínimo 3 caracteres)' });
    }
    try {
      // Verifica obra e câmera no mesmo tenant (tenantClient injeta WHERE empresaId)
      await req.tenantClient!.obra.findFirstOrThrow({ where: { id: obraId } });
      await req.tenantClient!.camera.findFirstOrThrow({ where: { id, obraId } });
      const updated = await req.tenantClient!.camera.update({
        where: { id },
        data: { codigoLpr: codigoLpr.trim(), nome: nome?.trim() || null, ip: ip?.trim() || null },
      });
      res.json(updated);
    } catch (err: unknown) {
      const code = (err as { code?: string })?.code;
      if (code === 'P2025') return res.status(404).json({ error: 'Câmera ou obra não encontrada' });
      if (code === 'P2002') return res.status(409).json({ error: 'codigoLpr já existe' });
      throw err;
    }
  },
);

/**
 * DELETE /api/obras/:obraId/cameras/:id
 * Soft-delete: marca ativo=false. Verifica pertencimento ao tenant.
 * TENANT-05: ADMIN_EMPRESA+ pode desativar.
 */
router.delete(
  '/:id',
  requireRole('SUPER_ADMIN', 'ADMIN_EMPRESA'),
  async (req, res) => {
    const { obraId, id } = req.params;
    try {
      await req.tenantClient!.obra.findFirstOrThrow({ where: { id: obraId } });
      await req.tenantClient!.camera.findFirstOrThrow({ where: { id, obraId } });
      await req.tenantClient!.camera.update({ where: { id }, data: { ativo: false } });
      res.status(204).send();
    } catch (err: unknown) {
      const code = (err as { code?: string })?.code;
      if (code === 'P2025') return res.status(404).json({ error: 'Câmera ou obra não encontrada' });
      throw err;
    }
  },
);

export default router;
