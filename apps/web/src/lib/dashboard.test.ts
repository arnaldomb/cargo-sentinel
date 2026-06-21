import { describe, expect, it } from 'vitest';
import {
  getClassificationColor,
  requiresCriticalConfirmation,
  resolveApiBaseUrl,
  updateFeedClassification,
  upsertCameraStatus,
  upsertFeedItem,
  type CameraStatusItem,
  type FeedItem,
} from './dashboard';

describe('dashboard utils', () => {
  it('resolve a base da API para localhost:4000 em ambiente local', () => {
    expect(resolveApiBaseUrl('localhost', 'http:')).toBe('http://localhost:4000');
  });

  it('exige confirmação para classificações críticas', () => {
    expect(requiresCriticalConfirmation('SUSPEITO')).toBe(true);
    expect(requiresCriticalConfirmation('CRITICO')).toBe(true);
    expect(requiresCriticalConfirmation('VISITANTE')).toBe(false);
  });

  it('insere evento novo no topo do feed sem duplicar id', () => {
    const current: FeedItem[] = [
      {
        id: 'evt1',
        timestamp: '2026-06-21T05:00:00.000Z',
        placaId: 'pla1',
        placaNumero: 'ABC1234',
        classificacao: 'VISITANTE',
        direcao: 'ENTRADA',
        thumbnailUrl: null,
        obra: { id: 'obra1', nome: 'Obra Centro' },
        camera: { id: 'cam1', codigoLpr: 'LPR-0001' },
      },
    ];

    const updated = upsertFeedItem(current, {
      ...current[0],
      id: 'evt2',
      timestamp: '2026-06-21T05:01:00.000Z',
    });

    expect(updated[0].id).toBe('evt2');
    expect(updated).toHaveLength(2);
  });

  it('propaga reclassificação para todos os itens da mesma placa', () => {
    const current: FeedItem[] = [
      {
        id: 'evt1',
        timestamp: '2026-06-21T05:00:00.000Z',
        placaId: 'pla1',
        placaNumero: 'ABC1234',
        classificacao: 'VISITANTE',
        direcao: 'ENTRADA',
        thumbnailUrl: null,
        obra: { id: 'obra1', nome: 'Obra Centro' },
        camera: { id: 'cam1', codigoLpr: 'LPR-0001' },
      },
      {
        id: 'evt2',
        timestamp: '2026-06-21T05:02:00.000Z',
        placaId: 'pla1',
        placaNumero: 'ABC1234',
        classificacao: 'VISITANTE',
        direcao: 'SAIDA',
        thumbnailUrl: null,
        obra: { id: 'obra1', nome: 'Obra Centro' },
        camera: { id: 'cam1', codigoLpr: 'LPR-0001' },
      },
    ];

    const updated = updateFeedClassification(current, {
      placaId: 'pla1',
      classificacao: 'SUSPEITO',
    });

    expect(updated.every((item) => item.classificacao === 'SUSPEITO')).toBe(true);
  });

  it('atualiza status de câmera sem duplicar entradas', () => {
    const current: CameraStatusItem[] = [
      {
        id: 'cam1',
        codigoLpr: 'LPR-0001',
        ip: '192.168.0.10',
        obra: { id: 'obra1', nome: 'Obra Centro' },
        ultimoEventoEm: null,
        status: 'offline',
      },
    ];

    const updated = upsertCameraStatus(current, {
      ...current[0],
      status: 'online',
      ultimoEventoEm: '2026-06-21T06:00:00.000Z',
    });

    expect(updated).toHaveLength(1);
    expect(updated[0].status).toBe('online');
  });

  it('mapeia cores por classificação', () => {
    // LIBERADO=green, VISITANTE=blue, ATENCAO=yellow, SUSPEITO=orange, CRITICO=red
    expect(getClassificationColor('LIBERADO')).toBe('#16a34a');
    expect(getClassificationColor('VISITANTE')).toBe('#2563eb');
    expect(getClassificationColor('ATENCAO')).toBe('#eab308');
    expect(getClassificationColor('SUSPEITO')).toBe('#f97316');
    expect(getClassificationColor('CRITICO')).toBe('#b91c1c');
  });
});
