import { Router, type IRouter } from 'express';
import { requireRole } from '../middleware/rbac';
import { getStatus, getQrCodeImage, zapiConfigFrom, listGroups, disconnect, sendWhatsAppText } from '../infra/zapi/zapi.service';

const router: IRouter = Router();

type Classificacao = 'LIBERADO' | 'VISITANTE' | 'ATENCAO' | 'SUSPEITO' | 'CRITICO';

const DEFAULT_CLASSIFICACOES: Classificacao[] = ['SUSPEITO', 'CRITICO'];

// Formato exposto ao tenant — NUNCA inclui zapiInstanceId/zapiToken/zapiClientToken.
function toTenantView(config: {
  ativo: boolean;
  whatsappInstStatus: string;
  whatsappDestino: string | null;
  whatsappGrupoJid: string | null;
  whatsappGrupoNome: string | null;
  classificacoesAlerta: string[];
  zapiInstanceId: string | null;
  zapiToken: string | null;
}) {
  return {
    ativo: config.ativo,
    whatsappInstStatus: config.whatsappInstStatus,
    whatsappDestino: config.whatsappDestino,
    whatsappGrupoJid: config.whatsappGrupoJid,
    whatsappGrupoNome: config.whatsappGrupoNome,
    classificacoesAlerta: config.classificacoesAlerta,
    instanciaVinculada: !!(config.zapiInstanceId && config.zapiToken),
  };
}

// GET /api/configuracoes-whatsapp — obter config da empresa (sem credenciais)
router.get('/', requireRole('ADMIN_EMPRESA'), async (req, res) => {
  let config = await req.tenantClient!.configuracaoWhatsApp.findUnique({
    where: { empresaId: req.user!.empresaId! },
  });

  if (!config) {
    config = await req.tenantClient!.configuracaoWhatsApp.create({
      data: {
        empresaId: req.user!.empresaId!,
        ativo: true,
        classificacoesAlerta: DEFAULT_CLASSIFICACOES,
      },
    });
  }

  return res.json(toTenantView(config));
});

// PUT /api/configuracoes-whatsapp — config de ENVIO apenas (sem credenciais)
router.put('/', requireRole('ADMIN_EMPRESA'), async (req, res) => {
  const body = req.body as {
    ativo?: boolean;
    whatsappDestino?: string | null;
    whatsappGrupoJid?: string | null;
    whatsappGrupoNome?: string | null;
    classificacoesAlerta?: Classificacao[];
  };

  const empresaId = req.user!.empresaId!;
  const existing = await req.tenantClient!.configuracaoWhatsApp.findUnique({ where: { empresaId } });

  const data = {
    ativo: body.ativo ?? true,
    whatsappDestino: body.whatsappDestino ?? null,
    whatsappGrupoJid: body.whatsappGrupoJid ?? null,
    whatsappGrupoNome: body.whatsappGrupoNome ?? null,
    classificacoesAlerta: body.classificacoesAlerta ?? DEFAULT_CLASSIFICACOES,
  };

  const config = existing
    ? await req.tenantClient!.configuracaoWhatsApp.update({ where: { empresaId }, data })
    : await req.tenantClient!.configuracaoWhatsApp.create({ data: { empresaId, ...data } });

  return res.json(toTenantView(config));
});

// GET /api/configuracoes-whatsapp/status — verificar status da instância Z-API
router.get('/status', requireRole('ADMIN_EMPRESA'), async (req, res) => {
  const empresaId = req.user!.empresaId!;
  const config = await req.tenantClient!.configuracaoWhatsApp.findUnique({ where: { empresaId } });

  const zapiCfg = zapiConfigFrom(config);
  if (!zapiCfg) {
    return res.json({ status: 'SEM_INSTANCIA' });
  }

  try {
    const status = await getStatus(zapiCfg);
    const novoStatus: 'DESCONECTADO' | 'AGUARDANDO_QR' | 'CONECTADO' = status.connected
      ? 'CONECTADO'
      : config!.whatsappInstStatus === 'AGUARDANDO_QR'
        ? 'AGUARDANDO_QR'
        : 'DESCONECTADO';

    if (novoStatus !== config!.whatsappInstStatus) {
      await req.tenantClient!.configuracaoWhatsApp.update({
        where: { empresaId },
        data: { whatsappInstStatus: novoStatus },
      });
    }

    return res.json({ status: novoStatus, smartphoneConnected: status.smartphoneConnected ?? null, erro: status.error ?? null });
  } catch (err) {
    return res.json({ status: config!.whatsappInstStatus, erro: err instanceof Error ? err.message : String(err) });
  }
});

