'use client';

import { useEffect, useState } from 'react';
import { useRouter, useParams } from 'next/navigation';

export default function EditarObraPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const [nome, setNome] = useState('');
  const [endereco, setEndereco] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    fetch('/api/obras-proxy')
      .then((r) => r.json())
      .then((data: unknown) => {
        const obras = Array.isArray(data) ? data : [];
        const obra = obras.find((o: { id: string }) => o.id === params.id) as
          | { nome: string; endereco?: string }
          | undefined;
        if (obra) {
          setNome(obra.nome);
          setEndereco(obra.endereco ?? '');
        }
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [params.id]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!nome.trim()) { setError('Nome é obrigatório'); return; }
    setSaving(true);
    setError('');
    const res = await fetch(`/api/obras-proxy/${params.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ nome: nome.trim(), endereco: endereco.trim() || undefined }),
    });
    setSaving(false);
    if (res.ok) {
      router.push(`/gestao/obras/${params.id}`);
    } else {
      const body = (await res.json()) as { error?: string };
      setError(body.error ?? 'Erro ao atualizar obra');
    }
  }

  if (loading) {
    return <div className="flex min-h-screen items-center justify-center text-sm text-slate-500">Carregando...</div>;
  }

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="mx-auto max-w-lg">
        <a href={`/gestao/obras/${params.id}`} className="text-sm text-ggtech-blue hover:underline">
          ← Voltar
        </a>
        <h1 className="mt-3 font-heading text-2xl font-bold text-slate-900">Editar Obra</h1>

        <form onSubmit={handleSubmit} className="mt-6 space-y-4 rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
          {error && (
            <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              {error}
            </div>
          )}
          <div>
            <label htmlFor="nome" className="block text-sm font-medium text-slate-700">
              Nome da Obra <span className="text-red-500">*</span>
            </label>
            <input
              id="nome"
              value={nome}
              onChange={(e) => setNome(e.target.value)}
              required
              maxLength={100}
              className="mt-1 block w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ggtech-blue"
            />
          </div>
          <div>
            <label htmlFor="endereco" className="block text-sm font-medium text-slate-700">
              Endereço
            </label>
            <input
              id="endereco"
              value={endereco}
              onChange={(e) => setEndereco(e.target.value)}
              maxLength={200}
              className="mt-1 block w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ggtech-blue"
            />
          </div>
          <div className="flex items-center gap-3 pt-2">
            <button
              type="submit"
              disabled={saving}
              className="rounded-md bg-ggtech-blue px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50 transition-opacity"
            >
              {saving ? 'Salvando...' : 'Salvar'}
            </button>
            <a
              href={`/gestao/obras/${params.id}`}
              className="rounded-md border border-ggtech-lightblue px-4 py-2 text-sm font-medium text-ggtech-lightblue hover:bg-slate-50 transition-colors"
            >
              Cancelar
            </a>
          </div>
        </form>
      </div>
    </div>
  );
}
