import type { NextAuthConfig } from 'next-auth';

type Role = 'SUPER_ADMIN' | 'ADMIN_EMPRESA' | 'OPERADOR';

const cookieDomain = process.env.AUTH_COOKIE_DOMAIN ?? undefined;
const isProduction = process.env.NODE_ENV === 'production';
const cookieName = isProduction
  ? '__Secure-authjs.session-token'
  : 'authjs.session-token';

export const authConfig: NextAuthConfig = {
  pages: { signIn: '/login' },
  session: {
    strategy: 'jwt',
    maxAge: 7 * 24 * 60 * 60, // 7 dias (D2)
    updateAge: 5 * 60,        // renova a cada 5 min (D2 / AUTH-04)
  },
  cookies: {
    sessionToken: {
      name: cookieName,
      options: {
        httpOnly: true,
        sameSite: 'lax' as const,
        path: '/',
        secure: isProduction,
        ...(cookieDomain ? { domain: cookieDomain } : {}),
      },
    },
  },
  providers: [], // preenchido em auth.ts (mantém bcryptjs fora do edge)
  callbacks: {
    jwt({ token, user }) {
      if (user) {
        token.sub = user.id;
        token.role = (user as { role: 'SUPER_ADMIN' | 'ADMIN_EMPRESA' | 'OPERADOR' }).role;
        token.empresaId = (user as { empresaId: string | null }).empresaId;
      }
      return token;
    },
    session({ session, token }) {
      session.user.id = token.sub as string;
      session.user.role = token.role as Role;
      session.user.empresaId = token.empresaId as string | null;
      return session;
    },
  },
};
