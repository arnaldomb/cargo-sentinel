'use client';

import { useEffect, useState } from 'react';
import { ShieldAlert, Trash2 } from 'lucide-react';

type Placa = {
  id: string;
  numero: string;
  classificacao: 'SUSPEITO' | 'CRITICO';
  observacao: string | null;
  updatedAt: string;
  obraClassificacao: { nome: string } | null;
};

const CLASS_STYLE: Record<string, string> = {
  SUSPEITO: 'bg-orange-100 text-orange-800 border-orange-300',
  CRITICO: 'bg-red-100 text-red-800 border-red-300',
};

export default function SuspeitosPage() {
  const [placas, setPlacas] = useState<Placa[]>([]);
  const [loading, setLoading] = useState(true);

  // form
  const [numero, setNumero] = useState('');
  const [classificacao, setClassificacao] = useState<'SUSPEITO' | 'CRITICO'>('SUSPEITO');
  const [observacao, setObservacao] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  async function loadPlacas() {
    setLoading(true);
    try {
      const res = await fetch('/api/placas-proxy/suspeitos', { cache: 'no-store' });
      if (res.ok) {
        const data = (await res.json()) as Placa[];
        setPlacas(Array.isArray(data) ? data : []);
      }
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void loadPlacas(); }, []);

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    if (!numero.trim() || numero.trim().length < 3) {
      setError('Número da placa inválido (mínimo 3 caracteres)');
      return;
    }
    setSaving(true);
    setError('');
    setSuccess('');
    const res = await fetch('/api/placas-proxy/suspeitos', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ numero: numero.trim().toUpperCase(), classificacao, observacao: observacao.trim() || undefined }),
    });
    setSaving(false);
    if (res.ok) {
      setNumero('');
      setObservacao('');
      setClassificacao('SUSPEITO');
      setSuccess('Placa adicionada à lista de suspeitos. Alertas serão disparados quando detectada.');
      setTimeout(() => setSuccess(''), 6000);
      void loadPlacas();
    } else {
      const body = (await res.json()) as { error?: string };
      setError(body.error ?? 'Erro ao adicionar placa');
    }
  }

  async function handleRemove(placaId: string, numero: string) {
    if (!confirm(`Remover ${numero} da lista de suspeitos?`)) return;
    const res = await fetch(`/api/placas-proxy/suspeitos/${placaId}`, { method: 'DELETE' });
    if (res.ok || res.status === 204) void loadPlacas();
  }

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="mx-auto max-w-4xl space-y-6">
        {/* Header */}
        <div className="flex items-center gap-3">
          <ShieldAlert className="h-7 w-7 text-orange-600" />
          <div>
            <h1 className="font-heading text-2xl font-bold text-slate-900">Lista de Suspeitos</h1>
            <p className="text-sm text-slate-500">
              Placas cadastradas aqui disparam alerta em qualquer câmera da empresa ao serem detectadas.
            </p>
          </div>
        </div>

        {/* Formulário de adição */}
        <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="mb-4 font-heading text-base font-semibold text-slate-800">Adicionar placa</h2>
          <form onSubmit={(e) => void handleAdd(e)} className="space-y-4">
            {error && (
              <div className="rounded-md border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-700">{error}</div>
            )}
            {success && (
              <div className="rounded-md border border-green-200 bg-green-50 px-4 py-2 text-sm text-green-700">{success}</div>
            )}
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-600">Placa <span className="text-red-500">*</span></label>
                <input
                  value={numero}
                  onChange={(e) => setNumero(e.target.value.toUpperCase())}
                  placeholder="ABC1D23"
                  maxLength={10}
                  required
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 font-mono text-sm uppercase focus:border-ggtech-blue focus:outline-none focus:ring-1 focus:ring-ggtech-blue"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-600">Nível de risco</label>
                <select
                  value={classificacao}
                  onChange={(e) => setClassificacao(e.target.value as 'SUSPEITO' | 'CRITICO')}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-ggtech-blue focus:outline-none focus:ring-1 focus:ring-ggtech-blue"
                >
                  <option value="SUSPEITO">Suspeito</option>
                  <option value="CRITICO">Crítico</option>
                </select>
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-600">Observação</label>
                <input
                  value={observacao}
                  onChange={(e) => setObservacao(e.target.value)}
                  placeholder="Motivo, descrição do veículo..."
                  maxLength={200}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-ggtech-blue focus:outline-none focus:ring-1 focus:ring-ggtech-blue"
                />
              </div>
            </div>
            <div className="flex justify-end">
              <button
                type="submit"
                disabled={saving}
                className="rounded-lg bg-orange-600 px-5 py-2 text-sm font-medium text-white hover:bg-orange-700 disabled:opacity-50 transition-colors"
              >
                {saving ? 'Adicionando...' : 'Adicionar à lista'}
              </button>
            </div>
          </form>
        </div>

        {/* Tabela de suspeitos */}
        <div className="rounded-lg border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-200 px-5 py-3">
            <h2 className="font-heading text-base font-semibold text-slate-800">
              Placas monitoradas ({loading ? '…' : placas.length})
            </h2>
          </div>

          {loading ? (
            <div className="p-6 text-center text-sm text-slate-400">Carregando...</div>
          ) : placas.length === 0 ? (
            <div className="p-8 text-center text-sm text-slate-500">
              Nenhuma placa na lista de suspeitos. Adicione acima.
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-slate-50 text-left text-xs font-medium uppercase tracking-wide text-slate-500">
                  <th className="px-5 py-3">Placa</th>
                  <th className="px-5 py-3">Nível</th>
                  <th className="px-5 py-3">Observação</th>
                  <th className="px-5 py-3">Atualizado em</th>
                  <th className="px-5 py-3 text-right">Ação</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {placas.map((p) => (
                  <tr key={p.id} className="hover:bg-slate-50 transition-colors">
                    <td className="px-5 py-3 font-mono font-semibold text-slate-800">{p.numero}</td>
                    <td className="px-5 py-3">
                      <span className={`inline-block rounded border px-2 py-0.5 text-xs font-semibold ${CLASS_STYLE[p.classificacao]}`}>
                        {p.classificacao === 'CRITICO' ? 'Crítico' : 'Suspeito'}
                      </span>
                    </td>
                    <td className="px-5 py-3 text-slate-500">{p.observacao ?? <span className="italic text-slate-300">—</span>}</td>
                    <td className="px-5 py-3 text-slate-400">
                      {new Date(p.updatedAt).toLocaleString('pt-BR')}
                    </td>
                    <td className="px-5 py-3 text-right">
                      <button
                        onClick={() => void handleRemove(p.id, p.numero)}
                        className="inline-flex items-center gap-1 rounded px-2 py-1 text-xs font-medium text-red-600 border border-red-200 hover:bg-red-50 transition-colors"
                      >
                        <Trash2 size={12} />
                        Remover
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}
