import { type NextRequest } from 'next/server';
import { cookies } from 'next/headers';

const API_BASE = process.env.INTERNAL_API_URL ?? 'http://localhost:4000';

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ obraId: string }> },
) {
  const { obraId } = await params;
  const cookieStore = await cookies();
  const body = await req.json();
  const upstream = await fetch(`${API_BASE}/api/obras/${encodeURIComponent(obraId)}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', Cookie: cookieStore.toString() },
    body: JSON.stringify(body),
  });
  return Response.json(await upstream.json(), { status: upstream.status });
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ obraId: string }> },
) {
  const { obraId } = await params;
  const cookieStore = await cookies();
  const upstream = await fetch(`${API_BASE}/api/obras/${encodeURIComponent(obraId)}`, {
    method: 'DELETE',
    headers: { Cookie: cookieStore.toString() },
  });
  if (upstream.status === 204) {
    return new Response(null, { status: 204 });
  }
  return Response.json(await upstream.json(), { status: upstream.status });
}
