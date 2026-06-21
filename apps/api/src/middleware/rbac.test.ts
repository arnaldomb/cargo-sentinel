import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Request, Response, NextFunction } from 'express';
import { requireRole } from './rbac';

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

describe('requireRole', () => {
  let next: NextFunction;

  beforeEach(() => {
    next = vi.fn();
  });

  it('Test 3: rejects OPERADOR attempting ADMIN_EMPRESA route with 403 (AUTH-03 / TENANT-06)', () => {
    const req = buildReq({
      user: { id: 'u1', role: 'OPERADOR', empresaId: 'emp1' },
    });
    const res = buildRes();

    requireRole('ADMIN_EMPRESA')(req, res, next);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(next).not.toHaveBeenCalled();
  });

  it('Test 4: calls next() when role is in allowed roles list', () => {
    const req = buildReq({
      user: { id: 'u2', role: 'ADMIN_EMPRESA', empresaId: 'emp1' },
    });
    const res = buildRes();

    requireRole('ADMIN_EMPRESA', 'SUPER_ADMIN')(req, res, next);

    expect(next).toHaveBeenCalledOnce();
    expect(res.status).not.toHaveBeenCalled();
  });

  it('Test 5: returns 403 when req.user is missing', () => {
    const req = buildReq({ user: undefined });
    const res = buildRes();

    requireRole('ADMIN_EMPRESA')(req, res, next);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(next).not.toHaveBeenCalled();
  });

  it('SUPER_ADMIN is allowed when included in roles', () => {
    const req = buildReq({
      user: { id: 'sa', role: 'SUPER_ADMIN', empresaId: null },
    });
    const res = buildRes();

    requireRole('ADMIN_EMPRESA', 'SUPER_ADMIN')(req, res, next);

    expect(next).toHaveBeenCalledOnce();
    expect(res.status).not.toHaveBeenCalled();
  });

  it('SUPER_ADMIN is rejected when not in allowed roles', () => {
    const req = buildReq({
      user: { id: 'sa', role: 'SUPER_ADMIN', empresaId: null },
    });
    const res = buildRes();

    requireRole('OPERADOR')(req, res, next);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(next).not.toHaveBeenCalled();
  });
});
