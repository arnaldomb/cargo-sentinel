import { redirect, notFound } from 'next/navigation';
import { cookies } from 'next/headers';
import { auth } from '../../../../../../auth';
import { DeleteObraButton } from '../../delete-obra-button';
import { CamerasTableClient } from './cameras-table-client';

const API_BASE = process.env.INTERNAL_API_URL ?? 'http://localhost:4000';

type Obra = {
  id: string;
  nome: string;
  endereco?: string;
  ativo: boolean;
};

export default async function ObraDetalhePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await auth();

  if (!session?.user || session.user.role !== 'ADMIN_EMPRESA') {
    redirect('/');
  }

  const { id } = await params;
  const cookieStore = await cookies();
  const cookieHeader = cookieStore.toString();

  let obra: Obra | undefined;
  try {
    const res = await fetch(`${API_BASE}/api/obras`, {
      headers: { Cookie: cookieHeader },
      cache: 'no-store',
    });
    if (res.ok) {
      const data = (await res.json()) as Obra[];
      obra = Array.isArray(data) ? data.find((o) => o.id === id) : undefined;
    }
  } catch {
    // falha silenciosa
  }

  if (!obra) notFound();

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="mx-auto max-w-5xl">
        <div className="mb-6">
          <a href="/gestao" className="text-sm text-ggtech-blue hover:underline">
            ← Voltar para Gestão
          </a>
          <div className="mt-2 flex items-center justify-between gap-4">
            <div>
              <h1 className="font-heading text-2xl font-bold text-slate-900">{obra!.nome}</h1>
              <p className="mt-1 text-sm text-slate-500">
                {obra!.endereco ?? 'Endereço não informado'}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <a
                href={`/gestao/obras/${id}/editar`}
                className="rounded-md border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-600 hover:bg-slate-50 transition-colors"
              >
                Editar Obra
              </a>
              <DeleteObraButton obraId={id} />
            </div>
          </div>
        </div>

        <div className="rounded-lg border border-slate-200 bg-white shadow-sm">
          <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
            <h2 className="font-heading text-lg font-semibold text-slate-800">Câmeras</h2>
            <a
              href={`/gestao/obras/${id}/cameras/nova`}
              className="rounded-md bg-ggtech-blue px-3 py-1.5 text-sm font-medium text-white hover:opacity-90 transition-opacity"
            >
              + Nova Câmera
            </a>
          </div>
          <CamerasTableClient obraId={id} />
        </div>
      </div>
    </div>
  );
}
