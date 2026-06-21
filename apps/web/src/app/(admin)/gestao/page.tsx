import { redirect } from 'next/navigation';
import { cookies } from 'next/headers';
import { auth } from '../../../../auth';
import { DeleteObraButton } from './delete-obra-button';

const API_BASE = process.env.INTERNAL_API_URL ?? 'http://localhost:4000';

type Obra = {
  id: string;
  nome: string;
  endereco?: string;
  ativo: boolean;
  _count?: { cameras: number };
};

export default async function GestaoPage() {
  const session = await auth();

  if (!session?.user || session.user.role !== 'ADMIN_EMPRESA') {
    redirect('/');
  }

  const cookieStore = await cookies();
  let obras: Obra[] = [];

  try {
    const res = await fetch(`${API_BASE}/api/obras`, {
      headers: { Cookie: cookieStore.toString() },
      cache: 'no-store',
    });
    if (res.ok) {
      // API returns array directly
      const data = (await res.json()) as Obra[];
      obras = Array.isArray(data) ? data.filter((o) => o.ativo) : [];
    }
  } catch {
    // falha silenciosa — exibe lista vazia
  }

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="mx-auto max-w-5xl">
        <div className="mb-6 flex items-center justify-between">
          <div>
            <h1 className="font-heading text-2xl font-bold text-slate-900">Gestão de Obras</h1>
            <p className="mt-1 text-sm text-slate-500">
              Gerencie obras e câmeras LPR da sua empresa.
            </p>
          </div>
          <a
            href="/gestao/obras/nova"
            className="rounded-md bg-ggtech-blue px-4 py-2 text-sm font-medium text-white hover:opacity-90 transition-opacity"
          >
            + Nova Obra
          </a>
        </div>

        {obras.length === 0 ? (
          <div className="rounded-lg border border-slate-200 bg-white p-10 text-center">
            <p className="text-sm text-slate-500">Nenhuma obra cadastrada ainda.</p>
            <a
              href="/gestao/obras/nova"
              className="mt-4 inline-block rounded-md bg-ggtech-blue px-4 py-2 text-sm font-medium text-white hover:opacity-90 transition-opacity"
            >
              Cadastrar Primeira Obra
            </a>
          </div>
        ) : (
          <div className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-slate-100 text-left text-xs font-medium uppercase tracking-wide text-slate-500">
                  <th className="px-4 py-3">Nome</th>
                  <th className="px-4 py-3">Endereço</th>
                  <th className="px-4 py-3 text-center">Câmeras</th>
                  <th className="px-4 py-3 text-right">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {obras.map((obra) => (
                  <tr key={obra.id} className="hover:bg-slate-50 transition-colors">
                    <td className="px-4 py-3 font-medium text-slate-800">{obra.nome}</td>
                    <td className="px-4 py-3 text-slate-500">
                      {obra.endereco ?? <span className="italic text-slate-400">—</span>}
                    </td>
                    <td className="px-4 py-3 text-center text-slate-700">
                      {obra._count?.cameras ?? 0}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-2">
                        <a
                          href={`/gestao/obras/${obra.id}`}
                          className="rounded px-3 py-1 text-sm font-medium text-ggtech-blue border border-ggtech-blue hover:bg-ggtech-blue hover:text-white transition-colors"
                        >
                          Câmeras
                        </a>
                        <a
                          href={`/gestao/obras/${obra.id}/editar`}
                          className="rounded px-3 py-1 text-sm font-medium text-slate-600 border border-slate-300 hover:bg-slate-50 transition-colors"
                        >
                          Editar
                        </a>
                        <DeleteObraButton obraId={obra.id} />
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
