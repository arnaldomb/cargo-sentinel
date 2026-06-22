import { redirect, notFound } from 'next/navigation';
import { cookies } from 'next/headers';
import { auth } from '../../../../../../auth';
import { DeleteObraButton } from '../../delete-obra-button';
import { DeleteCameraButton } from './delete-camera-button';

const API_BASE = process.env.INTERNAL_API_URL ?? 'http://localhost:4000';
const ONLINE_THRESHOLD_MS = 2 * 60 * 1000; // 2 minutes

type Obra = {
  id: string;
  nome: string;
  endereco?: string;
  ativo: boolean;
};

type Camera = {
  id: string;
  codigoLpr: string;
  nome?: string | null;
  ip?: string | null;
  ativo: boolean;
  eventos?: { timestamp: string }[];
};

function calcStatus(camera: Camera): 'online' | 'offline' {
  const lastTs = camera.eventos?.[0]?.timestamp;
  if (!lastTs) return 'offline';
  return Date.now() - new Date(lastTs).getTime() < ONLINE_THRESHOLD_MS ? 'online' : 'offline';
}

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

  let cameras: Camera[] = [];
  try {
    const res = await fetch(`${API_BASE}/api/obras/${id}/cameras`, {
      headers: { Cookie: cookieHeader },
      cache: 'no-store',
    });
    if (res.ok) {
      const data = (await res.json()) as Camera[];
      cameras = Array.isArray(data) ? data.filter((c) => c.ativo) : [];
    }
  } catch {
    // falha silenciosa
  }

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
            <h2 className="font-heading text-lg font-semibold text-slate-800">
              Câmeras ({cameras.length})
            </h2>
            <a
              href={`/gestao/obras/${id}/cameras/nova`}
              className="rounded-md bg-ggtech-blue px-3 py-1.5 text-sm font-medium text-white hover:opacity-90 transition-opacity"
            >
              + Nova Câmera
            </a>
          </div>

          {cameras.length === 0 ? (
            <div className="p-8 text-center">
              <p className="text-sm text-slate-500">Nenhuma câmera cadastrada nesta obra.</p>
              <a
                href={`/gestao/obras/${id}/cameras/nova`}
                className="mt-4 inline-block rounded-md bg-ggtech-blue px-4 py-2 text-sm font-medium text-white hover:opacity-90 transition-opacity"
              >
                Cadastrar Câmera
              </a>
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-slate-100 text-left text-xs font-medium uppercase tracking-wide text-slate-500">
                  <th className="px-4 py-3">Nome</th>
                  <th className="px-4 py-3">Código LPR</th>
                  <th className="px-4 py-3">IP</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Último Sinal</th>
                  <th className="px-4 py-3 text-right">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {cameras.map((camera) => {
                  const status = calcStatus(camera);
                  const lastTs = camera.eventos?.[0]?.timestamp;
                  return (
                    <tr key={camera.id} className="hover:bg-slate-50 transition-colors">
                      <td className="px-4 py-3 font-medium text-slate-800">
                        {camera.nome ?? <span className="italic text-slate-400">—</span>}
                      </td>
                      <td className="px-4 py-3 font-mono text-xs text-slate-600">
                        {camera.codigoLpr}
                      </td>
                      <td className="px-4 py-3 text-slate-500">
                        {camera.ip ?? <span className="italic text-slate-400">—</span>}
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium text-white ${
                            status === 'online' ? 'bg-green-600' : 'bg-slate-500'
                          }`}
                        >
                          {status}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-slate-500">
                        {lastTs
                          ? new Date(lastTs).toLocaleString('pt-BR')
                          : 'nunca'}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-end gap-2">
                          <a
                            href={`/gestao/obras/${id}/cameras/${camera.id}/editar`}
                            className="rounded px-2 py-1 text-xs font-medium text-ggtech-blue border border-ggtech-blue hover:bg-ggtech-blue hover:text-white transition-colors"
                          >
                            Editar
                          </a>
                          <DeleteCameraButton
                            obraId={id}
                            cameraId={camera.id}
                            codigoLpr={camera.nome ?? camera.codigoLpr}
                          />
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}
