import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Request, Response, NextFunction } from 'express';
import express from 'express';
import request from 'supertest';

// ---------------------------------------------------------------------------
// vi.hoisted garante que os mocks estejam disponíveis quando vi.mock executa
// ---------------------------------------------------------------------------
const { mockPrisma, capturedPayloads } = vi.hoisted(() => {
  // Captura os payloads passados ao EncryptJWT para assertions
  const capturedPayloads: {
    constructorArg?: Record<string, unknown>;
    subject?: string;
    expirationTime?: string;
  }[] = [];

  const mockPrisma = {
    empresa: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
    user: {
      findFirst: vi.fn(),
      create: vi.fn(),
    },
    $transaction: vi.fn(),
  };
  return { mockPrisma, capturedPayloads };
});

// ---------------------------------------------------------------------------
// Mock @cargo-sentinel/database
// ---------------------------------------------------------------------------
vi.mock('@cargo-sentinel/database', () => ({
  prisma: mockPrisma,
}));

// ---------------------------------------------------------------------------
// Mock bcryptjs — hash determinístico nos testes
// ---------------------------------------------------------------------------
vi.mock('bcryptjs', () => ({
  default: {
    hash: vi.fn().mockResolvedValue('hashed_password'),
    compare: vi.fn().mockResolvedValue(true),
  },
}));

// ---------------------------------------------------------------------------
// Mock jose EncryptJWT — classe que captura args e retorna token fixo
// ---------------------------------------------------------------------------
vi.mock('jose', () => {
  class EncryptJWT {
    private _record: {
      constructorArg?: Record<string, unknown>;
      subject?: string;
      expirationTime?: string;
    } = {};

    constructor(payload: Record<string, unknown>) {
      this._record.constructorArg = payload;
      capturedPayloads.push(this._record);
    }
    setProtectedHeader(_header: Record<string, unknown>) { return this; }
    setSubject(sub: string) {
      this._record.subject = sub;
      return this;
    }
    setIssuedAt() { return this; }
    setExpirationTime(exp: string) {
      this._record.expirationTime = exp;
      return this;
    }
    async encrypt(_key: Uint8Array) { return 'mock-jwe-token'; }
  }
  return { EncryptJWT };
});

// ---------------------------------------------------------------------------
// Mock @panva/hkdf — retorna buffer fixo sem I/O
// ---------------------------------------------------------------------------
vi.mock('@panva/hkdf', () => ({
  hkdf: vi.fn().mockResolvedValue(new Uint8Array(64)),
}));

// ---------------------------------------------------------------------------
// Import router APÓS os mocks
// ---------------------------------------------------------------------------
import adminRouter from './admin';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function buildApp(user: Request['user']) {
  const app = express();
  app.use(express.json());
  // Injeta req.user antes do router (simula authMiddleware + requireRole)
  app.use((req: Request, _res: Response, next: NextFunction) => {
    req.user = user;
    next();
  });
  app.use('/api/admin', adminRouter);
  return app;
}

const superAdmin = { id: 'sa-001', role: 'SUPER_ADMIN', empresaId: null };

// ---------------------------------------------------------------------------
// Dados de fixtures
// ---------------------------------------------------------------------------
const empresaFixture = {
  id: 'emp-001',
  nome: 'Construtora Alpha',
  cnpj: '12345678000195',
  status: 'ATIVO',
  createdAt: new Date('2026-01-01').toISOString(),
  _count: { obras: 3, cameras: 5, eventos: 120, users: 2 },
};

