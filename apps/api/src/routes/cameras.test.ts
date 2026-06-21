import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Request, Response, NextFunction } from 'express';
import express from 'express';
import request from 'supertest';

// ---------------------------------------------------------------------------
// vi.hoisted ensures mock values are available when vi.mock factory runs
// ---------------------------------------------------------------------------
const { mockRequireRole } = vi.hoisted(() => {
  const mockRequireRole = vi.fn();
  return { mockRequireRole };
});

// ---------------------------------------------------------------------------
// Mock pipeline — bypass auth/tenant middleware in route tests
// ---------------------------------------------------------------------------
vi.mock('../middleware/pipeline', () => ({
  protectedPipeline: [],
}));

// ---------------------------------------------------------------------------
// Mock rbac — control role enforcement per test
// ---------------------------------------------------------------------------
vi.mock('../middleware/rbac', () => ({
  requireRole: (..._roles: string[]) => mockRequireRole,
}));

// ---------------------------------------------------------------------------
// Import router AFTER mocks
// ---------------------------------------------------------------------------
import camerasRouter from './cameras';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function buildTenantClient() {
  return {
    obra: {
      findFirstOrThrow: vi.fn(),
    },
    camera: {
      findMany: vi.fn(),
      findFirstOrThrow: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
  };
}

function buildApp(user: Request['user'], tenantClient: ReturnType<typeof buildTenantClient>) {
  const app = express();
  app.use(express.json());
  // Inject req.user and req.tenantClient, with mergeParams support via parent router
  app.use((req: Request, _res: Response, next: NextFunction) => {
    req.user = user;
    req.tenantClient = tenantClient as unknown as Request['tenantClient'];
    next();
  });
  // Mount with :obraId param — mergeParams: true in cameras router inherits it
  app.use('/api/obras/:obraId/cameras', camerasRouter);
  return app;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------
describe('cameras routes', () => {
  let tenantClient: ReturnType<typeof buildTenantClient>;

  beforeEach(() => {
    vi.clearAllMocks();
    tenantClient = buildTenantClient();
  });

  // Test 7: GET /api/obras/:obraId/cameras com OPERADOR retorna 200
  it('Test 7: GET /api/obras/:obraId/cameras com OPERADOR retorna 200 e chama findMany com obraId', async () => {
    mockRequireRole.mockImplementation((_req: Request, _res: Response, next: NextFunction) => next());
    tenantClient.obra.findFirstOrThrow.mockResolvedValue({ id: 'obra1' });
    tenantClient.camera.findMany.mockResolvedValue([
      { id: 'cam1', codigoLpr: 'LPR-0001', ip: '192.168.1.10', ativo: true, createdAt: new Date() },
    ]);

    const user = { id: 'u1', role: 'OPERADOR', empresaId: 'emp1' };
    const app = buildApp(user, tenantClient);

    const res = await request(app).get('/api/obras/obra1/cameras');

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(tenantClient.camera.findMany).toHaveBeenCalledOnce();
    expect(tenantClient.camera.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ obraId: 'obra1' }) }),
    );
  });

  // Test 8: POST /api/obras/:obraId/cameras com OPERADOR retorna 403
  it('Test 8: POST /api/obras/:obraId/cameras com OPERADOR retorna 403', async () => {
    mockRequireRole.mockImplementation((_req: Request, res: Response, _next: NextFunction) => {
      res.status(403).json({ error: 'Acesso negado' });
    });

    const user = { id: 'u1', role: 'OPERADOR', empresaId: 'emp1' };
    const app = buildApp(user, tenantClient);

    const res = await request(app).post('/api/obras/obra1/cameras').send({ codigoLpr: 'LPR-0001' });

    expect(res.status).toBe(403);
    expect(tenantClient.camera.create).not.toHaveBeenCalled();
  });

  // Test 9: POST com ADMIN_EMPRESA retorna 201 com obraId e empresaId do token
  it('Test 9: POST /api/obras/:obraId/cameras com ADMIN_EMPRESA retorna 201 com obraId e empresaId do token', async () => {
    mockRequireRole.mockImplementation((_req: Request, _res: Response, next: NextFunction) => next());
    tenantClient.obra.findFirstOrThrow.mockResolvedValue({ id: 'obra1' });
    const newCamera = {
      id: 'cam1',
      codigoLpr: 'LPR-0001',
      ip: '192.168.1.10',
      obraId: 'obra1',
      empresaId: 'emp1',
      ativo: true,
      createdAt: new Date(),
    };
    tenantClient.camera.create.mockResolvedValue(newCamera);

    const user = { id: 'u2', role: 'ADMIN_EMPRESA', empresaId: 'emp1' };
    const app = buildApp(user, tenantClient);

    const res = await request(app)
      .post('/api/obras/obra1/cameras')
      .send({ codigoLpr: 'LPR-0001', ip: '192.168.1.10' });

    expect(res.status).toBe(201);
    expect(tenantClient.camera.create).toHaveBeenCalledOnce();
    // empresaId must come from req.user (token), NOT from req.body
    expect(tenantClient.camera.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          obraId: 'obra1',
          empresaId: 'emp1',
          codigoLpr: 'LPR-0001',
        }),
      }),
    );
  });

  // Test 10: POST com codigoLpr duplicado (P2002) retorna 409
  it('Test 10: POST com codigoLpr duplicado retorna 409', async () => {
    mockRequireRole.mockImplementation((_req: Request, _res: Response, next: NextFunction) => next());
    tenantClient.obra.findFirstOrThrow.mockResolvedValue({ id: 'obra1' });
    const p2002 = Object.assign(new Error('Unique constraint violation'), { code: 'P2002' });
    tenantClient.camera.create.mockRejectedValue(p2002);

    const user = { id: 'u2', role: 'ADMIN_EMPRESA', empresaId: 'emp1' };
    const app = buildApp(user, tenantClient);

    const res = await request(app)
      .post('/api/obras/obra1/cameras')
      .send({ codigoLpr: 'LPR-DUP', ip: '192.168.1.20' });

    expect(res.status).toBe(409);
    expect(res.body).toHaveProperty('error');
  });

  // Test 11: DELETE /api/obras/:obraId/cameras/:id com ADMIN_EMPRESA chama update com { ativo: false } e retorna 204
  it('Test 11: DELETE /api/obras/:obraId/cameras/:id chama update com ativo: false e retorna 204', async () => {
    mockRequireRole.mockImplementation((_req: Request, _res: Response, next: NextFunction) => next());
    tenantClient.obra.findFirstOrThrow.mockResolvedValue({ id: 'obra1' });
    tenantClient.camera.findFirstOrThrow.mockResolvedValue({ id: 'cam1', obraId: 'obra1' });
    tenantClient.camera.update.mockResolvedValue({ id: 'cam1', ativo: false });

    const user = { id: 'u2', role: 'ADMIN_EMPRESA', empresaId: 'emp1' };
    const app = buildApp(user, tenantClient);

    const res = await request(app).delete('/api/obras/obra1/cameras/cam1');

    expect(res.status).toBe(204);
    expect(tenantClient.camera.update).toHaveBeenCalledOnce();
    expect(tenantClient.camera.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'cam1' },
        data: { ativo: false },
      }),
    );
  });
});
