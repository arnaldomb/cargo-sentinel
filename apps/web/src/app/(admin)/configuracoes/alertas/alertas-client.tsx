'use client';

import { useEffect, useState } from 'react';
import { resolveApiBaseUrl } from '@/lib/dashboard';

type Obra = { id: string; nome: string };
type ConfiguracaoAlerta = {
  id: string;
  telefone: string;
  obraId: string;
  createdAt: string;
};

function isValidE164(phone: string): boolean {
  return /^\+\d{10,15}$/.test(phone);
}

export function AlertasClient() {
  const [obras, setObras] = useState<Obra[]>([]);
  const [obraId, setObraId] = useState<string>('');
  const [configs, setConfigs] = useState<ConfiguracaoAlerta[]>([]);
  const [telefone, setTelefone] = useState('');
  const [loading, setLoading] = useState(false);

  const apiBaseUrl =
    typeof window === 'undefined'
      ? 'http://localhost:4000'
      : resolveApiBaseUrl(window.location.hostname, window.location.protocol);

  // Carregar obras da empresa
  useEffect(() => {
    fetch(`${apiBaseUrl}/api/obras`, { credentials: 'include' })
      .then((r) => r.json())
      .then((data: { items?: Obra[] }) => {
        const items = data.items ?? [];
        setObras(items);
        if (items.length > 0) setObraId(items[0].id);
      })
      .catch(console.error);
  }, [apiBaseUrl]);

  // Carregar configuracoes da obra selecionada
  useEffect(() => {
    if (!obraId) return;
    fetch(`${apiBaseUrl}/api/configuracoes-alerta?obraId=${obraId}`, {
      credentials: 'include',
    })
      .then((r) => r.json())
      .then((data: { items?: ConfiguracaoAlerta[] }) => setConfigs(data.items ?? []))
      .catch(console.error);
  }, [apiBaseUrl, obraId]);

  async function handleAdd() {
    if (!isValidE164(telefone)) {
      window.alert('Numero deve estar no formato E.164: +5511999999999');
      return;
    }
    setLoading(true);
    try {
      const res = await fetch(`${apiBaseUrl}/api/configuracoes-alerta`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ obraId, telefone }),
      });
      if (!res.ok) {
        const body = (await res.json()) as { error?: string };
        window.alert(body.error ?? 'Erro ao adicionar numero');
        return;
      }
      const newConfig = (await res.json()) as ConfiguracaoAlerta;
      setConfigs((prev) => [...prev, newConfig]);
      setTelefone('');
    } catch {
      window.alert('Erro de rede ao adicionar numero');
    } finally {
      setLoading(false);
    }
  }

  async function handleRemove(id: string) {
    if (!window.confirm('Remover este numero de alerta?')) return;
    try {
      const res = await fetch(`${apiBaseUrl}/api/configuracoes-alerta/${id}`, {
        method: 'DELETE',
        credentials: 'include',
      });
      if (!res.ok) {
        window.alert('Erro ao remover numero');
        return;
      }
      setConfigs((prev) => prev.filter((c) => c.id !== id));
    } catch {
      window.alert('Erro de rede ao remover numero');
    }
  }

  return (
    <div className="max-w-2xl space-y-6">
      {/* Seletor de obra */}
      <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <label className="mb-1 block text-sm font-medium text-slate-700">
          Obra
        </label>
        <select
          value={obraId}
          onChange={(e) => setObraId(e.target.value)}
          className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ggtech-blue"
          data-testid="obra-select"
        >
          {obras.length === 0 && (
            <option value="" disabled>
              Carregando obras...
            </option>
          )}
          {obras.map((o) => (
            <option key={o.id} value={o.id}>
              {o.nome}
            </option>
          ))}
        </select>
      </div>

      {/* Lista de numeros configurados */}
      <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="mb-3 text-sm font-semibold text-slate-700">
          Numeros configurados ({configs.length})
        </h2>
        {configs.length === 0 ? (
          <p className="text-sm text-slate-500">
            Nenhum numero configurado para esta obra.
          </p>
        ) : (
          <ul className="space-y-2" data-testid="configs-list">
            {configs.map((c) => (
              <li
                key={c.id}
                className="flex items-center justify-between rounded-lg border border-slate-200 bg-slate-50 px-4 py-3"
              >
                <span className="font-mono text-sm text-slate-900">{c.telefone}</span>
                <button
                  onClick={() => handleRemove(c.id)}
                  className="text-sm font-medium text-red-600 transition-colors hover:text-red-800"
                  data-testid="remove-btn"
                >
                  Remover
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Adicionar novo numero */}
      <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="mb-3 text-sm font-semibold text-slate-700">
          Adicionar numero
        </h2>
        <div className="flex gap-3">
          <input
            type="tel"
            value={telefone}
            onChange={(e) => setTelefone(e.target.value)}
            placeholder="+5511999999999"
            className="flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ggtech-blue"
            data-testid="telefone-input"
          />
          <button
            onClick={handleAdd}
            disabled={loading || !telefone || !obraId}
            className="rounded-lg bg-ggtech-blue px-4 py-2 text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-50"
            data-testid="add-btn"
          >
            {loading ? 'Adicionando...' : 'Adicionar'}
          </button>
        </div>
        <p className="mt-1 text-xs text-slate-500">
          Formato: +5511999999999 (codigo do pais obrigatorio)
        </p>
      </div>
    </div>
  );
}
