'use client';

import { useEffect, useState, type FormEvent } from 'react';
import { resolveApiBaseUrl } from '@/lib/dashboard';

type Obra = { id: string; nome: string; ativo: boolean };
type Camera = { id: string; codigoLpr: string; ativo: boolean };

export type ReportFormProps = {
  onReportRequested: (relatorioId: string) => void;
};

const CLASSIFICACOES = ['LIBERADO', 'VISITANTE', 'ATENCAO', 'SUSPEITO', 'CRITICO'] as const;

export function ReportForm({ onReportRequested }: ReportFormProps) {
  // Form fields
  const [formato, setFormato] = useState<'PDF' | 'XLSX'>('PDF');
  const [placa, setPlaca] = useState('');
  const [dataInicio, setDataInicio] = useState('');
  const [dataFim, setDataFim] = useState('');
  const [obraId, setObraId] = useState('');
  const [cameraId, setCameraId] = useState('');
  const [classificacao, setClassificacao] = useState('');

  // Data for selects
  const [obras, setObras] = useState<Obra[]>([]);
  const [cameras, setCameras] = useState<Camera[]>([]);
  const [loadingCameras, setLoadingCameras] = useState(false);

  // UI state
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const apiBaseUrl =
    typeof window === 'undefined'
      ? 'http://localhost:4000'
      : resolveApiBaseUrl(window.location.hostname, window.location.protocol);

  // Carregar obras na montagem
  useEffect(() => {
    fetch(`${apiBaseUrl}/api/obras`, { credentials: 'include' })
      .then((r) => r.json())
      .then((data: { obras?: Obra[]; items?: Obra[] }) => {
        const list = data.obras ?? data.items ?? [];
        setObras(list.filter((o) => o.ativo));
      })
      .catch(() => {
        // silencioso — select ficará vazio e usuário pode gerar sem filtro de obra
      });
  }, [apiBaseUrl]);

  // Carregar câmeras quando obra é selecionada
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

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setSuccessMsg(null);

    try {
      const filtros: Record<string, string> = {};
      if (placa.trim()) filtros.placa = placa.trim().toUpperCase();
      if (dataInicio) filtros.dataInicio = new Date(dataInicio).toISOString();
      if (dataFim) filtros.dataFim = new Date(dataFim).toISOString();
      if (obraId) filtros.obraId = obraId;
      if (cameraId) filtros.cameraId = cameraId;
      if (classificacao) filtros.classificacao = classificacao;

      const res = await fetch('/api/relatorios-proxy', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ formato, filtros }),
      });

      const data = (await res.json()) as { relatorioId?: string; error?: string };

      if (!res.ok) {
        setError(data.error ?? 'Erro ao solicitar relatório');
        return;
      }

      setSuccessMsg('Relatório solicitado! Você será notificado quando estiver pronto.');
      onReportRequested(data.relatorioId!);

      // Reset form
      setPlaca('');
      setDataInicio('');
      setDataFim('');
      setObraId('');
      setCameraId('');
      setCameras([]);
      setClassificacao('');
      setFormato('PDF');
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={(e) => void handleSubmit(e)} className="space-y-4">
      {/* Formato */}
      <div>
        <label className="mb-1 block text-xs font-medium text-slate-600">Formato</label>
        <div className="flex gap-4">
          {(['PDF', 'XLSX'] as const).map((f) => (
            <label key={f} className="flex items-center gap-2 cursor-pointer text-sm text-slate-700">
              <input
                type="radio"
                name="formato"
                value={f}
                checked={formato === f}
                onChange={() => setFormato(f)}
                className="accent-ggtech-blue"
              />
              {f === 'PDF' ? 'PDF' : 'Excel (XLSX)'}
            </label>
          ))}
        </div>
      </div>

      {/* Grid de filtros */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {/* Placa */}
        <div>
          <label className="mb-1 block text-xs font-medium text-slate-600">Placa (parcial)</label>
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

        {/* Classificação */}
        <div>
          <label className="mb-1 block text-xs font-medium text-slate-600">Classificação</label>
          <select
            value={classificacao}
            onChange={(e) => setClassificacao(e.target.value)}
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-ggtech-blue focus:outline-none focus:ring-1 focus:ring-ggtech-blue"
          >
            <option value="">Todas</option>
            {CLASSIFICACOES.map((c) => (
              <option key={c} value={c}>
                {c.charAt(0) + c.slice(1).toLowerCase()}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Feedback de erro ou sucesso */}
      {error && (
        <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      )}
      {successMsg && (
        <p className="rounded-lg border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-700">
          {successMsg}
        </p>
      )}

      {/* Submit */}
      <div className="flex justify-end">
        <button
          type="submit"
          disabled={loading}
          className="rounded-lg bg-ggtech-blue px-6 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
        >
          {loading ? 'Solicitando...' : 'Gerar Relatório'}
        </button>
      </div>
    </form>
  );
}
