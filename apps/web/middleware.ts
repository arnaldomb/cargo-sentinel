import NextAuth from 'next-auth';
import { NextResponse } from 'next/server';
import { authConfig } from './auth.config';
import type { Session } from 'next-auth';
import type { NextRequest } from 'next/server';

type AuthRequest = NextRequest & { auth: Session | null };

const { auth } = NextAuth(authConfig);

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export default (auth as any)(function middleware(req: AuthRequest) {
  const { pathname } = req.nextUrl;
  const session = req.auth;

  // Protect /admin routes: only SUPER_ADMIN can access
  if (pathname.startsWith('/admin')) {
    if (!session || (session.user as { role?: string })?.role !== 'SUPER_ADMIN') {
      return NextResponse.redirect(new URL('/', req.url));
    }
  }

  return NextResponse.next();
});

export const config = {
  matcher: ['/((?!login|api/auth|_next/static|_next/image|favicon.ico).*)'],
};
