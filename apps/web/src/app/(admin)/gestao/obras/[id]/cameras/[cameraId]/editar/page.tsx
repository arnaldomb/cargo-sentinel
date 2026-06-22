'use client';

import { useEffect, useState } from 'react';
import { useRouter, useParams } from 'next/navigation';

export default function EditarCameraPage() {
  const params = useParams<{ id: string; cameraId: string }>();
  const router = useRouter();
  const [codigoLpr, setCodigoLpr] = useState('');
  const [nome, setNome] = useState('');
  const [ip, setIp] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    fetch(`/api/obras-proxy/${params.id}/cameras`)
      .then((r) => r.json())
      .then((data: unknown) => {
        const cameras = Array.isArray(data) ? data : [];
        const cam = cameras.find((c: { id: string }) => c.id === params.cameraId) as
          | { codigoLpr: string; nome?: string | null; ip?: string | null }
          | undefined;
        if (cam) {
          setCodigoLpr(cam.codigoLpr);
          setNome(cam.nome ?? '');
          setIp(cam.ip ?? '');
        }
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [params.id, params.cameraId]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!codigoLpr.trim()) { setError('Código LPR é obrigatório'); return; }
    setSaving(true);
    setError('');
    const res = await fetch(`/api/obras-proxy/${params.id}/cameras/${params.cameraId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        codigoLpr: codigoLpr.trim(),
        nome: nome.trim() || undefined,
        ip: ip.trim() || undefined,
      }),
    });
    setSaving(false);
    if (res.ok) {
      router.push(`/gestao/obras/${params.id}`);
    } else {
      const body = (await res.json()) as { error?: string };
      setError(body.error ?? 'Erro ao atualizar câmera');
    }
  }

  if (loading) {
    return <div className="flex min-h-screen items-center justify-center text-sm text-slate-500">Carregando...</div>;
  }

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="mx-auto max-w-lg">
        <a href={`/gestao/obras/${params.id}`} className="text-sm text-ggtech-blue hover:underline">
          ← Voltar para a Obra
        </a>
        <h1 className="mt-3 font-heading text-2xl font-bold text-slate-900">Editar Câmera</h1>

        <form onSubmit={handleSubmit} className="mt-6 space-y-4 rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
          {error && (
            <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              {error}
            </div>
          )}

          <div>
            <label htmlFor="nome" className="block text-sm font-medium text-slate-700">
              Nome da Câmera
            </label>
            <input
              id="nome"
              value={nome}
              onChange={(e) => setNome(e.target.value)}
              maxLength={100}
              placeholder="Ex: Entrada Principal, Portão Lateral"
              className="mt-1 block w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ggtech-blue"
            />
          </div>

          <div>
            <label htmlFor="codigoLpr" className="block text-sm font-medium text-slate-700">
              Código LPR <span className="text-red-500">*</span>
            </label>
            <input
              id="codigoLpr"
              value={codigoLpr}
              onChange={(e) => setCodigoLpr(e.target.value)}
              required
              className="mt-1 block w-full rounded-md border border-slate-300 px-3 py-2 font-mono text-sm focus:outline-none focus:ring-2 focus:ring-ggtech-blue"
            />
            <p className="mt-1 text-xs text-slate-400">Identificador único do dispositivo LPR</p>
          </div>

          <div>
            <label htmlFor="ip" className="block text-sm font-medium text-slate-700">
              Endereço IP
            </label>
            <input
              id="ip"
              value={ip}
              onChange={(e) => setIp(e.target.value)}
              placeholder="192.168.1.x"
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
