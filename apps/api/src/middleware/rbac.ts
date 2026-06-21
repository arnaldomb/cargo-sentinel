import type { Request, Response, NextFunction } from 'express';

type Role = 'SUPER_ADMIN' | 'ADMIN_EMPRESA' | 'OPERADOR';

export function requireRole(...roles: Role[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.user || !roles.includes(req.user.role as Role)) {
      return res.status(403).json({ error: 'Acesso negado' });
    }
    next();
  };
}
