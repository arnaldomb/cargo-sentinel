import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Request, Response, NextFunction } from 'express';
import type { PrismaClient } from '@prisma/client';

// Use vi.hoisted so the mock values are available when vi.mock factory runs (hoisted to top)
const { mockPrisma, mockTenantClient, mockCreateTenantClient } = vi.hoisted(() => {
  const mockTenantClient = { isMockTenantClient: true };
  const mockPrisma = { isMockPrisma: true } as unknown as PrismaClient;
  const mockCreateTenantClient = vi.fn().mockReturnValue(mockTenantClient);
  return { mockPrisma, mockTenantClient, mockCreateTenantClient };
});

vi.mock('@cargo-sentinel/database', () => ({
  prisma: mockPrisma,
  createTenantClient: mockCreateTenantClient,
}));

import { tenantMiddleware } from './tenant';

function buildReq(overrides: Partial<Request> = {}): Request {
  return {
    user: undefined,
    ...overrides,
  } as unknown as Request;
}

function buildRes() {
  const json = vi.fn();
  const status = vi.fn().mockReturnValue({ json });
  return { status, json } as unknown as Response & { status: ReturnType<typeof vi.fn>; json: ReturnType<typeof vi.fn> };
}

describe('tenantMiddleware', () => {
  let next: NextFunction;

  beforeEach(() => {
    vi.clearAllMocks();
    next = vi.fn();
  });

  it('Test 1: sets req.tenantClient via createTenantClient for normal user with empresaId', () => {
    const req = buildReq({
      user: { id: 'user1', role: 'OPERADOR', empresaId: 'emp1' },
    });
    const res = buildRes();

    tenantMiddleware(req, res, next);

    expect(mockCreateTenantClient).toHaveBeenCalledWith(mockPrisma, 'emp1');
    expect(req.tenantClient).toBe(mockTenantClient);
    expect(next).toHaveBeenCalledOnce();
    expect(res.status).not.toHaveBeenCalled();
  });

  it('Test 2: SUPER_ADMIN gets prisma raw WITHOUT calling createTenantClient (Pitfall 4)', () => {
    const req = buildReq({
      user: { id: 'admin1', role: 'SUPER_ADMIN', empresaId: null },
    });
    const res = buildRes();

    tenantMiddleware(req, res, next);

    // Critical: createTenantClient must NOT be called for SUPER_ADMIN
    expect(mockCreateTenantClient).not.toHaveBeenCalled();
    expect(req.tenantClient).toBe(mockPrisma);
    expect(next).toHaveBeenCalledOnce();
    expect(res.status).not.toHaveBeenCalled();
  });

  it('returns 401 when req.user is undefined', () => {
    const req = buildReq({ user: undefined });
    const res = buildRes();

    tenantMiddleware(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });

  it('returns 403 for normal user with no empresaId (null — not SUPER_ADMIN)', () => {
    const req = buildReq({
      user: { id: 'user2', role: 'OPERADOR', empresaId: null },
    });
    const res = buildRes();

    tenantMiddleware(req, res, next);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(mockCreateTenantClient).not.toHaveBeenCalled();
    expect(next).not.toHaveBeenCalled();
  });
});
