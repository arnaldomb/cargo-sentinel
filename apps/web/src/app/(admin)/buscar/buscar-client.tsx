'use client';

import { useState } from 'react';
import Link from 'next/link';
import { ClassificationBadge } from '@/components/classification-badge';

type Obra = { id: string; nome: string; ativo: boolean };
type Camera = { id: string; codigoLpr: string; ativo: boolean };

type BuscarItem = {
  id: string;
  timestamp: string;
  placaNumero: string;
  placaId: string | null;
  direcao: 'ENTRADA' | 'SAIDA' | null;
  classificacao: 'LIBERADO' | 'VISITANTE' | 'ATENCAO' | 'SUSPEITO' | 'CRITICO';
  thumbnailUrl: string | null;
  obra: { id: string; nome: string };
  camera: { id: string; codigoLpr: string };
};

type Props = { obras: Obra[] };

const LIMIT = 20;

export default function BuscarClient({ obras }: Props) {
  // Filtros
  const [placa, setPlaca] = useState('');
  const [dataInicio, setDataInicio] = useState('');
  const [dataFim, setDataFim] = useState('');
  const [obraId, setObraId] = useState('');
  const [cameraId, setCameraId] = useState('');

  // Câmeras do dropdown (carregadas quando obra é selecionada)
  const [cameras, setCameras] = useState<Camera[]>([]);
  const [loadingCameras, setLoadingCameras] = useState(false);

  // Resultados
  const [items, setItems] = useState<BuscarItem[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleObraChange(id: string) {
    setObraId(id);
    setCameraId('');
    setCameras([]);
    if (!id) return;
    setLoadingCameras(true);
    try {
      const res = await fetch(`/api/obras-proxy/${id}/cameras`, { credentials: 'include' });
      if (res.ok) {
        const data = (await res.json()) as { cameras: Camera[] };
        setCameras(data.cameras.filter((c) => c.ativo));
      }
    } finally {
      setLoadingCameras(false);
    }
  }

  function buildSearchParams(cursor?: string): URLSearchParams {
    const p = new URLSearchParams();
    if (placa.trim()) p.set('placa', placa.trim());
    if (dataInicio) p.set('dataInicio', new Date(dataInicio).toISOString());
    if (dataFim) p.set('dataFim', new Date(dataFim).toISOString());
    if (obraId) p.set('obraId', obraId);
    if (cameraId) p.set('cameraId', cameraId);
    if (cursor) p.set('cursor', cursor);
    p.set('limit', String(LIMIT));
    return p;
  }

  async function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/eventos-proxy/buscar?${buildSearchParams().toString()}`, {
        credentials: 'include',
      });
      if (!res.ok) throw new Error('Erro ao buscar eventos');
      const data = (await res.json()) as { items: BuscarItem[]; nextCursor: string | null };
      setItems(data.items);
      setNextCursor(data.nextCursor);
      setSearched(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro desconhecido');
    } finally {
      setLoading(false);
    }
  }

  async function loadMore() {
    if (!nextCursor || loading) return;
    setLoading(true);
    try {
      const res = await fetch(
        `/api/eventos-proxy/buscar?${buildSearchParams(nextCursor).toString()}`,
        { credentials: 'include' },
      );
      if (!res.ok) throw new Error('Erro ao carregar mais');
      const data = (await res.json()) as { items: BuscarItem[]; nextCursor: string | null };
      setItems((prev) => [...prev, ...data.items]);
      setNextCursor(data.nextCursor);
    } catch {
      // mantém cursor para retry
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-6">
      {/* Formulário de filtros */}
      <form
        onSubmit={(e) => void handleSearch(e)}
        className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm"
      >
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {/* Placa */}
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-600">
              Número da Placa
            </label>
            <input
              type="text"
              value={placa}
              onChange={(e) => setPlaca(e.target.value.toUpperCase())}
              placeholder="ABC1D23"
              maxLength={10}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-ggtech-blue focus:outline-none focus:ring-1 focus:ring-ggtech-blue"
            />
          </div>

          {/* Data início */}
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-600">Data início</label>
            <input
              type="datetime-local"
              value={dataInicio}
              onChange={(e) => setDataInicio(e.target.value)}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-ggtech-blue focus:outline-none focus:ring-1 focus:ring-ggtech-blue"
            />
          </div>

          {/* Data fim */}
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-600">Data fim</label>
            <input
              type="datetime-local"
              value={dataFim}
              onChange={(e) => setDataFim(e.target.value)}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-ggtech-blue focus:outline-none focus:ring-1 focus:ring-ggtech-blue"
            />
          </div>

          {/* Obra */}
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-600">Obra</label>
            <select
              value={obraId}
              onChange={(e) => void handleObraChange(e.target.value)}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-ggtech-blue focus:outline-none focus:ring-1 focus:ring-ggtech-blue"
            >
              <option value="">Todas as obras</option>
              {obras.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.nome}
                </option>
              ))}
            </select>
          </div>

          {/* Câmera */}
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-600">Câmera</label>
            <select
              value={cameraId}
              onChange={(e) => setCameraId(e.target.value)}
              disabled={!obraId || loadingCameras}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-ggtech-blue focus:outline-none focus:ring-1 focus:ring-ggtech-blue disabled:bg-slate-50 disabled:text-slate-400"
            >
              <option value="">{loadingCameras ? 'Carregando...' : 'Todas as câmeras'}</option>
              {cameras.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.codigoLpr}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="mt-4 flex justify-end">
          <button
            type="submit"
            disabled={loading}
            className="rounded-lg bg-ggtech-blue px-6 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
          >
            {loading && !searched ? 'Buscando...' : 'Buscar'}
          </button>
        </div>
      </form>

      {/* Mensagem de erro */}
      {error && <p className="text-sm text-red-600">{error}</p>}

      {/* Tabela de resultados */}
      {searched && (
        <>
          {items.length === 0 ? (
            <p className="text-sm text-slate-500">
              Nenhum evento encontrado para os filtros aplicados.
            </p>
          ) : (
            <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="border-b border-slate-200 bg-slate-50">
                    <tr>
                      <th className="px-3 py-3 text-left font-medium text-slate-600">Foto</th>
                      <th className="px-3 py-3 text-left font-medium text-slate-600">Placa</th>
                      <th className="px-3 py-3 text-left font-medium text-slate-600">Obra</th>
                      <th className="px-3 py-3 text-left font-medium text-slate-600">Câmera</th>
                      <th className="px-3 py-3 text-left font-medium text-slate-600">Direção</th>
                      <th className="px-3 py-3 text-left font-medium text-slate-600">Horário</th>
                      <th className="px-3 py-3 text-left font-medium text-slate-600">Class.</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {items.map((item) => (
                      <tr key={item.id} className="hover:bg-slate-50">
                        <td className="px-3 py-2">
                          {item.thumbnailUrl ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                              src={item.thumbnailUrl}
                              alt={`Placa ${item.placaNumero}`}
                              className="h-10 w-16 rounded object-cover"
                            />
                          ) : (
                            <div className="flex h-10 w-16 items-center justify-center rounded bg-slate-100 text-xs text-slate-400">
                              Sem foto
                            </div>
                          )}
                        </td>
                        <td className="px-3 py-2">
                          <Link
                            href={`/placas/${item.placaNumero}`}
                            className="font-bold tracking-wider text-slate-900 underline-offset-2 hover:text-ggtech-blue hover:underline"
                          >
                            {item.placaNumero}
                          </Link>
                        </td>
                        <td className="px-3 py-2 text-slate-700">{item.obra.nome}</td>
                        <td className="px-3 py-2 text-slate-500">{item.camera.codigoLpr}</td>
                        <td className="px-3 py-2 text-slate-500">{item.direcao ?? '—'}</td>
                        <td className="px-3 py-2 text-slate-500">
                          {new Date(item.timestamp).toLocaleString('pt-BR')}
                        </td>
                        <td className="px-3 py-2">
                          <ClassificationBadge classificacao={item.classificacao} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {nextCursor && (
                <div className="border-t border-slate-100 px-4 py-3 text-center">
                  <button
                    onClick={() => void loadMore()}
                    disabled={loading}
                    className="rounded-lg bg-ggtech-blue px-6 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
                  >
                    {loading ? 'Carregando...' : 'Carregar mais'}
                  </button>
                </div>
              )}
            </div>
          )}
          <p className="text-xs text-slate-400">
            {items.length} evento{items.length !== 1 ? 's' : ''} exibido
            {items.length !== 1 ? 's' : ''}
            {nextCursor ? ' (há mais)' : ''}
          </p>
        </>
      )}
    </div>
  );
}
