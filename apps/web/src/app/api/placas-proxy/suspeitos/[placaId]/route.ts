import { cookies } from 'next/headers';

const API_BASE = process.env.INTERNAL_API_URL ?? 'http://localhost:4000';

export async function DELETE(_req: Request, { params }: { params: Promise<{ placaId: string }> }) {
  const cookieStore = await cookies();
  const { placaId } = await params;
  const upstream = await fetch(`${API_BASE}/api/placas/suspeitos/${placaId}`, {
    method: 'DELETE',
    headers: { Cookie: cookieStore.toString() },
  });
  if (upstream.status === 204) return new Response(null, { status: 204 });
  return Response.json(await upstream.json(), { status: upstream.status });
}
