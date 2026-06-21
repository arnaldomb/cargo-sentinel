import { beforeEach, describe, expect, it, vi } from 'vitest';

const { hkdfMock, jwtDecryptMock } = vi.hoisted(() => ({
  hkdfMock: vi.fn(),
  jwtDecryptMock: vi.fn(),
}));

vi.mock('@panva/hkdf', () => ({
  hkdf: hkdfMock,
}));

vi.mock('jose', () => ({
  jwtDecrypt: jwtDecryptMock,
}));

import { AUTH_COOKIE_NAMES, decryptAuthToken, getRequestToken } from './auth';

describe('auth middleware helpers', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.AUTH_SECRET = 'test-secret';
  });

  it('prefere o cookie seguro quando ambos existem', () => {
    const result = getRequestToken({
      cookies: {
        '__Secure-authjs.session-token': 'secure-token',
        'authjs.session-token': 'plain-token',
      },
      headers: {},
    } as never);

    expect(result).toEqual({
      token: 'secure-token',
      cookieName: '__Secure-authjs.session-token',
    });
  });

  it('aceita o cookie sem prefixo secure em localhost', () => {
    const result = getRequestToken({
      cookies: {
        'authjs.session-token': 'plain-token',
      },
      headers: {},
    } as never);

    expect(result).toEqual({
      token: 'plain-token',
      cookieName: 'authjs.session-token',
    });
  });

  it('tenta decriptar com os dois salts conhecidos quando o primeiro falha', async () => {
    hkdfMock.mockImplementation(async (_alg, _secret, salt) => `${salt}-key`);
    jwtDecryptMock
      .mockRejectedValueOnce(new Error('wrong salt'))
      .mockResolvedValueOnce({
        payload: {
          sub: 'user-1',
          role: 'OPERADOR',
          empresaId: 'emp-1',
        },
      });

    const user = await decryptAuthToken('token-123', AUTH_COOKIE_NAMES[0]);

    expect(user).toEqual({
      id: 'user-1',
      role: 'OPERADOR',
      empresaId: 'emp-1',
    });
    expect(hkdfMock).toHaveBeenNthCalledWith(
      1,
      'sha256',
      'test-secret',
      '__Secure-authjs.session-token',
      'Auth.js Generated Encryption Key (__Secure-authjs.session-token)',
      64,
    );
    expect(hkdfMock).toHaveBeenNthCalledWith(
      2,
      'sha256',
      'test-secret',
      'authjs.session-token',
      'Auth.js Generated Encryption Key (authjs.session-token)',
      64,
    );
  });
});
