import type { NextRequest } from 'next/server';
import { handlers } from '../../../../../auth';

type NextAuthRouteContext = {
  params: Promise<{
    nextauth: string[];
  }>;
};

export async function GET(request: NextRequest, context: NextAuthRouteContext) {
  void context;
  return handlers.GET(request);
}

export async function POST(request: NextRequest, context: NextAuthRouteContext) {
  void context;
  return handlers.POST(request);
}
