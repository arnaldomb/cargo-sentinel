import type { Socket } from 'socket.io';
import { AUTH_COOKIE_NAMES, decryptAuthToken, type AuthenticatedUser } from '../middleware/auth';

export type RealtimeUser = AuthenticatedUser & {
  empresaId: string;
};

function parseCookieHeader(cookieHeader: string | undefined): Record<string, string> {
  if (!cookieHeader) return {};

  return cookieHeader
    .split(';')
    .map((part) => part.trim())
    .filter(Boolean)
    .reduce<Record<string, string>>((acc, part) => {
      const separatorIndex = part.indexOf('=');
      if (separatorIndex === -1) return acc;
      const key = part.slice(0, separatorIndex);
      const value = part.slice(separatorIndex + 1);
      acc[key] = decodeURIComponent(value);
      return acc;
    }, {});
}

export function getSocketToken(socket: Pick<Socket, 'handshake'>): string | null {
  const cookies = parseCookieHeader(socket.handshake.headers.cookie);
  for (const cookieName of AUTH_COOKIE_NAMES) {
    const cookieToken = cookies[cookieName];
    if (cookieToken) return cookieToken;
  }

  const authHeader = socket.handshake.headers.authorization;
  if (authHeader?.startsWith('Bearer ')) {
    return authHeader.slice('Bearer '.length);
  }

  return null;
}

export async function authenticateSocket(
  socket: Pick<Socket, 'handshake' | 'data'>,
): Promise<RealtimeUser> {
  const token = getSocketToken(socket);
  if (!token) throw new Error('Não autenticado');

  const user = await decryptAuthToken(token);
  if (!user.empresaId) throw new Error('Socket sem empresa associada');

  const realtimeUser: RealtimeUser = {
    ...user,
    empresaId: user.empresaId,
  };

  socket.data.user = realtimeUser;
  return realtimeUser;
}
