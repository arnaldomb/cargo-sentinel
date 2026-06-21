import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Request, Response, NextFunction } from 'express';
import express from 'express';
import request from 'supertest';

const { mockRequireRole, getPresignedUrlMock } = vi.hoisted(() => {
  const mockRequireRole = vi.fn();
  const getPresignedUrlMock = vi.fn();
  return { mockRequireRole, getPresignedUrlMock };
});

vi.mock('../middleware/rbac', () => ({
  requireRole: (..._roles: string[]) => mockRequireRole,
}));

vi.mock('../services/garage', () => ({
  getPresignedUrl: getPresignedUrlMock,
}));

import eventosRouter from './eventos';

function buildTenantClient(empresaId = 'emp1') {
  const mockFindMany = vi.fn();
  return {
    empresaId,
    evento: {
      findMany: mockFindMany,
    },
  };
}

function buildApp(user: Request['user'], tenantClient: ReturnType<typeof buildTenantClient>) {
  const app = express();
  app.use(express.json());
  app.use((req: Request, _res: Response, next: NextFunction) => {
    req.user = user;
    req.tenantClient = tenantClient as unknown as Request['tenantClient'];
    next();
  });
  app.use('/api/eventos', eventosRouter);
  return app;
}

const sampleEvento = {
  id: 'evt1',
  timestamp: new Date('2026-06-21T06:00:00.000Z'),
  placaId: 'pla1',
  placaNumero: 'ABC1234',
  classificacao: 'VISITANTE',
  direcao: 'ENTRADA' as const,
  fotoGarageKey: 'eventos/2026/06/21/1.jpg',
  obra: { id: 'obra1', nome: 'Obra Centro' },
  camera: { id: 'cam1', codigoLpr: 'LPR-0001' },
};

describe('eventos routes', () => {
  let tenantClient: ReturnType<typeof buildTenantClient>;

  beforeEach(() => {
    vi.clearAllMocks();
    tenantClient = buildTenantClient();
  });

  it('retorna feed com thumbnail, placa, obra, câmera, classificação, horário e direção', async () => {
    mockRequireRole.mockImplementation((_req: Request, _res: Response, next: NextFunction) => next());
    getPresignedUrlMock.mockResolvedValue('https://example.com/thumb.jpg');
    tenantClient.evento.findMany.mockResolvedValue([sampleEvento]);

    const app = buildApp({ id: 'user1', role: 'OPERADOR', empresaId: 'emp1' }, tenantClient);

    const res = await request(app).get('/api/eventos/feed?limit=10');

    expect(res.status).toBe(200);
    expect(tenantClient.evento.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {},
        take: 11, // limit + 1 for hasMore detection
        orderBy: { timestamp: 'desc' },
      }),
    );
    expect(res.body.items[0]).toMatchObject({
      id: 'evt1',
      placaId: 'pla1',
      placaNumero: 'ABC1234',
      classificacao: 'VISITANTE',
      direcao: 'ENTRADA',
      thumbnailUrl: 'https://example.com/thumb.jpg',
      obra: { id: 'obra1', nome: 'Obra Centro' },
      camera: { id: 'cam1', codigoLpr: 'LPR-0001' },
    });
    // No next page when fewer items than limit returned
    expect(res.body.nextCursor).toBeNull();
  });

  it('não cruza dados entre tenants — tenantClient isolado por empresaId', async () => {
    mockRequireRole.mockImplementation((_req: Request, _res: Response, next: NextFunction) => next());
    getPresignedUrlMock.mockResolvedValue(null);

    // emp2 tenant client returns EMPTY — simulating cross-tenant isolation
    const emp2Client = buildTenantClient('emp2');
    emp2Client.evento.findMany.mockResolvedValue([]);

    const app = buildApp({ id: 'user2', role: 'OPERADOR', empresaId: 'emp2' }, emp2Client);

    const res = await request(app).get('/api/eventos/feed');

    expect(res.status).toBe(200);
    expect(res.body.items).toHaveLength(0);
    expect(res.body.nextCursor).toBeNull();
    // emp2Client was used, NOT emp1 client — isolation enforced by tenantClient injection
    expect(emp2Client.evento.findMany).toHaveBeenCalledOnce();
    expect(tenantClient.evento.findMany).not.toHaveBeenCalled();
  });

  it('retorna nextCursor quando há mais itens que o limite', async () => {
    mockRequireRole.mockImplementation((_req: Request, _res: Response, next: NextFunction) => next());
    getPresignedUrlMock.mockResolvedValue(null);

    // Return limit+1 items to trigger nextCursor
    const eventos = Array.from({ length: 3 }, (_, i) => ({
      ...sampleEvento,
      id: `evt${i + 1}`,
      fotoGarageKey: null,
    }));
    tenantClient.evento.findMany.mockResolvedValue(eventos); // 3 items for limit=2

    const app = buildApp({ id: 'user1', role: 'OPERADOR', empresaId: 'emp1' }, tenantClient);

    const res = await request(app).get('/api/eventos/feed?limit=2');

    expect(res.status).toBe(200);
    expect(res.body.items).toHaveLength(2);
    // last item of page becomes nextCursor
    expect(res.body.nextCursor).toBe('evt2');
  });

  it('passa cursor corretamente para o findMany quando fornecido', async () => {
    mockRequireRole.mockImplementation((_req: Request, _res: Response, next: NextFunction) => next());
    getPresignedUrlMock.mockResolvedValue(null);
    tenantClient.evento.findMany.mockResolvedValue([]);

    const app = buildApp({ id: 'user1', role: 'OPERADOR', empresaId: 'emp1' }, tenantClient);

    await request(app).get('/api/eventos/feed?cursor=evt5');

    expect(tenantClient.evento.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        cursor: { id: 'evt5' },
        skip: 1,
      }),
    );
  });

  it('thumbnailUrl é null quando fotoGarageKey é null', async () => {
    mockRequireRole.mockImplementation((_req: Request, _res: Response, next: NextFunction) => next());
    tenantClient.evento.findMany.mockResolvedValue([
      { ...sampleEvento, fotoGarageKey: null },
    ]);

    const app = buildApp({ id: 'user1', role: 'OPERADOR', empresaId: 'emp1' }, tenantClient);

    const res = await request(app).get('/api/eventos/feed');

    expect(res.status).toBe(200);
    expect(res.body.items[0].thumbnailUrl).toBeNull();
    expect(getPresignedUrlMock).not.toHaveBeenCalled();
  });
});
