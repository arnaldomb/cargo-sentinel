import type { createTenantClient } from '@cargo-sentinel/database';

declare global {
  namespace Express {
    interface Request {
      user?: {
        id: string;
        role: string;
        empresaId: string | null;
      };
      tenantClient?: ReturnType<typeof createTenantClient>;
    }
  }
}

export {};
