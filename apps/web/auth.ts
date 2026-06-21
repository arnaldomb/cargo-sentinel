import NextAuth from 'next-auth';
import Credentials from 'next-auth/providers/credentials';
import bcryptjs from 'bcryptjs';
import { z } from 'zod';
import { prisma } from '@cargo-sentinel/database';
import { authConfig } from './auth.config';

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

type AuthorizeCredentials = {
  email?: string | undefined;
  password?: string | undefined;
};

/**
 * Exported for testing. Validates credentials against the database.
 * Returns user object on success, null on failure.
 */
export async function authorizeUser(credentials: AuthorizeCredentials) {
  const parsed = loginSchema.safeParse(credentials);
  if (!parsed.success) return null;
  const { email, password } = parsed.data;

  const user = await prisma.user.findUnique({
    where: { email },
    include: { empresa: { select: { status: true } } },
  });
  if (!user) return null;
  if (user.empresa && user.empresa.status === 'SUSPENSO') return null; // TENANT-01

  const valid = await bcryptjs.compare(password, user.passwordHash);
  if (!valid) return null;

  return {
    id: user.id,
    email: user.email,
    name: user.nome,
    role: user.role as 'SUPER_ADMIN' | 'ADMIN_EMPRESA' | 'OPERADOR',
    empresaId: user.empresaId,
  };
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  providers: [
    Credentials({
      credentials: { email: {}, password: {} },
      async authorize(credentials) {
        return authorizeUser(credentials as AuthorizeCredentials);
      },
    }),
  ],
});
