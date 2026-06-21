import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { normalizePhone, sendAlertaWhatsApp } from './whatsapp';

describe('normalizePhone', () => {
  it('strips leading + from E.164 number', () => {
    expect(normalizePhone('+5511999999999')).toBe('5511999999999');
  });

  it('leaves number without + unchanged', () => {
    expect(normalizePhone('5511999999999')).toBe('5511999999999');
  });
});

describe('sendAlertaWhatsApp', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    vi.resetAllMocks();
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('returns failure when EVOLUTION_API_URL is not set', async () => {
    delete process.env.EVOLUTION_API_URL;
    const result = await sendAlertaWhatsApp('+5511999999999', 'Alerta teste');
    expect(result.success).toBe(false);
    expect(result.error).toContain('EVOLUTION_API_URL not configured');
  });

  it('returns failure when EVOLUTION_API_KEY is not set', async () => {
    process.env.EVOLUTION_API_URL = 'http://localhost:8080';
    delete process.env.EVOLUTION_API_KEY;
    const result = await sendAlertaWhatsApp('+5511999999999', 'Alerta teste');
    expect(result.success).toBe(false);
    expect(result.error).toContain('EVOLUTION_API_KEY not configured');
  });

  it('returns success with messageId on 200 response', async () => {
    process.env.EVOLUTION_API_URL = 'http://localhost:8080';
    process.env.EVOLUTION_API_KEY = 'test-key';
    process.env.EVOLUTION_INSTANCE_NAME = 'test-instance';

    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ key: { id: 'msg-abc-123' } }),
      }),
    );

    const result = await sendAlertaWhatsApp('+5511999999999', 'Alerta: placa ABC1234');
    expect(result.success).toBe(true);
    expect(result.messageId).toBe('msg-abc-123');

    const fetchMock = vi.mocked(fetch);
    expect(fetchMock).toHaveBeenCalledWith(
      'http://localhost:8080/message/sendText/test-instance',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ number: '5511999999999', text: 'Alerta: placa ABC1234' }),
      }),
    );
  });

  it('returns failure with error string on non-200 HTTP response', async () => {
    process.env.EVOLUTION_API_URL = 'http://localhost:8080';
    process.env.EVOLUTION_API_KEY = 'test-key';

    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        status: 404,
        text: async () => 'Instance not found',
      }),
    );

    const result = await sendAlertaWhatsApp('+5511999999999', 'Alerta teste');
    expect(result.success).toBe(false);
    expect(result.error).toContain('404');
  });

  it('returns failure on network error', async () => {
    process.env.EVOLUTION_API_URL = 'http://localhost:8080';
    process.env.EVOLUTION_API_KEY = 'test-key';

    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('ECONNREFUSED')));

    const result = await sendAlertaWhatsApp('+5511999999999', 'Alerta teste');
    expect(result.success).toBe(false);
    expect(result.error).toContain('ECONNREFUSED');
  });
});