const adminUserFixture = {
  id: 'user-001',
  email: 'admin@alpha.com',
  nome: 'Admin Alpha',
  role: 'ADMIN_EMPRESA',
  empresaId: 'emp-001',
  passwordHash: 'hashed_password',
  createdAt: new Date('2026-01-01'),
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------
describe('admin routes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    capturedPayloads.length = 0;
    process.env.AUTH_SECRET = 'test-secret-32-chars-minimum-length';
  });

  // ==========================================================================
  // GET /api/admin/empresas
  // ==========================================================================
  describe('GET /api/admin/empresas', () => {
    it('retorna 200 com lista de empresas e contagens', async () => {
      mockPrisma.empresa.findMany.mockResolvedValue([empresaFixture]);

      const app = buildApp(superAdmin);
      const res = await request(app).get('/api/admin/empresas');

      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
      expect(res.body).toHaveLength(1);
      expect(res.body[0]).toMatchObject({
        id: 'emp-001',
        nome: 'Construtora Alpha',
        cnpj: '12345678000195',
        status: 'ATIVO',
        _count: { obras: 3, cameras: 5, eventos: 120 },
      });
      expect(mockPrisma.empresa.findMany).toHaveBeenCalledOnce();
      expect(mockPrisma.empresa.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          orderBy: { createdAt: 'desc' },
          include: expect.objectContaining({
            _count: expect.objectContaining({
              select: expect.objectContaining({
                obras: true,
                cameras: true,
                eventos: true,
              }),
            }),
          }),
        }),
      );
    });

    it('retorna 200 com array vazio quando não há empresas', async () => {
      mockPrisma.empresa.findMany.mockResolvedValue([]);

      const app = buildApp(superAdmin);
      const res = await request(app).get('/api/admin/empresas');

      expect(res.status).toBe(200);
      expect(res.body).toEqual([]);
    });
  });

  // ==========================================================================
  // POST /api/admin/empresas
  // ==========================================================================
  describe('POST /api/admin/empresas', () => {
    const validBody = {
      nome: 'Construtora Beta',
      cnpj: '98765432000196',
      adminEmail: 'admin@beta.com',
      adminNome: 'Admin Beta',
      adminSenha: 'senha1234',
    };

    it('cria empresa e admin em transação — retorna 201 sem passwordHash', async () => {
      mockPrisma.$transaction.mockImplementation(
        async (fn: (tx: typeof mockPrisma) => Promise<unknown>) => {
          const empresaCriada = {
            id: 'emp-002',
            nome: 'Construtora Beta',
            cnpj: '98765432000196',
            status: 'ATIVO',
            createdAt: new Date(),
          };
          const userCriado = {
            id: 'user-002',
            email: 'admin@beta.com',
            nome: 'Admin Beta',
            role: 'ADMIN_EMPRESA',
            empresaId: 'emp-002',
            passwordHash: 'hashed_password',
          };

          mockPrisma.empresa.create.mockResolvedValue(empresaCriada);
          mockPrisma.user.create.mockResolvedValue(userCriado);

          return fn({
            empresa: mockPrisma.empresa,
            user: mockPrisma.user,
          } as unknown as typeof mockPrisma);
        },
      );

      const app = buildApp(superAdmin);
      const res = await request(app).post('/api/admin/empresas').send(validBody);

      expect(res.status).toBe(201);
      expect(res.body).toHaveProperty('empresa');
      expect(res.body).toHaveProperty('user');
      // T-07-05: passwordHash não deve aparecer na resposta
      expect(res.body.user).not.toHaveProperty('passwordHash');
      expect(res.body.user).toMatchObject({
        email: 'admin@beta.com',
        nome: 'Admin Beta',
        role: 'ADMIN_EMPRESA',
      });
    });

    it('retorna 400 se CNPJ duplicado (P2002)', async () => {
      const prismaError = { code: 'P2002', meta: { target: ['cnpj'] } };
      mockPrisma.$transaction.mockRejectedValue(prismaError);

      const app = buildApp(superAdmin);
      const res = await request(app).post('/api/admin/empresas').send(validBody);

      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/CNPJ/i);
    });

    it('retorna 400 se email duplicado (P2002)', async () => {
      const prismaError = { code: 'P2002', meta: { target: ['email'] } };
      mockPrisma.$transaction.mockRejectedValue(prismaError);

      const app = buildApp(superAdmin);
      const res = await request(app).post('/api/admin/empresas').send(validBody);

      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/[Ee]-?mail/);
    });

    it('retorna 400 se nome ausente ou muito curto', async () => {
      const app = buildApp(superAdmin);
      const res = await request(app)
        .post('/api/admin/empresas')
        .send({ ...validBody, nome: 'A' });
      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/nome/i);
    });

    it('retorna 400 se adminEmail inválido', async () => {
      const app = buildApp(superAdmin);
      const res = await request(app)
        .post('/api/admin/empresas')
        .send({ ...validBody, adminEmail: 'nao-e-email' });
      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/adminEmail/i);
    });

    it('retorna 400 se adminSenha com menos de 8 chars', async () => {
      const app = buildApp(superAdmin);
      const res = await request(app)
        .post('/api/admin/empresas')
        .send({ ...validBody, adminSenha: '1234567' });
      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/adminSenha/i);
    });

    it('retorna 400 se CNPJ com menos de 14 dígitos', async () => {
      const app = buildApp(superAdmin);
      const res = await request(app)
        .post('/api/admin/empresas')
        .send({ ...validBody, cnpj: '1234567' });
      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/cnpj/i);
    });
  });

  // ==========================================================================
  // PATCH /api/admin/empresas/:id/status
  // ==========================================================================
  describe('PATCH /api/admin/empresas/:id/status', () => {
    it('suspende empresa — retorna 200 com empresa atualizada', async () => {
      mockPrisma.empresa.update.mockResolvedValue({ ...empresaFixture, status: 'SUSPENSO' });

      const app = buildApp(superAdmin);
      const res = await request(app)
        .patch('/api/admin/empresas/emp-001/status')
        .send({ status: 'SUSPENSO' });

      expect(res.status).toBe(200);
      expect(res.body.status).toBe('SUSPENSO');
      expect(mockPrisma.empresa.update).toHaveBeenCalledWith({
        where: { id: 'emp-001' },
        data: { status: 'SUSPENSO' },
      });
    });

    it('reativa empresa — retorna 200 com status ATIVO', async () => {
      mockPrisma.empresa.update.mockResolvedValue({ ...empresaFixture, status: 'ATIVO' });

      const app = buildApp(superAdmin);
      const res = await request(app)
        .patch('/api/admin/empresas/emp-001/status')
        .send({ status: 'ATIVO' });

      expect(res.status).toBe(200);
      expect(res.body.status).toBe('ATIVO');
    });

    it('retorna 400 se status inválido', async () => {
      const app = buildApp(superAdmin);
      const res = await request(app)
        .patch('/api/admin/empresas/emp-001/status')
        .send({ status: 'INVALIDO' });

      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/ATIVO|SUSPENSO/);
    });

    it('retorna 404 se empresa não encontrada (P2025)', async () => {
      const prismaError = { code: 'P2025' };
      mockPrisma.empresa.update.mockRejectedValue(prismaError);

      const app = buildApp(superAdmin);
      const res = await request(app)
        .patch('/api/admin/empresas/inexistente/status')
        .send({ status: 'SUSPENSO' });

      expect(res.status).toBe(404);
      expect(res.body.error).toMatch(/não encontrada/i);
    });
  });

  // ==========================================================================
  // POST /api/admin/empresas/:id/impersonate
  // ==========================================================================
  describe('POST /api/admin/empresas/:id/impersonate', () => {
    it('retorna 200 com token JWE e expiresAt quando empresa e admin existem', async () => {
      mockPrisma.empresa.findUnique.mockResolvedValue(empresaFixture);
      mockPrisma.user.findFirst.mockResolvedValue(adminUserFixture);

      const app = buildApp(superAdmin);
      const res = await request(app).post('/api/admin/empresas/emp-001/impersonate');

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('token');
      expect(res.body).toHaveProperty('expiresAt');
      expect(res.body.token).toBe('mock-jwe-token');
      // expiresAt deve ser uma string ISO com ~15min no futuro
      const expiresAt = new Date(res.body.expiresAt);
      expect(expiresAt.getTime()).toBeGreaterThan(Date.now() + 14 * 60 * 1000);
      expect(expiresAt.getTime()).toBeLessThan(Date.now() + 16 * 60 * 1000);
    });

    it('token inclui payload com role ADMIN_EMPRESA, empresaId e impersonatedBy', async () => {
      mockPrisma.empresa.findUnique.mockResolvedValue(empresaFixture);
      mockPrisma.user.findFirst.mockResolvedValue(adminUserFixture);

      const app = buildApp(superAdmin);
      await request(app).post('/api/admin/empresas/emp-001/impersonate');

      // Verifica que EncryptJWT foi instanciado com payload correto
      expect(capturedPayloads).toHaveLength(1);
      expect(capturedPayloads[0].constructorArg).toMatchObject({
        role: 'ADMIN_EMPRESA',
        empresaId: 'emp-001',
        impersonatedBy: 'sa-001',
      });
      expect(capturedPayloads[0].subject).toBe('user-001');
      expect(capturedPayloads[0].expirationTime).toBe('15m');
    });

    it('retorna 404 se empresa não encontrada', async () => {
      mockPrisma.empresa.findUnique.mockResolvedValue(null);

      const app = buildApp(superAdmin);
      const res = await request(app).post('/api/admin/empresas/inexistente/impersonate');

      expect(res.status).toBe(404);
      expect(res.body.error).toMatch(/empresa/i);
    });

    it('retorna 404 se empresa não tem ADMIN_EMPRESA', async () => {
      mockPrisma.empresa.findUnique.mockResolvedValue(empresaFixture);
      mockPrisma.user.findFirst.mockResolvedValue(null);

      const app = buildApp(superAdmin);
      const res = await request(app).post('/api/admin/empresas/emp-001/impersonate');

      expect(res.status).toBe(404);
      expect(res.body.error).toMatch(/ADMIN_EMPRESA/i);
    });
  });

  // ==========================================================================
  // Proteção de role (teste de integração básico)
  // O requireRole('SUPER_ADMIN') real é aplicado em index.ts.
  // Aqui validamos que as rotas respondem corretamente para SUPER_ADMIN.
  // ==========================================================================
  describe('proteção requireRole SUPER_ADMIN', () => {
    it('GET /empresas acessível com SUPER_ADMIN', async () => {
      mockPrisma.empresa.findMany.mockResolvedValue([]);
      const app = buildApp(superAdmin);
      const res = await request(app).get('/api/admin/empresas');
      expect(res.status).toBe(200);
    });
  });
});
