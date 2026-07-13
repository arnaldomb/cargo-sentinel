import { describe, it, expect, vi, beforeEach } from 'vitest';
import { checkAndSetDedup, formatWhatsAppMessage, processAlertJob } from './alert-worker';
import type { CrossSiteAlertPayload, WhatsAppAlertPayload } from './alert-worker';

// Mock do prisma
vi.mock('@cargo-sentinel/database', () => ({
  prisma: {
    configuracaoWhatsApp: {
      findUnique: vi.fn(),
    },
  },
}));

// Mock do cliente Z-API
vi.mock('../infra/zapi/zapi.service', () => ({
  sendWhatsAppText: vi.fn(),
  sendWhatsAppImage: vi.fn(),
  zapiConfigFrom: vi.fn(),
}));

const mockEmitCrossSite = vi.fn();

const crossSitePayload: CrossSiteAlertPayload = {
  empresaId: 'emp-1',
  placaNumero: 'ABC1234',
  classificacao: 'SUSPEITO',
  obraDetectadaId: 'obra-b',
  obraDetectadaNome: 'Obra B',
  obraClassificacaoId: 'obra-a',
  obraClassificacaoNome: 'Obra A',
  eventoId: 'evt-1',
  timestamp: new Date('2026-06-21T10:00:00Z').toISOString(),
};

const whatsappPayload: WhatsAppAlertPayload = {
  empresaId: 'emp-1',
  obraId: 'obra-b',
  placaNumero: 'ABC1234',
  classificacao: 'SUSPEITO',
  obraDetectadaNome: 'Obra B',
  obraClassificacaoNome: 'Obra A',
  timestamp: new Date('2026-06-21T10:00:00Z').toISOString(),
};

const zapiCfg = { instanceId: 'inst-1', token: 'tok-1', clientToken: null };

describe('checkAndSetDedup', () => {
  it('returns true on first call (key not set)', async () => {
    const mockRedis = { set: vi.fn().mockResolvedValue('OK') } as any;
    const result = await checkAndSetDedup(mockRedis, 'emp-1', 'ABC1234', 'SUSPEITO');
    expect(result).toBe(true);
    expect(mockRedis.set).toHaveBeenCalledWith(
      'alert:dedup:emp-1:ABC1234',
      '1',
      'EX',
      300, // SUSPEITO TTL
      'NX',
    );
  });

  it('returns false when key already exists (duplicate within window)', async () => {
    const mockRedis = { set: vi.fn().mockResolvedValue(null) } as any;
    const result = await checkAndSetDedup(mockRedis, 'emp-1', 'ABC1234', 'SUSPEITO');
    expect(result).toBe(false);
  });

  it('uses 900s TTL for CRITICO', async () => {
    const mockRedis = { set: vi.fn().mockResolvedValue('OK') } as any;
    await checkAndSetDedup(mockRedis, 'emp-1', 'ABC1234', 'CRITICO');
    expect(mockRedis.set).toHaveBeenCalledWith(
      'alert:dedup:emp-1:ABC1234',
      '1',
      'EX',
      900, // CRITICO TTL
      'NX',
    );
  });
});

describe('formatWhatsAppMessage', () => {
  it('includes plate, classification, and both obra names', () => {
    const msg = formatWhatsAppMessage(whatsappPayload);
    expect(msg).toContain('ABC1234');
    expect(msg).toContain('SUSPEITO');
    expect(msg).toContain('Obra B');
    expect(msg).toContain('Obra A');
  });

  it('uses CRITICO label for level 5', () => {
    const msg = formatWhatsAppMessage({ ...whatsappPayload, classificacao: 'CRITICO' });
    expect(msg).toContain('CRITICO');
  });
});

describe('processAlertJob — alert:cross-site', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('calls emitCrossSite with correct payload', async () => {
    const mockRedis = { set: vi.fn() } as any;
    await processAlertJob(
      { type: 'alert:cross-site', payload: crossSitePayload },
      { emitCrossSite: mockEmitCrossSite, redis: mockRedis },
    );
    expect(mockEmitCrossSite).toHaveBeenCalledWith('emp-1', crossSitePayload);
  });

  it('does not throw when emitCrossSite throws (socket not initialized)', async () => {
    const mockRedis = { set: vi.fn() } as any;
    const throwingEmit = vi.fn().mockImplementation(() => { throw new Error('not initialized'); });
    await expect(
      processAlertJob(
        { type: 'alert:cross-site', payload: crossSitePayload },
        { emitCrossSite: throwingEmit, redis: mockRedis },
      ),
    ).resolves.not.toThrow();
  });
});

