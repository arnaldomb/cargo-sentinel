import { cookies } from 'next/headers';
import { NextRequest } from 'next/server';

const API_BASE = process.env.INTERNAL_API_URL ?? 'http://localhost:4000';

export async function GET(req: NextRequest) {
  const cookieStore = await cookies();
  const { searchParams } = new URL(req.url);
  const qs = searchParams.toString();

  const upstream = await fetch(
    `${API_BASE}/api/eventos/feed${qs ? `?${qs}` : ''}`,
    {
      headers: { Cookie: cookieStore.toString() },
      cache: 'no-store',
    },
  );

  return Response.json(await upstream.json(), { status: upstream.status });
}
