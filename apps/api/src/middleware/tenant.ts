import type { Request, Response, NextFunction } from 'express';
import { prisma, createTenantClient } from '@cargo-sentinel/database';

export function tenantMiddleware(req: Request, res: Response, next: NextFunction) {
  if (!req.user) return res.status(401).json({ error: 'Não autenticado' });

  if (req.user.role === 'SUPER_ADMIN') {
    // empresaId é null — NÃO usar createTenantClient (filtraria empresaId IS NULL → 0 linhas — Pitfall 4)
    // SUPER_ADMIN recebe prisma raw (sem filtro de tenant — T-02-13 mitigation)
    req.tenantClient = prisma as unknown as ReturnType<typeof createTenantClient>;
  } else if (req.user.empresaId) {
    // Usuário normal — scoped ao tenant (T-02-12 mitigation: empresaId vem SOMENTE do token)
    req.tenantClient = createTenantClient(prisma, req.user.empresaId);
  } else {
    return res.status(403).json({ error: 'Usuário sem empresa associada' });
  }

  next();
}
