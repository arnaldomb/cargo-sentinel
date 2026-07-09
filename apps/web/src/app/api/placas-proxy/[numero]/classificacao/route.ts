import { cookies } from 'next/headers';
import { NextRequest } from 'next/server';

const API_BASE = process.env.INTERNAL_API_URL ?? 'http://localhost:4000';

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ numero: string }> },
) {
  const { numero } = await params;
  const cookieStore = await cookies();
  const body = await req.text();

  const upstream = await fetch(`${API_BASE}/api/placas/${numero}/classificacao`, {
    method: 'PATCH',
    headers: {
      Cookie: cookieStore.toString(),
      'Content-Type': 'application/json',
    },
    body,
  });

  return Response.json(await upstream.json(), { status: upstream.status });
}
