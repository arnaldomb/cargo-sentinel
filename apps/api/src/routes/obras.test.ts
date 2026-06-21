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
// Import router AFTER mocks are in place
// ---------------------------------------------------------------------------
import obrasRouter from './obras';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function buildTenantClient() {
  return {
    obra: {
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
  // Inject req.user and req.tenantClient before router
  app.use((req: Request, _res: Response, next: NextFunction) => {
    req.user = user;
    req.tenantClient = tenantClient as unknown as Request['tenantClient'];
    next();
  });
  app.use('/api/obras', obrasRouter);
  return app;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------
describe('obras routes', () => {
  let tenantClient: ReturnType<typeof buildTenantClient>;

  beforeEach(() => {
    vi.clearAllMocks();
    tenantClient = buildTenantClient();
  });

  // Test 1: GET /api/obras com OPERADOR retorna 200 e chama tenantClient.obra.findMany
  it('Test 1: GET /api/obras com OPERADOR retorna 200', async () => {
    mockRequireRole.mockImplementation((_req: Request, _res: Response, next: NextFunction) => next());
    tenantClient.obra.findMany.mockResolvedValue([
      { id: 'obra1', nome: 'Obra A', endereco: null, ativo: true, createdAt: new Date() },
    ]);

    const user = { id: 'u1', role: 'OPERADOR', empresaId: 'emp1' };
    const app = buildApp(user, tenantClient);

    const res = await request(app).get('/api/obras');

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(tenantClient.obra.findMany).toHaveBeenCalledOnce();
    expect(tenantClient.obra.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { ativo: true } }),
    );
  });

  // Test 2: POST /api/obras com OPERADOR retorna 403 (requireRole rejeita)
  it('Test 2: POST /api/obras com OPERADOR retorna 403', async () => {
    mockRequireRole.mockImplementation((_req: Request, res: Response, _next: NextFunction) => {
      res.status(403).json({ error: 'Acesso negado' });
    });

    const user = { id: 'u1', role: 'OPERADOR', empresaId: 'emp1' };
    const app = buildApp(user, tenantClient);

    const res = await request(app).post('/api/obras').send({ nome: 'Obra X' });

    expect(res.status).toBe(403);
    expect(tenantClient.obra.create).not.toHaveBeenCalled();
  });

  // Test 3: POST /api/obras com ADMIN_EMPRESA e body { nome: 'Obra X' } retorna 201
  it('Test 3: POST /api/obras com ADMIN_EMPRESA retorna 201 e chama tenantClient.obra.create com empresaId do req.user', async () => {
    mockRequireRole.mockImplementation((_req: Request, _res: Response, next: NextFunction) => next());
    const newObra = { id: 'obra1', nome: 'Obra X', endereco: undefined, ativo: true, empresaId: 'emp1', createdAt: new Date() };
    tenantClient.obra.create.mockResolvedValue(newObra);

    const user = { id: 'u2', role: 'ADMIN_EMPRESA', empresaId: 'emp1' };
    const app = buildApp(user, tenantClient);

    const res = await request(app).post('/api/obras').send({ nome: 'Obra X' });

    expect(res.status).toBe(201);
    expect(tenantClient.obra.create).toHaveBeenCalledOnce();
    // empresaId must come from req.user, NOT from body
    expect(tenantClient.obra.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ empresaId: 'emp1', nome: 'Obra X' }),
      }),
    );
  });

  // Test 4: POST /api/obras com body vazio retorna 400 (validação de nome)
  it('Test 4: POST /api/obras com body vazio retorna 400', async () => {
    mockRequireRole.mockImplementation((_req: Request, _res: Response, next: NextFunction) => next());

    const user = { id: 'u2', role: 'ADMIN_EMPRESA', empresaId: 'emp1' };
    const app = buildApp(user, tenantClient);

    const res = await request(app).post('/api/obras').send({});

    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty('error');
    expect(tenantClient.obra.create).not.toHaveBeenCalled();
  });

  // Test 5: PUT /api/obras/:id com ADMIN_EMPRESA quando findFirstOrThrow lança P2025 retorna 404
  it('Test 5: PUT /api/obras/:id com P2025 retorna 404', async () => {
    mockRequireRole.mockImplementation((_req: Request, _res: Response, next: NextFunction) => next());
    const p2025 = Object.assign(new Error('Not found'), { code: 'P2025' });
    tenantClient.obra.findFirstOrThrow.mockRejectedValue(p2025);

    const user = { id: 'u2', role: 'ADMIN_EMPRESA', empresaId: 'emp1' };
    const app = buildApp(user, tenantClient);

    const res = await request(app).put('/api/obras/nonexistent').send({ nome: 'Nova Obra' });

    expect(res.status).toBe(404);
    expect(res.body).toHaveProperty('error');
    expect(tenantClient.obra.update).not.toHaveBeenCalled();
  });

  // Test 6: DELETE /api/obras/:id com ADMIN_EMPRESA chama update com { ativo: false } e retorna 204
  it('Test 6: DELETE /api/obras/:id chama update com ativo: false e retorna 204', async () => {
    mockRequireRole.mockImplementation((_req: Request, _res: Response, next: NextFunction) => next());
    tenantClient.obra.findFirstOrThrow.mockResolvedValue({ id: 'obra1', nome: 'Obra A', empresaId: 'emp1' });
    tenantClient.obra.update.mockResolvedValue({ id: 'obra1', ativo: false });

    const user = { id: 'u2', role: 'ADMIN_EMPRESA', empresaId: 'emp1' };
    const app = buildApp(user, tenantClient);

    const res = await request(app).delete('/api/obras/obra1');

    expect(res.status).toBe(204);
    expect(tenantClient.obra.update).toHaveBeenCalledOnce();
    expect(tenantClient.obra.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'obra1' },
        data: { ativo: false },
      }),
    );
  });
});