// GET /api/configuracoes-whatsapp/qrcode — obter QR code da instância Z-API
router.get('/qrcode', requireRole('ADMIN_EMPRESA'), async (req, res) => {
  const empresaId = req.user!.empresaId!;
  const config = await req.tenantClient!.configuracaoWhatsApp.findUnique({ where: { empresaId } });

  const zapiCfg = zapiConfigFrom(config);
  if (!zapiCfg) {
    return res.status(400).json({ error: 'Instância não vinculada. Solicite ao administrador da plataforma.' });
  }

  const status = await getStatus(zapiCfg).catch(() => null);
  if (status?.connected) {
    return res.json({ status: 'CONECTADO', qrCode: null });
  }

  const qrCode = await getQrCodeImage(zapiCfg);
  if (qrCode) {
    await req.tenantClient!.configuracaoWhatsApp.update({
      where: { empresaId },
      data: { whatsappInstStatus: 'AGUARDANDO_QR' },
    });
  }

  return res.json({ status: qrCode ? 'AGUARDANDO_QR' : 'DESCONECTADO', qrCode });
});

// GET /api/configuracoes-whatsapp/grupos — listar grupos WhatsApp (Z-API)
router.get('/grupos', requireRole('ADMIN_EMPRESA'), async (req, res) => {
  const config = await req.tenantClient!.configuracaoWhatsApp.findUnique({
    where: { empresaId: req.user!.empresaId! },
  });

  const zapiCfg = zapiConfigFrom(config);
  if (!zapiCfg) {
    return res.status(400).json({ error: 'Instância não vinculada. Solicite ao administrador da plataforma.' });
  }

  try {
    const grupos = await listGroups(zapiCfg);
    return res.json({ grupos });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes('429')) {
      return res.status(429).json({ error: 'A Z-API limitou as consultas. Aguarde alguns segundos e tente novamente.' });
    }
    return res.status(502).json({ error: `Falha ao listar grupos: ${msg.slice(0, 200)}` });
  }
});

// POST /api/configuracoes-whatsapp/desconectar — derruba a sessão Z-API (mantém vínculo)
router.post('/desconectar', requireRole('ADMIN_EMPRESA'), async (req, res) => {
  const empresaId = req.user!.empresaId!;
  const config = await req.tenantClient!.configuracaoWhatsApp.findUnique({ where: { empresaId } });

  const zapiCfg = zapiConfigFrom(config);
  if (!zapiCfg) {
    return res.status(400).json({ error: 'Instância não vinculada.' });
  }

  await disconnect(zapiCfg);
  await req.tenantClient!.configuracaoWhatsApp.update({
    where: { empresaId },
    data: { whatsappInstStatus: 'DESCONECTADO' },
  });

  return res.json({ ok: true, status: 'DESCONECTADO' });
});

// POST /api/configuracoes-whatsapp/testar — envia mensagem de teste
router.post('/testar', requireRole('ADMIN_EMPRESA'), async (req, res) => {
  const config = await req.tenantClient!.configuracaoWhatsApp.findUnique({
    where: { empresaId: req.user!.empresaId! },
  });

  const zapiCfg = zapiConfigFrom(config);
  if (!zapiCfg) {
    return res.status(400).json({ error: 'Instância não vinculada.' });
  }
  if (config!.whatsappInstStatus !== 'CONECTADO') {
    return res.status(400).json({ error: 'Instância não está conectada.' });
  }
  if (!config!.whatsappDestino && !config!.whatsappGrupoJid) {
    return res.status(400).json({ error: 'Nenhum destino configurado (número ou grupo).' });
  }

  const texto = '✅ Cargo Sentinel — Conexão WhatsApp testada com sucesso!';
  try {
    if (config!.whatsappDestino) await sendWhatsAppText(zapiCfg, config!.whatsappDestino, texto);
    if (config!.whatsappGrupoJid) await sendWhatsAppText(zapiCfg, config!.whatsappGrupoJid, texto);
    return res.json({ ok: true });
  } catch (err) {
    return res.status(502).json({
      error: 'Falha ao enviar mensagem de teste.',
      details: String(err instanceof Error ? err.message : err).slice(0, 300),
    });
  }
});

export default router;
