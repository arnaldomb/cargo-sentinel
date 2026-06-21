import { authMiddleware } from './auth';
import { tenantMiddleware } from './tenant';

/**
 * Pipeline de proteção reutilizável.
 * Ordem obrigatória: auth → tenant (Pitfall 5 do RESEARCH.md).
 * Importar DESTE módulo — não de '../index' — para evitar dependência circular.
 */
export const protectedPipeline = [authMiddleware, tenantMiddleware] as const;
