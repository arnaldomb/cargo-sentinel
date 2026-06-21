import { type NextRequest } from 'next/server';
import { cookies } from 'next/headers';

const API_BASE = process.env.INTERNAL_API_URL ?? 'http://localhost:4000';

// GET /api/relatorios-proxy — lista relatórios
export async function GET(_req: NextRequest) {
  const cookieStore = await cookies();
  const upstream = await fetch(`${API_BASE}/api/relatorios?limit=20`, {
    headers: { Cookie: cookieStore.toString() },
    cache: 'no-store',
  });

  const data: unknown = await upstream.json();
  return Response.json(data, { status: upstream.status });
}

// POST /api/relatorios-proxy — solicita novo relatório
export async function POST(req: NextRequest) {
  const cookieStore = await cookies();
  const body: unknown = await req.json();

  const upstream = await fetch(`${API_BASE}/api/relatorios`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Cookie: cookieStore.toString(),
    },
    body: JSON.stringify(body),
  });

  const data: unknown = await upstream.json();
  return Response.json(data, { status: upstream.status });
}
