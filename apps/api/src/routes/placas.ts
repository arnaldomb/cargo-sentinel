import { Router, type Router as RouterType } from 'express';
import { requireRole } from '../middleware/rbac';
import { emitPlacaClassificada } from '../realtime/server';

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

export default router;
