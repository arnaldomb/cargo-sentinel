import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Request, Response, NextFunction } from 'express';
import express from 'express';
import request from 'supertest';

const { mockRequireRole, getPresignedUrlMock } = vi.hoisted(() => {
  const mockRequireRole = vi.fn();
  const getPresignedUrlMock = vi.fn();
  return { mockRequireRole, getPresignedUrlMock };
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

vi.mock('../services/garage', () => ({
  getPresignedUrl: getPresignedUrlMock,
}));

import placasRouter from './placas';

function buildTenantClient() {
  return {
    placa: {
      findFirstOrThrow: vi.fn(),
      findFirst: vi.fn(),
      update: vi.fn(),
    },
    evento: {
      findFirst: vi.fn().mockResolvedValue(null), // default: sem evento recente
      findMany: vi.fn(),
    },
    classificacaoHistorico: {
      create: vi.fn(),
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
  app.use('/api/placas', placasRouter);
  return app;
}

describe('placas routes', () => {
  let tenantClient: ReturnType<typeof buildTenantClient>;

  beforeEach(() => {
    vi.clearAllMocks();
    tenantClient = buildTenantClient();
  });

  // -----------------------------------------------------------------------
  // PATCH /:placaId/classificacao — testes existentes
  // -----------------------------------------------------------------------

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

  // -----------------------------------------------------------------------
  // GET /:numero/historico — HISTORY-01, HISTORY-04
  // -----------------------------------------------------------------------

  const samplePlaca = {
    id: 'pla1',
    numero: 'ABC1234',
    classificacao: 'VISITANTE',
    empresaTransportadora: null,
    motorista: null,
    tipoVeiculo: null,
    observacao: null,
  };

  const sampleEvento = {
    id: 'evt1',
    timestamp: new Date('2026-06-21T06:00:00.000Z'),
    direcao: 'ENTRADA' as const,
    fotoGarageKey: 'fotos/2026/evt1.jpg',
    classificacao: 'VISITANTE',
    obra: { id: 'obra1', nome: 'Obra Centro' },
    camera: { id: 'cam1', codigoLpr: 'LPR-0001' },
  };

  it('GET /:numero/historico retorna items e nextCursor null quando menos que limit', async () => {
    mockRequireRole.mockImplementation((_req: Request, _res: Response, next: NextFunction) => next());
    getPresignedUrlMock.mockResolvedValue('https://garage.example/thumb.jpg');
    tenantClient.placa.findFirst.mockResolvedValue(samplePlaca);
    tenantClient.evento.findMany.mockResolvedValue([sampleEvento]);

    const app = buildApp({ id: 'user1', role: 'OPERADOR', empresaId: 'emp1' }, tenantClient);

    const res = await request(app).get('/api/placas/abc1234/historico?limit=10');

    expect(res.status).toBe(200);
    // numero normalizado para uppercase
    expect(tenantClient.placa.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { numero: 'ABC1234' } }),
    );
    expect(res.body.placa.id).toBe('pla1');
    expect(res.body.items).toHaveLength(1);
    expect(res.body.items[0]).toMatchObject({
      id: 'evt1',
      direcao: 'ENTRADA',
      classificacao: 'VISITANTE',
      thumbnailUrl: 'https://garage.example/thumb.jpg',
      obra: { id: 'obra1', nome: 'Obra Centro' },
      camera: { id: 'cam1', codigoLpr: 'LPR-0001' },
    });
    expect(res.body.nextCursor).toBeNull();
  });

  it('GET /:numero/historico retorna 404 quando placa não encontrada no tenant', async () => {
    mockRequireRole.mockImplementation((_req: Request, _res: Response, next: NextFunction) => next());
    tenantClient.placa.findFirst.mockResolvedValue(null);

    const app = buildApp({ id: 'user1', role: 'OPERADOR', empresaId: 'emp1' }, tenantClient);

    const res = await request(app).get('/api/placas/XYZ9999/historico');

    expect(res.status).toBe(404);
    expect(res.body.error).toBe('Placa não encontrada');
    expect(tenantClient.evento.findMany).not.toHaveBeenCalled();
  });

  it('GET /:numero/historico inclui obraId no where quando filtro fornecido', async () => {
    mockRequireRole.mockImplementation((_req: Request, _res: Response, next: NextFunction) => next());
    getPresignedUrlMock.mockResolvedValue(null);
    tenantClient.placa.findFirst.mockResolvedValue(samplePlaca);
    tenantClient.evento.findMany.mockResolvedValue([]);

    const app = buildApp({ id: 'user1', role: 'OPERADOR', empresaId: 'emp1' }, tenantClient);

    await request(app).get('/api/placas/ABC1234/historico?obraId=obra1');

    expect(tenantClient.evento.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ placaId: 'pla1', obraId: 'obra1' }),
      }),
    );
  });

  it('GET /:numero/historico retorna nextCursor quando há mais items que limit', async () => {
    mockRequireRole.mockImplementation((_req: Request, _res: Response, next: NextFunction) => next());
    getPresignedUrlMock.mockResolvedValue(null);
    tenantClient.placa.findFirst.mockResolvedValue(samplePlaca);
    // Return limit+1 items (3 for limit=2)
    const eventos = Array.from({ length: 3 }, (_, i) => ({
      ...sampleEvento,
      id: `evt${i + 1}`,
      fotoGarageKey: null,
    }));
    tenantClient.evento.findMany.mockResolvedValue(eventos);

    const app = buildApp({ id: 'user1', role: 'OPERADOR', empresaId: 'emp1' }, tenantClient);

    const res = await request(app).get('/api/placas/ABC1234/historico?limit=2');

    expect(res.status).toBe(200);
    expect(res.body.items).toHaveLength(2);
    expect(res.body.nextCursor).toBe('evt2');
  });

  it('GET /:numero/historico thumbnailUrl é null quando fotoGarageKey ausente', async () => {
    mockRequireRole.mockImplementation((_req: Request, _res: Response, next: NextFunction) => next());
    tenantClient.placa.findFirst.mockResolvedValue(samplePlaca);
    tenantClient.evento.findMany.mockResolvedValue([{ ...sampleEvento, fotoGarageKey: null }]);

    const app = buildApp({ id: 'user1', role: 'OPERADOR', empresaId: 'emp1' }, tenantClient);

    const res = await request(app).get('/api/placas/ABC1234/historico');

    expect(res.body.items[0].thumbnailUrl).toBeNull();
    expect(getPresignedUrlMock).not.toHaveBeenCalled();
  });

  // -----------------------------------------------------------------------
  // GET /:numero/classificacoes — HISTORY-02
  // -----------------------------------------------------------------------

  it('GET /:numero/classificacoes retorna audit trail com usuario.nome em cada item', async () => {
    mockRequireRole.mockImplementation((_req: Request, _res: Response, next: NextFunction) => next());
    tenantClient.placa.findFirst.mockResolvedValue({
      id: 'pla1',
      numero: 'ABC1234',
      classificacao: 'SUSPEITO',
    });
    tenantClient.classificacaoHistorico.findMany.mockResolvedValue([
      {
        id: 'hist1',
        createdAt: new Date('2026-06-21T05:00:00.000Z'),
        classificacaoDe: 'VISITANTE',
        classificacaoPara: 'SUSPEITO',
        observacao: 'Visto 3x na mesma semana',
        usuario: { id: 'user1', nome: 'João Silva' },
      },
    ]);

    const app = buildApp({ id: 'user1', role: 'OPERADOR', empresaId: 'emp1' }, tenantClient);

    const res = await request(app).get('/api/placas/ABC1234/classificacoes');

    expect(res.status).toBe(200);
    expect(res.body.placa.classificacao).toBe('SUSPEITO');
    expect(res.body.items).toHaveLength(1);
    expect(res.body.items[0]).toMatchObject({
      id: 'hist1',
      classificacaoDe: 'VISITANTE',
      classificacaoPara: 'SUSPEITO',
      observacao: 'Visto 3x na mesma semana',
      usuario: { id: 'user1', nome: 'João Silva' },
    });
    // createdAt serializado como ISO string
    expect(typeof res.body.items[0].createdAt).toBe('string');
  });

  it('GET /:numero/classificacoes retorna 404 quando placa não encontrada', async () => {
    mockRequireRole.mockImplementation((_req: Request, _res: Response, next: NextFunction) => next());
    tenantClient.placa.findFirst.mockResolvedValue(null);

    const app = buildApp({ id: 'user1', role: 'OPERADOR', empresaId: 'emp1' }, tenantClient);

    const res = await request(app).get('/api/placas/XYZ9999/classificacoes');

    expect(res.status).toBe(404);
    expect(tenantClient.classificacaoHistorico.findMany).not.toHaveBeenCalled();
  });
});
