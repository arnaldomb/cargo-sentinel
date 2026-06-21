import { Router, type Router as RouterType } from 'express';
import { requireRole } from '../middleware/rbac';

const router: RouterType = Router();

// Todas as rotas já passam por protectedPipeline (montado no index.ts via spread)
// req.tenantClient injeta WHERE empresaId automaticamente em toda query

/**
 * GET /api/obras
 * Lista obras ativas da empresa do usuário autenticado.
 * TENANT-06: OPERADOR+ pode listar.
 */
router.get(
  '/',
  requireRole('SUPER_ADMIN', 'ADMIN_EMPRESA', 'OPERADOR'),
  async (req, res) => {
    const obras = await req.tenantClient!.obra.findMany({
      where: { ativo: true },
      orderBy: { createdAt: 'desc' },
      select: { id: true, nome: true, endereco: true, ativo: true, createdAt: true },
    });
    res.json(obras);
  },
);

/**
 * POST /api/obras
 * Cria nova obra para a empresa. Injeta empresaId do token (nunca do body).
 * TENANT-05: ADMIN_EMPRESA+ pode criar.
 */
router.post(
  '/',
  requireRole('SUPER_ADMIN', 'ADMIN_EMPRESA'),
  async (req, res) => {
    const { nome, endereco } = req.body as { nome?: string; endereco?: string };
    if (!nome || typeof nome !== 'string' || nome.trim().length < 2) {
      return res.status(400).json({ error: 'Campo nome é obrigatório (mínimo 2 caracteres)' });
    }
    // empresaId vem do req.user (injetado pelo token) — nunca do body (T-02-22)
    // Para SUPER_ADMIN, tenantClient é prisma raw (sem filtro) — empresaId deve ser explícito
    const empresaId = req.user!.empresaId;
    if (!empresaId) {
      return res.status(400).json({ error: 'SUPER_ADMIN deve informar empresaId ao criar obra' });
    }
    const obra = await req.tenantClient!.obra.create({
      data: { nome: nome.trim(), endereco: endereco?.trim(), empresaId },
    });
    res.status(201).json(obra);
  },
);

/**
 * PUT /api/obras/:id
 * Atualiza nome ou endereço de uma obra. Verifica pertencimento ao tenant via findFirstOrThrow.
 * TENANT-05: ADMIN_EMPRESA+ pode editar.
 */
router.put(
  '/:id',
  requireRole('SUPER_ADMIN', 'ADMIN_EMPRESA'),
  async (req, res) => {
    const { id } = req.params;
    const { nome, endereco } = req.body as { nome?: string; endereco?: string };
    if (!nome || typeof nome !== 'string' || nome.trim().length < 2) {
      return res.status(400).json({ error: 'Campo nome é obrigatório (mínimo 2 caracteres)' });
    }
    try {
      // findFirstOrThrow verifica pertencimento ao tenant (tenantClient injeta WHERE empresaId)
      await req.tenantClient!.obra.findFirstOrThrow({ where: { id } });
      const updated = await req.tenantClient!.obra.update({
        where: { id },
        data: { nome: nome.trim(), endereco: endereco?.trim() },
      });
      res.json(updated);
    } catch (err: unknown) {
      const code = (err as { code?: string })?.code;
      if (code === 'P2025') return res.status(404).json({ error: 'Obra não encontrada' });
      throw err;
    }
  },
);

/**
 * DELETE /api/obras/:id
 * Soft-delete: marca ativo=false. Nunca apaga fisicamente.
 * TENANT-05: ADMIN_EMPRESA+ pode desativar.
 */
router.delete(
  '/:id',
  requireRole('SUPER_ADMIN', 'ADMIN_EMPRESA'),
  async (req, res) => {
    const { id } = req.params;
    try {
      await req.tenantClient!.obra.findFirstOrThrow({ where: { id } });
      await req.tenantClient!.obra.update({ where: { id }, data: { ativo: false } });
      res.status(204).send();
    } catch (err: unknown) {
      const code = (err as { code?: string })?.code;
      if (code === 'P2025') return res.status(404).json({ error: 'Obra não encontrada' });
      throw err;
    }
  },
);

export default router;
