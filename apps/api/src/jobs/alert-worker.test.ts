import { describe, it, expect, vi, beforeEach } from 'vitest';
import { checkAndSetDedup, formatWhatsAppMessage, processAlertJob } from './alert-worker';
import type { CrossSiteAlertPayload, WhatsAppAlertPayload } from './alert-worker';

// Mock do prisma
vi.mock('@cargo-sentinel/database', () => ({
  prisma: {
    configuracaoAlerta: {
      findMany: vi.fn(),
    },
  },
}));

// Mock do whatsapp service
vi.mock('../services/whatsapp', () => ({
  sendAlertaWhatsApp: vi.fn(),
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

describe('checkAndSetDedup', () => {
  it('returns true on first call (key not set)', async () => {
    const mockRedis = { set: vi.fn().mockResolvedValue('OK') } as any;
    const result = await checkAndSetDedup(mockRedis, 'emp-1', 'ABC1234', 'SUSPEITO');
    expect(result).toBe(true);
    expect(mockRedis.set).toHaveBeenCalledWith(
      'alert:dedup:emp-1:ABC1234',
      '1',
      'NX',
      'EX',
      300, // SUSPEITO TTL
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
      'NX',
      'EX',
      900, // CRITICO TTL
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
    const { sendAlertaWhatsApp } = await import('../services/whatsapp');
    const mockRedis = { set: vi.fn().mockResolvedValue(null) } as any; // null = key exists

    await processAlertJob(
      { type: 'alert:whatsapp', payload: whatsappPayload },
      { emitCrossSite: mockEmitCrossSite, redis: mockRedis },
    );

    expect(sendAlertaWhatsApp).not.toHaveBeenCalled();
  });

  it('sends to all active configured numbers when dedup passes', async () => {
    const { prisma } = await import('@cargo-sentinel/database');
    const { sendAlertaWhatsApp } = await import('../services/whatsapp');

    const mockRedis = { set: vi.fn().mockResolvedValue('OK') } as any;
    vi.mocked(prisma.configuracaoAlerta.findMany).mockResolvedValue([
      { telefone: '+5511111111111' } as any,
      { telefone: '+5522222222222' } as any,
    ]);
    vi.mocked(sendAlertaWhatsApp).mockResolvedValue({ success: true, messageId: 'msg-1' });

    await processAlertJob(
      { type: 'alert:whatsapp', payload: whatsappPayload },
      { emitCrossSite: mockEmitCrossSite, redis: mockRedis },
    );

    expect(sendAlertaWhatsApp).toHaveBeenCalledTimes(2);
    expect(sendAlertaWhatsApp).toHaveBeenCalledWith('+5511111111111', expect.stringContaining('ABC1234'));
  });

  it('continues sending to remaining numbers when one fails', async () => {
    const { prisma } = await import('@cargo-sentinel/database');
    const { sendAlertaWhatsApp } = await import('../services/whatsapp');

    const mockRedis = { set: vi.fn().mockResolvedValue('OK') } as any;
    vi.mocked(prisma.configuracaoAlerta.findMany).mockResolvedValue([
      { telefone: '+5511111111111' } as any,
      { telefone: '+5522222222222' } as any,
    ]);
    vi.mocked(sendAlertaWhatsApp)
      .mockResolvedValueOnce({ success: false, error: 'timeout' })
      .mockResolvedValueOnce({ success: true, messageId: 'msg-2' });

    await expect(
      processAlertJob(
        { type: 'alert:whatsapp', payload: whatsappPayload },
        { emitCrossSite: mockEmitCrossSite, redis: mockRedis },
      ),
    ).resolves.not.toThrow();

    expect(sendAlertaWhatsApp).toHaveBeenCalledTimes(2);
  });
});
