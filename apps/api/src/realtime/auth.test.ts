import { describe, it, expect, vi, beforeEach } from 'vitest';

const { decryptAuthTokenMock } = vi.hoisted(() => {
  const decryptAuthTokenMock = vi.fn();
  return { decryptAuthTokenMock };
});

vi.mock('../middleware/auth', () => ({
  AUTH_COOKIE_NAMES: ['__Secure-authjs.session-token', 'authjs.session-token'],
  decryptAuthToken: decryptAuthTokenMock,
}));

import { authenticateSocket, getSocketToken } from './auth';

describe('realtime auth', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('extrai token do cookie da sessão', () => {
    const token = getSocketToken({
      handshake: {
        headers: {
          cookie: 'authjs.session-token=token123; other=value',
        },
      },
    } as never);

    expect(token).toBe('token123');
  });

  it('extrai token do cookie seguro da sessão', () => {
    const token = getSocketToken({
      handshake: {
        headers: {
          cookie: '__Secure-authjs.session-token=token456; other=value',
        },
      },
    } as never);

    expect(token).toBe('token456');
  });

  it('autentica socket e popula socket.data.user quando empresaId existe', async () => {
    decryptAuthTokenMock.mockResolvedValue({
      id: 'user1',
      role: 'OPERADOR',
      empresaId: 'emp1',
    });

    const socket = {
      handshake: {
        headers: {
          cookie: 'authjs.session-token=token123',
        },
      },
      data: {},
    };

    const user = await authenticateSocket(socket as never);

    expect(user).toEqual({
      id: 'user1',
      role: 'OPERADOR',
      empresaId: 'emp1',
    });
    expect(socket.data).toHaveProperty('user.empresaId', 'emp1');
  });

  it('rejeita socket autenticado sem empresaId', async () => {
    decryptAuthTokenMock.mockResolvedValue({
      id: 'super1',
      role: 'SUPER_ADMIN',
      empresaId: null,
    });

    const socket = {
      handshake: {
        headers: {
          cookie: 'authjs.session-token=token123',
        },
      },
      data: {},
    };

    await expect(authenticateSocket(socket as never)).rejects.toThrow('Socket sem empresa associada');
  });
});
