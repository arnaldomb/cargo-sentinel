import type { DefaultSession } from 'next-auth';

type Role = 'SUPER_ADMIN' | 'ADMIN_EMPRESA' | 'OPERADOR';

declare module 'next-auth' {
  interface Session {
    user: {
      id: string;
      role: Role;
      empresaId: string | null;
    } & DefaultSession['user'];
  }
  interface User {
    role: Role;
    empresaId: string | null;
  }
}

declare module 'next-auth/jwt' {
  interface JWT {
    role: Role;
    empresaId: string | null;
  }
}
