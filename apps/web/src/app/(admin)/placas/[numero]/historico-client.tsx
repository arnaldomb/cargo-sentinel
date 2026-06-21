'use client';

import { useState } from 'react';
import { getClassificationColor } from '@/lib/dashboard';

type Classificacao = 'LIBERADO' | 'VISITANTE' | 'ATENCAO' | 'SUSPEITO' | 'CRITICO';

type EventoItem = {
  id: string;
  timestamp: string;
  direcao: 'ENTRADA' | 'SAIDA' | null;
  classificacao: Classificacao;
  thumbnailUrl: string | null;
  obra: { id: string; nome: string };
  camera: { id: string; codigoLpr: string };
};

type Props = {
  placaNumero: string;
  initialItems: EventoItem[];
  initialNextCursor: string | null;
};

export default function PlacaHistoricoClient({
  placaNumero,
  initialItems,
  initialNextCursor,
}: Props) {
  const [items, setItems] = useState<EventoItem[]>(initialItems);
  const [cursor, setCursor] = useState<string | null>(initialNextCursor);
  const [loading, setLoading] = useState(false);

  async function loadMore() {
    if (!cursor || loading) return;
    setLoading(true);
    try {
      const res = await fetch(
        `/api/placas-proxy/${encodeURIComponent(placaNumero)}/historico?cursor=${cursor}&limit=20`,
        { credentials: 'include' },
      );
      if (!res.ok) throw new Error('Erro ao carregar mais eventos');
      const data = (await res.json()) as { items: EventoItem[]; nextCursor: string | null };
      setItems((prev) => [...prev, ...data.items]);
      setCursor(data.nextCursor);
    } catch {
      // erro silencioso — botao permanece disponivel para nova tentativa
    } finally {
      setLoading(false);
    }
  }

  if (items.length === 0) {
    return <p className="text-sm text-slate-500">Nenhuma deteccao registrada.</p>;
  }

  return (
    <div className="space-y-3">
      {items.map((evento) => (
        <article
          key={evento.id}
          className="grid grid-cols-[120px_1fr] items-center gap-3 rounded-xl border border-slate-200 bg-white p-3 shadow-sm"
          style={{
            borderLeftColor: getClassificationColor(evento.classificacao),
            borderLeftWidth: 6,
          }}
        >
          {/* Thumbnail */}
          <div className="flex h-[72px] w-[120px] items-center justify-center overflow-hidden rounded-lg bg-slate-100 text-xs text-slate-400">
            {evento.thumbnailUrl ? (
              <img
                src={evento.thumbnailUrl}
                alt={`Leitura em ${evento.obra.nome}`}
                className="h-full w-full object-cover"
              />
            ) : (
              'Sem foto'
            )}
          </div>

          {/* Info */}
          <div>
            <div className="flex flex-wrap items-center gap-2 text-sm font-medium text-slate-800">
              <span>{evento.obra.nome}</span>
              <span className="text-slate-400">·</span>
              <span className="text-slate-500">{evento.camera.codigoLpr}</span>
            </div>
            <div className="mt-1 flex flex-wrap gap-3 text-xs text-slate-500">
              <span>{new Date(evento.timestamp).toLocaleString('pt-BR')}</span>
              {evento.direcao && <span>{evento.direcao}</span>}
            </div>
          </div>
        </article>
      ))}

      {cursor && (
        <div className="pt-2 text-center">
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
  );
}