describe('processAlertJob — alert:whatsapp', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('skips sending when dedup key exists', async () => {
    const { sendWhatsAppText } = await import('../infra/zapi/zapi.service');
    const mockRedis = { set: vi.fn().mockResolvedValue(null) } as any; // null = key exists

    await processAlertJob(
      { type: 'alert:whatsapp', payload: whatsappPayload },
      { emitCrossSite: mockEmitCrossSite, redis: mockRedis },
    );

    expect(sendWhatsAppText).not.toHaveBeenCalled();
  });

  it('does not send when configuracaoWhatsApp is missing', async () => {
    const { prisma } = await import('@cargo-sentinel/database');
    const { sendWhatsAppText } = await import('../infra/zapi/zapi.service');
    const mockRedis = { set: vi.fn().mockResolvedValue('OK') } as any;
    vi.mocked(prisma.configuracaoWhatsApp.findUnique).mockResolvedValue(null as any);

    await processAlertJob(
      { type: 'alert:whatsapp', payload: whatsappPayload },
      { emitCrossSite: mockEmitCrossSite, redis: mockRedis },
    );

    expect(sendWhatsAppText).not.toHaveBeenCalled();
  });

  it('does not send when ativo is false', async () => {
    const { prisma } = await import('@cargo-sentinel/database');
    const { sendWhatsAppText } = await import('../infra/zapi/zapi.service');
    const mockRedis = { set: vi.fn().mockResolvedValue('OK') } as any;
    vi.mocked(prisma.configuracaoWhatsApp.findUnique).mockResolvedValue({
      ativo: false,
      whatsappInstStatus: 'CONECTADO',
      whatsappDestino: '5511111111111',
      whatsappGrupoJid: null,
      classificacoesAlerta: [],
    } as any);

    await processAlertJob(
      { type: 'alert:whatsapp', payload: whatsappPayload },
      { emitCrossSite: mockEmitCrossSite, redis: mockRedis },
    );

    expect(sendWhatsAppText).not.toHaveBeenCalled();
  });

  it('does not send when whatsappInstStatus is not CONECTADO', async () => {
    const { prisma } = await import('@cargo-sentinel/database');
    const { sendWhatsAppText } = await import('../infra/zapi/zapi.service');
    const mockRedis = { set: vi.fn().mockResolvedValue('OK') } as any;
    vi.mocked(prisma.configuracaoWhatsApp.findUnique).mockResolvedValue({
      ativo: true,
      whatsappInstStatus: 'AGUARDANDO_QR',
      whatsappDestino: '5511111111111',
      whatsappGrupoJid: null,
      classificacoesAlerta: [],
    } as any);

    await processAlertJob(
      { type: 'alert:whatsapp', payload: whatsappPayload },
      { emitCrossSite: mockEmitCrossSite, redis: mockRedis },
    );

    expect(sendWhatsAppText).not.toHaveBeenCalled();
  });

  it('sends to destino and grupo when ativo + CONECTADO + classificacao permitida', async () => {
    const { prisma } = await import('@cargo-sentinel/database');
    const { sendWhatsAppText, zapiConfigFrom } = await import('../infra/zapi/zapi.service');
    const mockRedis = { set: vi.fn().mockResolvedValue('OK') } as any;
    vi.mocked(prisma.configuracaoWhatsApp.findUnique).mockResolvedValue({
      ativo: true,
      whatsappInstStatus: 'CONECTADO',
      whatsappDestino: '5511111111111',
      whatsappGrupoJid: 'grupo-123-group',
      whatsappGrupoNome: 'Grupo Teste',
      classificacoesAlerta: ['SUSPEITO', 'CRITICO'],
    } as any);
    vi.mocked(zapiConfigFrom).mockReturnValue(zapiCfg);
    vi.mocked(sendWhatsAppText).mockResolvedValue(undefined);

    await processAlertJob(
      { type: 'alert:whatsapp', payload: whatsappPayload },
      { emitCrossSite: mockEmitCrossSite, redis: mockRedis },
    );

    expect(sendWhatsAppText).toHaveBeenCalledTimes(2);
    expect(sendWhatsAppText).toHaveBeenCalledWith(zapiCfg, '5511111111111', expect.stringContaining('ABC1234'));
    expect(sendWhatsAppText).toHaveBeenCalledWith(zapiCfg, 'grupo-123-group', expect.stringContaining('ABC1234'));
  });

  it('sends when classificacoesAlerta is empty (vazio = todos)', async () => {
    const { prisma } = await import('@cargo-sentinel/database');
    const { sendWhatsAppText, zapiConfigFrom } = await import('../infra/zapi/zapi.service');
    const mockRedis = { set: vi.fn().mockResolvedValue('OK') } as any;
    vi.mocked(prisma.configuracaoWhatsApp.findUnique).mockResolvedValue({
      ativo: true,
      whatsappInstStatus: 'CONECTADO',
      whatsappDestino: '5511111111111',
      whatsappGrupoJid: null,
      classificacoesAlerta: [],
    } as any);
    vi.mocked(zapiConfigFrom).mockReturnValue(zapiCfg);
    vi.mocked(sendWhatsAppText).mockResolvedValue(undefined);

    await processAlertJob(
      { type: 'alert:whatsapp', payload: whatsappPayload },
      { emitCrossSite: mockEmitCrossSite, redis: mockRedis },
    );

    expect(sendWhatsAppText).toHaveBeenCalledTimes(1);
  });

  it('does not throw and skips remaining sends when one send fails', async () => {
    const { prisma } = await import('@cargo-sentinel/database');
    const { sendWhatsAppText, zapiConfigFrom } = await import('../infra/zapi/zapi.service');
    const mockRedis = { set: vi.fn().mockResolvedValue('OK') } as any;
    vi.mocked(prisma.configuracaoWhatsApp.findUnique).mockResolvedValue({
      ativo: true,
      whatsappInstStatus: 'CONECTADO',
      whatsappDestino: '5511111111111',
      whatsappGrupoJid: 'grupo-123-group',
      whatsappGrupoNome: 'Grupo Teste',
      classificacoesAlerta: [],
    } as any);
    vi.mocked(zapiConfigFrom).mockReturnValue(zapiCfg);
    vi.mocked(sendWhatsAppText)
      .mockRejectedValueOnce(new Error('timeout'))
      .mockResolvedValueOnce(undefined);

    await expect(
      processAlertJob(
        { type: 'alert:whatsapp', payload: whatsappPayload },
        { emitCrossSite: mockEmitCrossSite, redis: mockRedis },
      ),
    ).resolves.not.toThrow();

    expect(sendWhatsAppText).toHaveBeenCalledTimes(2);
  });

  it('sends via sendWhatsAppImage (com caption) quando payload tem fotoBase64', async () => {
    const { prisma } = await import('@cargo-sentinel/database');
    const { sendWhatsAppText, sendWhatsAppImage, zapiConfigFrom } = await import('../infra/zapi/zapi.service');
    const mockRedis = { set: vi.fn().mockResolvedValue('OK') } as any;
    vi.mocked(prisma.configuracaoWhatsApp.findUnique).mockResolvedValue({
      ativo: true,
      whatsappInstStatus: 'CONECTADO',
      whatsappDestino: '5511111111111',
      whatsappGrupoJid: 'grupo-123-group',
      whatsappGrupoNome: 'Grupo Teste',
      classificacoesAlerta: [],
    } as any);
    vi.mocked(zapiConfigFrom).mockReturnValue(zapiCfg);
    vi.mocked(sendWhatsAppImage).mockResolvedValue(undefined);

    const payloadComFoto: WhatsAppAlertPayload = {
      ...whatsappPayload,
      fotoBase64: 'data:image/jpeg;base64,AAAA',
    };

    await processAlertJob(
      { type: 'alert:whatsapp', payload: payloadComFoto },
      { emitCrossSite: mockEmitCrossSite, redis: mockRedis },
    );

    expect(sendWhatsAppImage).toHaveBeenCalledTimes(2);
    expect(sendWhatsAppImage).toHaveBeenCalledWith(
      zapiCfg,
      '5511111111111',
      'data:image/jpeg;base64,AAAA',
      expect.stringContaining('ABC1234'),
    );
    expect(sendWhatsAppImage).toHaveBeenCalledWith(
      zapiCfg,
      'grupo-123-group',
      'data:image/jpeg;base64,AAAA',
      expect.stringContaining('ABC1234'),
    );
    expect(sendWhatsAppText).not.toHaveBeenCalled();
  });
});
