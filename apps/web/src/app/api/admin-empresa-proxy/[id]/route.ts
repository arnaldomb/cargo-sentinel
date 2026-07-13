import { type NextRequest } from 'next/server';
import { cookies } from 'next/headers';

const API_BASE = process.env.INTERNAL_API_URL ?? 'http://localhost:4000';

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const cookieStore = await cookies();
  const upstream = await fetch(`${API_BASE}/api/admin/empresas/${id}`, {
    headers: { Cookie: cookieStore.toString() },
    cache: 'no-store',
  });
  return Response.json(await upstream.json(), { status: upstream.status });
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const cookieStore = await cookies();
  const body = await req.json();
  const upstream = await fetch(`${API_BASE}/api/admin/empresas/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', Cookie: cookieStore.toString() },
    body: JSON.stringify(body),
  });
  return Response.json(await upstream.json(), { status: upstream.status });
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const cookieStore = await cookies();
  const upstream = await fetch(`${API_BASE}/api/admin/empresas/${id}`, {
    method: 'DELETE',
    headers: { Cookie: cookieStore.toString() },
  });
  return Response.json(await upstream.json(), { status: upstream.status });
}
