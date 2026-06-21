import { describe, it, expect } from 'vitest';
import { eventoToFeedItem, calcCameraStatus } from './dto';

const sampleCamera = {
  id: 'cam1',
  codigoLpr: 'LPR-0001',
  ip: '192.168.0.10',
  obra: { id: 'obra1', nome: 'Obra Centro' },
};

const sampleEvento = {
  id: 'evt1',
  timestamp: new Date('2026-06-21T06:00:00.000Z'),
  placaId: 'pla1',
  placaNumero: 'ABC1234',
  classificacao: 'VISITANTE',
  direcao: 'ENTRADA' as const,
  obra: { id: 'obra1', nome: 'Obra Centro' },
  camera: { id: 'cam1', codigoLpr: 'LPR-0001' },
};

describe('eventoToFeedItem', () => {
  it('mapeia todos os campos do FeedItem corretamente', () => {
    const item = eventoToFeedItem(sampleEvento, 'https://example.com/thumb.jpg');

    expect(item).toEqual({
      id: 'evt1',
      timestamp: '2026-06-21T06:00:00.000Z',
      placaId: 'pla1',
      placaNumero: 'ABC1234',
      classificacao: 'VISITANTE',
      direcao: 'ENTRADA',
      thumbnailUrl: 'https://example.com/thumb.jpg',
      obra: { id: 'obra1', nome: 'Obra Centro' },
      camera: { id: 'cam1', codigoLpr: 'LPR-0001' },
    });
  });

  it('aceita thumbnailUrl null quando não há foto', () => {
    const item = eventoToFeedItem({ ...sampleEvento, placaId: null }, null);

    expect(item.thumbnailUrl).toBeNull();
    expect(item.placaId).toBeNull();
  });
});

describe('calcCameraStatus', () => {
  it('retorna status online quando último evento está dentro de 5 minutos', () => {
    const now = new Date('2026-06-21T10:00:00.000Z');
    const ultimoEvento = new Date('2026-06-21T09:56:00.000Z'); // 4 min atrás

    const result = calcCameraStatus(sampleCamera, ultimoEvento, now);

    expect(result.status).toBe('online');
    expect(result.ultimoEventoEm).toBe('2026-06-21T09:56:00.000Z');
    expect(result.id).toBe('cam1');
    expect(result.codigoLpr).toBe('LPR-0001');
  });

  it('retorna status offline quando último evento ultrapassou 5 minutos', () => {
    const now = new Date('2026-06-21T10:00:00.000Z');
    const ultimoEvento = new Date('2026-06-21T09:54:00.000Z'); // 6 min atrás

    const result = calcCameraStatus(sampleCamera, ultimoEvento, now);

    expect(result.status).toBe('offline');
  });

  it('retorna status offline quando nunca houve evento', () => {
    const result = calcCameraStatus(sampleCamera, null, new Date());

    expect(result.status).toBe('offline');
    expect(result.ultimoEventoEm).toBeNull();
  });

  it('retorna status online exatamente no limite de 5 minutos', () => {
    const now = new Date('2026-06-21T10:00:00.000Z');
    const ultimoEvento = new Date(now.getTime() - 5 * 60 * 1000); // exatamente 5 min

    const result = calcCameraStatus(sampleCamera, ultimoEvento, now);

    expect(result.status).toBe('online');
  });
});
