import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Request, Response, NextFunction } from 'express';
import express from 'express';
import request from 'supertest';
import { recordCameraHeartbeat, resetCameraHeartbeatRegistry } from '../lpr/heartbeat';

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
    resetCameraHeartbeatRegistry();
    tenantClient = buildTenantClient();
  });

  it('retorna status online/offline com base no KeepAlive dos ultimos 60 segundos', async () => {
    mockRequireRole.mockImplementation((_req: Request, _res: Response, next: NextFunction) => next());

    const now = new Date();
    const onlineAt = new Date(now.getTime() - 30_000);
    const offlineAt = new Date(now.getTime() - 61_000);

    recordCameraHeartbeat('LPR-0001', onlineAt);
    recordCameraHeartbeat('LPR-0002', offlineAt);

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
