import { cookies } from 'next/headers';
import BuscarClient from './buscar-client';

const API_BASE = process.env.INTERNAL_API_URL ?? 'http://localhost:4000';

type Obra = { id: string; nome: string; ativo: boolean };

async function fetchObras(cookieHeader: string): Promise<Obra[]> {
  try {
    const res = await fetch(`${API_BASE}/api/obras`, {
      headers: { Cookie: cookieHeader },
      cache: 'no-store',
    });
    if (!res.ok) return [];
    const data = (await res.json()) as { obras: Obra[] };
    return data.obras.filter((o) => o.ativo);
  } catch {
    return [];
  }
}

export default async function BuscarPage() {
  const cookieStore = await cookies();
  const obras = await fetchObras(cookieStore.toString());

  return (
    <div className="mx-auto max-w-6xl space-y-6 p-6">
      <div>
        <h1 className="font-heading text-2xl font-bold text-slate-900">Busca de Eventos</h1>
        <p className="mt-1 text-sm text-slate-500">
          Filtre por placa, período, obra ou câmera. Use &quot;Carregar mais&quot; para percorrer
          grandes históricos.
        </p>
      </div>
      <BuscarClient obras={obras} />
    </div>
  );
}
