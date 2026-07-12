import { type NextRequest } from 'next/server';
import { cookies } from 'next/headers';

const API_BASE = process.env.INTERNAL_API_URL ?? 'http://localhost:4000';

export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const cookieStore = await cookies();
  const upstream = await fetch(`${API_BASE}/api/admin/empresas/${id}/whatsapp/desconectar`, {
    method: 'POST',
    headers: { Cookie: cookieStore.toString() },
  });
  return Response.json(await upstream.json(), { status: upstream.status });
}
