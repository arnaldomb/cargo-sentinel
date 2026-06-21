import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Request, Response, NextFunction } from 'express';
import express from 'express';
import request from 'supertest';

const { mockRequireRole } = vi.hoisted(() => {
  const mockRequireRole = vi.fn();
  return { mockRequireRole };
});

vi.mock('../middleware/rbac', () => ({
  requireRole: (..._roles: string[]) => mockRequireRole,
}));

import cameraStatusRouter from './camera-status';

function buildTenantClient() {
  return {
    camera: {
      findMany: vi.fn(),
    },
    evento: {
      groupBy: vi.fn(),
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
  app.use('/api/cameras', cameraStatusRouter);
  return app;
}

describe('camera status routes', () => {
  let tenantClient: ReturnType<typeof buildTenantClient>;

  beforeEach(() => {
    vi.clearAllMocks();
    tenantClient = buildTenantClient();
  });

  it('retorna status online/offline com base no timestamp do último evento', async () => {
    mockRequireRole.mockImplementation((_req: Request, _res: Response, next: NextFunction) => next());

    const now = new Date();
    const onlineAt = new Date(now.getTime() - 60_000);
    const offlineAt = new Date(now.getTime() - 10 * 60_000);

    tenantClient.camera.findMany.mockResolvedValue([
      {
        id: 'cam1',
        codigoLpr: 'LPR-0001',
        ip: '192.168.0.10',
        createdAt: new Date(),
        obra: { id: 'obra1', nome: 'Obra Centro' },
      },
      {
        id: 'cam2',
        codigoLpr: 'LPR-0002',
        ip: '192.168.0.11',
        createdAt: new Date(),
        obra: { id: 'obra1', nome: 'Obra Centro' },
      },
    ]);
    tenantClient.evento.groupBy.mockResolvedValue([
      { cameraId: 'cam1', _max: { timestamp: onlineAt } },
      { cameraId: 'cam2', _max: { timestamp: offlineAt } },
    ]);

    const app = buildApp({ id: 'user1', role: 'OPERADOR', empresaId: 'emp1' }, tenantClient);

    const res = await request(app).get('/api/cameras/status');

    expect(res.status).toBe(200);
    expect(res.body.items).toHaveLength(2);
    expect(res.body.items[0]).toMatchObject({
      id: 'cam1',
      codigoLpr: 'LPR-0001',
      status: 'online',
    });
    expect(res.body.items[1]).toMatchObject({
      id: 'cam2',
      codigoLpr: 'LPR-0002',
      status: 'offline',
    });
  });
});
