import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { LprJobData } from '@cargo-sentinel/shared';

const { prismaMock, uploadToGarageMock, getPresignedUrlMock, emitEventoNovoMock, emitCameraStatusMock, alertQueueAddMock } = vi.hoisted(() => {
  const prismaMock = {
    camera: {
      findUnique: vi.fn(),
    },
    placa: {
      upsert: vi.fn(),
    },
    obra: {
      findUnique: vi.fn(),
    },
    evento: {
      upsert: vi.fn(),
    },
  };
  const uploadToGarageMock = vi.fn();
  const getPresignedUrlMock = vi.fn();
  const emitEventoNovoMock = vi.fn();
  const emitCameraStatusMock = vi.fn();
  const alertQueueAddMock = vi.fn().mockResolvedValue(undefined);
  return { prismaMock, uploadToGarageMock, getPresignedUrlMock, emitEventoNovoMock, emitCameraStatusMock, alertQueueAddMock };
});

vi.mock('@cargo-sentinel/database', () => ({
  prisma: prismaMock,
}));

vi.mock('../services/garage', () => ({
  uploadToGarage: uploadToGarageMock,
  getPresignedUrl: getPresignedUrlMock,
}));

vi.mock('../realtime/server', () => ({
  emitEventoNovo: emitEventoNovoMock,
  emitCameraStatus: emitCameraStatusMock,
}));

vi.mock('./queue', () => ({
  alertQueue: { add: alertQueueAddMock },
  lprQueue: { add: vi.fn() },
}));

import { processLprJob } from './worker';

describe('processLprJob', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('cria ou reutiliza Placa tenant-scoped como VISITANTE e grava Evento com placaId', async () => {
    const jobData: LprJobData = {
      PlateNumber: 'ABC1234',
      ImageBase64: 'aGVsbG8=',
      CameraId: 'LPR-0001',
      Direction: 'in',
      DateTime: '2026-06-21T05:30:00.000Z',
      idempotencyKey: 'idem-1',
    };

    prismaMock.camera.findUnique.mockResolvedValue({
      id: 'cam1',
      codigoLpr: 'LPR-0001',
      obraId: 'obra1',
      empresaId: 'emp1',
      obra: { id: 'obra1', nome: 'Obra Centro' },
    });
    prismaMock.placa.upsert.mockResolvedValue({
      id: 'pla1',
      numero: 'ABC1234',
      empresaId: 'emp1',
      classificacao: 'VISITANTE',
    });
    uploadToGarageMock.mockResolvedValue('eventos/2026/06/21/cam1.jpg');
    getPresignedUrlMock.mockResolvedValue('https://example.com/thumb.jpg');
    prismaMock.evento.upsert.mockResolvedValue({
      id: 'evt1',
      timestamp: new Date('2026-06-21T05:30:00.000Z'),
      placaNumero: 'ABC1234',
      classificacao: 'VISITANTE',
      direcao: 'ENTRADA',
    });

    await processLprJob(jobData);

    expect(prismaMock.placa.upsert).toHaveBeenCalledWith({
      where: {
        numero_empresaId: {
          numero: 'ABC1234',
          empresaId: 'emp1',
        },
      },
      update: {},
      create: {
        numero: 'ABC1234',
        empresaId: 'emp1',
        classificacao: 'VISITANTE',
      },
    });
    expect(prismaMock.evento.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { idempotencyKey: 'idem-1' },
        create: expect.objectContaining({
          placaNumero: 'ABC1234',
          placaId: 'pla1',
          classificacao: 'VISITANTE',
          empresaId: 'emp1',
          cameraId: 'cam1',
          obraId: 'obra1',
        }),
      }),
    );
    expect(emitEventoNovoMock).toHaveBeenCalledOnce();
    expect(emitCameraStatusMock).toHaveBeenCalledOnce();
  });

  it('remove ImageBase64 do rawPayload antes de persistir o evento', async () => {
    const jobData: LprJobData = {
      PlateNumber: 'XYZ9999',
      ImageBase64: 'aGVsbG8=',
      CameraId: 'LPR-0002',
      Direction: 'out',
      DateTime: '2026-06-21T05:31:00.000Z',
      idempotencyKey: 'idem-2',
    };

    prismaMock.camera.findUnique.mockResolvedValue({
      id: 'cam2',
      codigoLpr: 'LPR-0002',
      obraId: 'obra2',
      empresaId: 'emp1',
      obra: { id: 'obra2', nome: 'Obra Norte' },
    });
    prismaMock.placa.upsert.mockResolvedValue({
      id: 'pla2',
      numero: 'XYZ9999',
      empresaId: 'emp1',
      classificacao: 'VISITANTE',
    });
    uploadToGarageMock.mockResolvedValue('eventos/2026/06/21/cam2.jpg');
    getPresignedUrlMock.mockResolvedValue('https://example.com/thumb2.jpg');
    prismaMock.evento.upsert.mockResolvedValue({
      id: 'evt2',
      timestamp: new Date('2026-06-21T05:31:00.000Z'),
      placaNumero: 'XYZ9999',
      classificacao: 'VISITANTE',
      direcao: 'SAIDA',
    });

    await processLprJob(jobData);

    expect(prismaMock.evento.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({
          rawPayload: {
            PlateNumber: 'XYZ9999',
            CameraId: 'LPR-0002',
            Direction: 'out',
            DateTime: '2026-06-21T05:31:00.000Z',
            idempotencyKey: 'idem-2',
          },
        }),
      }),
    );
  });

  it('rejeita evento quando CameraId nao bate com codigoLpr cadastrado', async () => {
    const jobData: LprJobData = {
      PlateNumber: 'AB12349',
      ImageBase64: 'aGVsbG8=',
      CameraId: '192.168.16.117',
      Direction: 'in',
      DateTime: '2026-06-21T16:12:00.000Z',
      idempotencyKey: 'idem-3',
    };

    prismaMock.camera.findUnique.mockResolvedValue(null);

    await expect(processLprJob(jobData)).rejects.toThrow('Camera not found: 192.168.16.117');

    expect(prismaMock.camera.findUnique).toHaveBeenCalledWith({
      where: { codigoLpr: '192.168.16.117' },
      include: { obra: true },
    });
    expect(prismaMock.placa.upsert).not.toHaveBeenCalled();
    expect(prismaMock.evento.upsert).not.toHaveBeenCalled();
  });
});
