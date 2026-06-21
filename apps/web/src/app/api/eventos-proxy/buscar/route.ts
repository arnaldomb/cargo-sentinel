import { type NextRequest } from 'next/server';
import { cookies } from 'next/headers';

const API_BASE = process.env.INTERNAL_API_URL ?? 'http://localhost:4000';

export async function GET(req: NextRequest) {
  const cookieStore = await cookies();
  const search = req.nextUrl.searchParams.toString();

  const upstream = await fetch(
    `${API_BASE}/api/eventos/buscar${search ? `?${search}` : ''}`,
    {
      headers: { Cookie: cookieStore.toString() },
      cache: 'no-store',
    },
  );

  const data: unknown = await upstream.json();
  return Response.json(data, { status: upstream.status });
}
