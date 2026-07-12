import { type NextRequest } from 'next/server';
import { cookies } from 'next/headers';

const API_BASE = process.env.INTERNAL_API_URL ?? 'http://localhost:4000';

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; usuarioId: string }> },
) {
  const { id, usuarioId } = await params;
  const cookieStore = await cookies();
  const body = await req.json();
  const upstream = await fetch(
    `${API_BASE}/api/admin/empresas/${id}/usuarios/${usuarioId}/resetar-senha`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: cookieStore.toString() },
      body: JSON.stringify(body),
    },
  );
  return Response.json(await upstream.json(), { status: upstream.status });
}
