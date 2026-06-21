import { jwtDecrypt } from 'jose';
import { hkdf } from '@panva/hkdf';
import type { Request, Response, NextFunction } from 'express';

// Salt difere entre dev (http) e prod (https com __Secure- prefix) — Pitfall 3
const COOKIE_NAME =
  process.env.NODE_ENV === 'production'
    ? '__Secure-authjs.session-token'
    : 'authjs.session-token';

async function getDerivedKey(secret: string): Promise<Uint8Array> {
  // Auth.js v5 uses A256CBC-HS512 which requires 64 bytes (512 bits), not 32
  return hkdf(
    'sha256',
    secret,
    COOKIE_NAME, // salt = cookie name (Auth.js v5 convention)
    `Auth.js Generated Encryption Key (${COOKIE_NAME})`,
    64,
  );
}

export async function authMiddleware(req: Request, res: Response, next: NextFunction) {
  // Aceita token do cookie (browser) ou Authorization header (API clients)
  const token =
    req.cookies?.[COOKIE_NAME] ||
    req.headers.authorization?.replace('Bearer ', '');

  if (!token) return res.status(401).json({ error: 'Não autenticado' });

  try {
    const secret = process.env.AUTH_SECRET;
    if (!secret) throw new Error('AUTH_SECRET não configurado');

    const key = await getDerivedKey(secret);
    const { payload } = await jwtDecrypt(token, key);

    // payload contém: sub, role, empresaId, iat, exp
    req.user = {
      id: payload.sub as string,
      role: payload.role as string,
      empresaId: (payload.empresaId as string | null) ?? null,
    };

    next();
  } catch {
    return res.status(401).json({ error: 'Token inválido ou expirado' });
  }
}
