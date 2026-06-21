import { type NextRequest } from 'next/server';
import { cookies } from 'next/headers';

const API_BASE = process.env.INTERNAL_API_URL ?? 'http://localhost:4000';

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ obraId: string }> },
) {
  const { obraId } = await params;
  const cookieStore = await cookies();

  const upstream = await fetch(
    `${API_BASE}/api/obras/${encodeURIComponent(obraId)}/cameras`,
    {
      headers: { Cookie: cookieStore.toString() },
      cache: 'no-store',
    },
  );

  const data: unknown = await upstream.json();
  return Response.json(data, { status: upstream.status });
}
