import NextAuth from 'next-auth';
import { authConfig } from './auth.config';

const nextAuth = NextAuth(authConfig);

export const middleware: typeof nextAuth.auth = nextAuth.auth;

export const config = {
  matcher: ['/((?!login|api/auth|_next/static|_next/image|favicon.ico).*)'],
};
