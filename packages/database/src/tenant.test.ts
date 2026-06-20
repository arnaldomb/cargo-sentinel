import { describe, it, expect, vi } from 'vitest';
import { createTenantClient } from './tenant';

describe('createTenantClient', () => {
  it('is a callable function', () => {
    expect(typeof createTenantClient).toBe('function');
  });
  it('extends the prisma client once', () => {
    const mockPrisma = { $extends: vi.fn().mockReturnValue({ __tenant: true }) } as any;
    const result = createTenantClient(mockPrisma, 'empresa-x') as unknown as { __tenant: boolean };
    expect(mockPrisma.$extends).toHaveBeenCalledOnce();
    expect(result.__tenant).toBe(true);
  });
});
