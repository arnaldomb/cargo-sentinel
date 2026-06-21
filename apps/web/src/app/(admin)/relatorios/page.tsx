import { cookies } from 'next/headers';
import { RelatoriosClient } from './relatorios-client';
import type { RelatorioItem } from '@/components/relatorios/report-list';

const API_BASE = process.env.INTERNAL_API_URL ?? 'http://localhost:4000';

async function fetchRelatorios(cookieHeader: string): Promise<RelatorioItem[]> {
  try {
    const res = await fetch(`${API_BASE}/api/relatorios?limit=20`, {
      headers: { Cookie: cookieHeader },
      cache: 'no-store',
    });
    if (!res.ok) return [];
    const data = (await res.json()) as { items?: RelatorioItem[] };
    return data.items ?? [];
  } catch {
    return [];
  }
}

export default async function RelatoriosPage() {
  const cookieStore = await cookies();
  const cookieHeader = cookieStore.toString();
  const initialItems = await fetchRelatorios(cookieHeader);

  return (
    <div className="mx-auto max-w-6xl space-y-6 p-6">
      <div>
        <h1 className="font-heading text-2xl font-bold text-slate-900">Relatórios</h1>
        <p className="mt-1 text-sm text-slate-500">
          Solicite relatórios em PDF ou Excel. Você será notificado quando estiverem prontos para
          download.
        </p>
      </div>
      <RelatoriosClient initialItems={initialItems} />
    </div>
  );
}
