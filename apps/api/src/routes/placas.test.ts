import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Request, Response, NextFunction } from 'express';
import express from 'express';
import request from 'supertest';

const { mockRequireRole } = vi.hoisted(() => {
  const mockRequireRole = vi.fn();
  return { mockRequireRole };
});

vi.mock('../middleware/pipeline', () => ({
  protectedPipeline: [],
}));

vi.mock('../middleware/rbac', () => ({
  requireRole: (..._roles: string[]) => mockRequireRole,
}));

vi.mock('../realtime/server', () => ({
  emitPlacaClassificada: vi.fn(),
}));

import placasRouter from './placas';

function buildTenantClient() {
  return {
    placa: {
      findFirstOrThrow: vi.fn(),
      update: vi.fn(),
    },
    evento: {
      findFirst: vi.fn().mockResolvedValue(null), // default: sem evento recente
    },
    classificacaoHistorico: {
      create: vi.fn(),
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
  app.use('/api/placas', placasRouter);
  return app;
}

describe('placas routes', () => {
  let tenantClient: ReturnType<typeof buildTenantClient>;

  beforeEach(() => {
    vi.clearAllMocks();
    tenantClient = buildTenantClient();
  });

  it('reclassifica placa dentro do tenant e grava auditoria', async () => {
    mockRequireRole.mockImplementation((_req: Request, _res: Response, next: NextFunction) => next());
    tenantClient.placa.findFirstOrThrow.mockResolvedValue({
      id: 'pla1',
      empresaId: 'emp1',
      classificacao: 'VISITANTE',
      observacao: null,
    });
    tenantClient.placa.update.mockResolvedValue({
      id: 'pla1',
      numero: 'ABC1234',
      empresaId: 'emp1',
      classificacao: 'ATENCAO',
      observacao: 'Carga fora do padrão',
      updatedAt: new Date('2026-06-21T05:20:00.000Z'),
    });
    tenantClient.classificacaoHistorico.create.mockResolvedValue({
      id: 'hist1',
      createdAt: new Date('2026-06-21T05:20:00.000Z'),
      classificacaoDe: 'VISITANTE',
      classificacaoPara: 'ATENCAO',
      usuarioId: 'user1',
    });

    const app = buildApp({ id: 'user1', role: 'OPERADOR', empresaId: 'emp1' }, tenantClient);

    const res = await request(app)
      .patch('/api/placas/pla1/classificacao')
      .send({ classificacao: 'ATENCAO', observacao: 'Carga fora do padrão' });

    expect(res.status).toBe(200);
    expect(tenantClient.placa.findFirstOrThrow).toHaveBeenCalledWith({
      where: { id: 'pla1' },
      select: { id: true, empresaId: true, classificacao: true, observacao: true },
    });
    expect(tenantClient.placa.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'pla1' },
        data: { classificacao: 'ATENCAO', observacao: 'Carga fora do padrão' },
      }),
    );
    expect(tenantClient.classificacaoHistorico.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          placaId: 'pla1',
          empresaId: 'emp1',
          classificacaoDe: 'VISITANTE',
          classificacaoPara: 'ATENCAO',
          usuarioId: 'user1',
        }),
      }),
    );
    expect(res.body).toHaveProperty('placa.classificacao', 'ATENCAO');
    expect(res.body).toHaveProperty('auditoria.classificacaoPara', 'ATENCAO');
  });

  it('retorna 404 quando a placa não pertence ao tenant', async () => {
    mockRequireRole.mockImplementation((_req: Request, _res: Response, next: NextFunction) => next());
    const p2025 = Object.assign(new Error('Not found'), { code: 'P2025' });
    tenantClient.placa.findFirstOrThrow.mockRejectedValue(p2025);

    const app = buildApp({ id: 'user1', role: 'OPERADOR', empresaId: 'emp1' }, tenantClient);

    const res = await request(app)
      .patch('/api/placas/pla-fora/classificacao')
      .send({ classificacao: 'SUSPEITO' });

    expect(res.status).toBe(404);
    expect(tenantClient.placa.update).not.toHaveBeenCalled();
    expect(tenantClient.classificacaoHistorico.create).not.toHaveBeenCalled();
  });

  it('retorna 400 para classificação inválida', async () => {
    mockRequireRole.mockImplementation((_req: Request, _res: Response, next: NextFunction) => next());

    const app = buildApp({ id: 'user1', role: 'OPERADOR', empresaId: 'emp1' }, tenantClient);

    const res = await request(app)
      .patch('/api/placas/pla1/classificacao')
      .send({ classificacao: 'DESCONHECIDA' });

    expect(res.status).toBe(400);
    expect(tenantClient.placa.findFirstOrThrow).not.toHaveBeenCalled();
  });
});
