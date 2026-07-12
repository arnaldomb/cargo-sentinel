import { cookies } from 'next/headers';

const API_BASE = process.env.INTERNAL_API_URL ?? 'http://localhost:4000';

export async function GET() {
  const cookieStore = await cookies();
  const upstream = await fetch(`${API_BASE}/api/configuracoes-whatsapp/qrcode`, {
    headers: { Cookie: cookieStore.toString() },
    cache: 'no-store',
  });
  const text = await upstream.text();
  try {
    const json = JSON.parse(text);
    return Response.json(json, { status: upstream.status });
  } catch {
    return new Response(text, { status: upstream.status });
  }
}
