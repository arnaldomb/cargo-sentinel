import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock @cargo-sentinel/database before importing auth
vi.mock('@cargo-sentinel/database', () => ({
  prisma: {
    user: {
      findUnique: vi.fn(),
    },
  },
}));

// Mock bcryptjs
vi.mock('bcryptjs', () => ({
  default: {
    compare: vi.fn(),
  },
}));

// Mock next-auth to avoid edge runtime issues in tests
vi.mock('next-auth', () => ({
  default: vi.fn(() => ({
    handlers: { GET: vi.fn(), POST: vi.fn() },
    auth: vi.fn(),
    signIn: vi.fn(),
    signOut: vi.fn(),
  })),
}));

vi.mock('next-auth/providers/credentials', () => ({
  default: vi.fn((config) => config),
}));

import { prisma } from '@cargo-sentinel/database';
import bcryptjs from 'bcryptjs';
import { authorizeUser } from './auth';

const mockPrismaUser = prisma.user as { findUnique: ReturnType<typeof vi.fn> };
const mockBcrypt = bcryptjs as { compare: ReturnType<typeof vi.fn> };

describe('authorizeUser', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('Test 1: returns user object when email exists and password is correct', async () => {
    mockPrismaUser.findUnique.mockResolvedValue({
      id: 'user-1',
      email: 'admin@demo.com',
      nome: 'Admin',
      role: 'ADMIN_EMPRESA',
      empresaId: 'empresa-1',
      passwordHash: '$2b$10$hashedpassword',
      empresa: { status: 'ATIVO' },
    });
    mockBcrypt.compare.mockResolvedValue(true);

    const result = await authorizeUser({ email: 'admin@demo.com', password: 'Admin123!' });

    expect(result).toEqual({
      id: 'user-1',
      email: 'admin@demo.com',
      name: 'Admin',
      role: 'ADMIN_EMPRESA',
      empresaId: 'empresa-1',
    });
  });

  it('Test 2: returns null when password is wrong', async () => {
    mockPrismaUser.findUnique.mockResolvedValue({
      id: 'user-1',
      email: 'admin@demo.com',
      nome: 'Admin',
      role: 'ADMIN_EMPRESA',
      empresaId: 'empresa-1',
      passwordHash: '$2b$10$hashedpassword',
      empresa: { status: 'ATIVO' },
    });
    mockBcrypt.compare.mockResolvedValue(false);

    const result = await authorizeUser({ email: 'admin@demo.com', password: 'WrongPass!' });

    expect(result).toBeNull();
  });

  it('Test 3: returns null when email does not exist', async () => {
    mockPrismaUser.findUnique.mockResolvedValue(null);

    const result = await authorizeUser({ email: 'nonexistent@demo.com', password: 'Any123!' });

    expect(result).toBeNull();
  });

  it('Test 4: returns null when empresa status is SUSPENSO (TENANT-01)', async () => {
    mockPrismaUser.findUnique.mockResolvedValue({
      id: 'user-2',
      email: 'operador@suspensa.com',
      nome: 'Operador',
      role: 'OPERADOR',
      empresaId: 'empresa-suspensa',
      passwordHash: '$2b$10$hashedpassword',
      empresa: { status: 'SUSPENSO' },
    });
    mockBcrypt.compare.mockResolvedValue(true);

    const result = await authorizeUser({ email: 'operador@suspensa.com', password: 'Correct123!' });

    expect(result).toBeNull();
  });

  it('Test 5: callback jwt copies user.role and user.empresaId to token on first login', async () => {
    const { authConfig } = await import('./auth.config');

    const token = { sub: undefined as string | undefined };
    const user = {
      id: 'user-1',
      role: 'ADMIN_EMPRESA' as const,
      empresaId: 'empresa-1',
    };

    const result = (authConfig.callbacks as { jwt: Function }).jwt({ token, user, account: null, trigger: 'signIn' } as any);

    expect(result).toMatchObject({
      role: 'ADMIN_EMPRESA',
      empresaId: 'empresa-1',
    });
  });

  it('Test 6: callback session exposes token.sub as session.user.id, token.role and token.empresaId', async () => {
    const { authConfig } = await import('./auth.config');

    const token = {
      sub: 'user-1',
      role: 'OPERADOR' as const,
      empresaId: 'empresa-2',
    };
    const session = {
      user: { name: 'Test', email: 'test@demo.com', image: null },
      expires: new Date(Date.now() + 86400000).toISOString(),
    };

    const result = (authConfig.callbacks as { session: Function }).session({ session, token } as any);

    expect(result.user.id).toBe('user-1');
    expect(result.user.role).toBe('OPERADOR');
    expect(result.user.empresaId).toBe('empresa-2');
  });
});
