import { type NextRequest } from 'next/server';
import { cookies } from 'next/headers';

const API_BASE = process.env.INTERNAL_API_URL ?? 'http://localhost:4000';

// GET /api/relatorios-proxy/[id]/download — obtém URL presignada de download
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const cookieStore = await cookies();

  const upstream = await fetch(`${API_BASE}/api/relatorios/${encodeURIComponent(id)}/download`, {
    headers: { Cookie: cookieStore.toString() },
    cache: 'no-store',
  });

  const data: unknown = await upstream.json();
  return Response.json(data, { status: upstream.status });
}
