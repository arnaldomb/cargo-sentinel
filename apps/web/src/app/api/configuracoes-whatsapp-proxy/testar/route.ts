import { cookies } from 'next/headers';

const API_BASE = process.env.INTERNAL_API_URL ?? 'http://localhost:4000';

export async function POST() {
  const cookieStore = await cookies();
  const upstream = await fetch(`${API_BASE}/api/configuracoes-whatsapp/testar`, {
    method: 'POST',
    headers: { Cookie: cookieStore.toString() },
    cache: 'no-store',
  });
  return Response.json(await upstream.json(), { status: upstream.status });
}
