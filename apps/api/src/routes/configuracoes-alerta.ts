import { Router, type IRouter } from 'express';
import { requireRole } from '../middleware/rbac';

const router: IRouter = Router();

/** Valida numero de telefone em formato E.164 */
function isValidE164(phone: string): boolean {
  return /^\+\d{10,15}$/.test(phone);
}

// GET /api/configuracoes-alerta?obraId=X
router.get('/', requireRole('ADMIN_EMPRESA'), async (req, res) => {
  const { obraId } = req.query;

  if (!obraId || typeof obraId !== 'string') {
    return res.status(400).json({ error: 'obraId e obrigatorio' });
  }

  try {
    const configs = await req.tenantClient!.configuracaoAlerta.findMany({
      where: { obraId, ativo: true },
      orderBy: { createdAt: 'asc' },
      select: { id: true, telefone: true, obraId: true, createdAt: true },
    });
    return res.json({ items: configs });
  } catch (err) {
    throw err;
  }
});

// POST /api/configuracoes-alerta
router.post('/', requireRole('ADMIN_EMPRESA'), async (req, res) => {
  const { obraId, telefone } = req.body as { obraId?: string; telefone?: string };

  if (!obraId || !telefone) {
    return res.status(400).json({ error: 'obraId e telefone sao obrigatorios' });
  }

  if (!isValidE164(telefone)) {
    return res.status(400).json({
      error: 'Telefone deve estar no formato E.164 (+5511999999999)',
    });
  }

  try {
    // Verificar que a obra pertence a empresa do usuario (isolamento de tenant — T-04-12)
    await req.tenantClient!.obra.findFirstOrThrow({ where: { id: obraId } });

    const config = await req.tenantClient!.configuracaoAlerta.create({
      data: {
        obraId,
        empresaId: req.user!.empresaId!,
        telefone,
        ativo: true,
      },
      select: { id: true, telefone: true, obraId: true, createdAt: true },
    });
    return res.status(201).json(config);
  } catch (err: unknown) {
    const code = (err as { code?: string })?.code;
    // P2002 = unique constraint (@@unique([obraId, telefone]))
    if (code === 'P2002') {
      return res.status(409).json({ error: 'Este numero ja esta configurado para esta obra' });
    }
    // P2025 = record not found (findFirstOrThrow)
    if (code === 'P2025') {
      return res.status(404).json({ error: 'Obra nao encontrada' });
    }
    throw err;
  }
});

// DELETE /api/configuracoes-alerta/:id
router.delete('/:id', requireRole('ADMIN_EMPRESA'), async (req, res) => {
  const { id } = req.params;

  try {
    // findFirstOrThrow via tenantClient garante isolamento de tenant (T-04-12)
    await req.tenantClient!.configuracaoAlerta.findFirstOrThrow({ where: { id } });
    await req.tenantClient!.configuracaoAlerta.delete({ where: { id } });
    return res.status(204).send();
  } catch (err: unknown) {
    const code = (err as { code?: string })?.code;
    if (code === 'P2025') {
      return res.status(404).json({ error: 'Configuracao nao encontrada' });
    }
    throw err;
  }
});

export default router;
