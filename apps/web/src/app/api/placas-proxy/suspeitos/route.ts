import { type NextRequest } from 'next/server';
import { cookies } from 'next/headers';

const API_BASE = process.env.INTERNAL_API_URL ?? 'http://localhost:4000';

export async function GET() {
  const cookieStore = await cookies();
  const upstream = await fetch(`${API_BASE}/api/placas/suspeitos`, {
    headers: { Cookie: cookieStore.toString() },
    cache: 'no-store',
  });
  return Response.json(await upstream.json(), { status: upstream.status });
}

export async function POST(req: NextRequest) {
  const cookieStore = await cookies();
  const body = await req.json();
  const upstream = await fetch(`${API_BASE}/api/placas/suspeitos`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: cookieStore.toString() },
    body: JSON.stringify(body),
  });
  return Response.json(await upstream.json(), { status: upstream.status });
}
