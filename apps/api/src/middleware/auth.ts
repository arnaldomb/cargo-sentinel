import { jwtDecrypt } from 'jose';
import { hkdf } from '@panva/hkdf';
import type { Request, Response, NextFunction } from 'express';

export type AuthenticatedUser = {
  id: string;
  role: string;
  empresaId: string | null;
};

export const AUTH_COOKIE_NAMES = [
  '__Secure-authjs.session-token',
  'authjs.session-token',
] as const;

// Mantido para compatibilidade com chamadas existentes.
export const COOKIE_NAME =
  process.env.NODE_ENV === 'production'
    ? AUTH_COOKIE_NAMES[0]
    : AUTH_COOKIE_NAMES[1];

async function getDerivedKey(secret: string, cookieName: string): Promise<Uint8Array> {
  // Auth.js v5 uses A256CBC-HS512 which requires 64 bytes (512 bits), not 32
  return hkdf(
    'sha256',
    secret,
    cookieName, // salt = cookie name (Auth.js v5 convention)
    `Auth.js Generated Encryption Key (${cookieName})`,
    64,
  );
}

export async function decryptAuthToken(
  token: string,
  cookieName = COOKIE_NAME,
): Promise<AuthenticatedUser> {
  const secret = process.env.AUTH_SECRET;
  if (!secret) throw new Error('AUTH_SECRET não configurado');

  const candidateCookieNames = [
    cookieName,
    ...AUTH_COOKIE_NAMES.filter((name) => name !== cookieName),
  ];

  let lastError: unknown;
  for (const candidateCookieName of candidateCookieNames) {
    try {
      const key = await getDerivedKey(secret, candidateCookieName);
      const { payload } = await jwtDecrypt(token, key);

      return {
        id: payload.sub as string,
        role: payload.role as string,
        empresaId: (payload.empresaId as string | null) ?? null,
      };
    } catch (error) {
      lastError = error;
    }
  }

  throw lastError instanceof Error ? lastError : new Error('Token inválido ou expirado');
}

export function getRequestToken(
  req: Pick<Request, 'cookies' | 'headers'>,
): { token: string | null; cookieName?: (typeof AUTH_COOKIE_NAMES)[number] } {
  for (const cookieName of AUTH_COOKIE_NAMES) {
    const token = req.cookies?.[cookieName];
    if (token) return { token, cookieName };
  }

  const bearerToken = req.headers.authorization?.replace('Bearer ', '');
  if (bearerToken) return { token: bearerToken };

  return { token: null };
}

export async function authMiddleware(req: Request, res: Response, next: NextFunction) {
  const { token, cookieName } = getRequestToken(req);

  if (!token) return res.status(401).json({ error: 'Não autenticado' });

  try {
    req.user = await decryptAuthToken(token, cookieName);

    next();
  } catch {
    return res.status(401).json({ error: 'Token inválido ou expirado' });
  }
}
