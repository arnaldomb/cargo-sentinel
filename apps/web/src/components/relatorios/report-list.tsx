'use client';

import { useEffect, useMemo, useState } from 'react';
import { io } from 'socket.io-client';
import { resolveApiBaseUrl } from '@/lib/dashboard';

export type RelatorioItem = {
  id: string;
  formato: string;
  status: 'PENDENTE' | 'PROCESSANDO' | 'PRONTO' | 'ERRO';
  filtros: Record<string, unknown>;
  expiresAt: string | null;
  erroMsg: string | null;
  criadoEm: string;
};

type RelatorioProntoPayload = {
  relatorioId: string;
  formato: string;
  downloadUrl: string;
  expiresAt: string;
};

export type ReportListProps = {
  initialItems: RelatorioItem[];
};

function StatusBadge({ status }: { status: RelatorioItem['status'] }) {
  if (status === 'PENDENTE') {
    return (
      <span className="inline-flex items-center rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-medium text-slate-600">
        Pendente
      </span>
    );
  }
  if (status === 'PROCESSANDO') {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-blue-100 px-2.5 py-0.5 text-xs font-medium text-blue-700">
        <span className="inline-block h-2 w-2 animate-spin rounded-full border-2 border-blue-400 border-t-transparent" />
        Processando
      </span>
    );
  }
  if (status === 'PRONTO') {
    return (
      <span className="inline-flex items-center rounded-full bg-green-100 px-2.5 py-0.5 text-xs font-medium text-green-700">
        Pronto
      </span>
    );
  }
  // ERRO
  return (
    <span className="inline-flex items-center rounded-full bg-red-100 px-2.5 py-0.5 text-xs font-medium text-red-700">
      Erro
    </span>
  );
}

function buildFiltrosSummary(filtros: Record<string, unknown>): string {
  const parts: string[] = [];
  if (filtros.placa) parts.push(`Placa: ${filtros.placa}`);
  if (filtros.classificacao) parts.push(`Class.: ${filtros.classificacao}`);
  if (filtros.dataInicio || filtros.dataFim) {
    const de = filtros.dataInicio
      ? new Date(filtros.dataInicio as string).toLocaleDateString('pt-BR')
      : '';
    const ate = filtros.dataFim
      ? new Date(filtros.dataFim as string).toLocaleDateString('pt-BR')
      : '';
    if (de && ate) parts.push(`${de} – ${ate}`);
    else if (de) parts.push(`A partir de ${de}`);
    else if (ate) parts.push(`Até ${ate}`);
  }
  return parts.length > 0 ? parts.join(' · ') : 'Sem filtros aplicados';
}

export function ReportList({ initialItems }: ReportListProps) {
  const [items, setItems] = useState<RelatorioItem[]>(initialItems);
  const [toastMsg, setToastMsg] = useState<string | null>(null);
  const [downloadError, setDownloadError] = useState<string | null>(null);

  const apiBaseUrl = useMemo(() => {
    if (typeof window === 'undefined') return 'http://localhost:4000';
    return resolveApiBaseUrl(window.location.hostname, window.location.protocol);
  }, []);

  // Socket.IO — escuta event report:pronto
  useEffect(() => {
    const socket = io(apiBaseUrl, {
      withCredentials: true,
      path: '/socket.io',
      transports: ['websocket', 'polling'],
    });

    socket.on('report:pronto', (payload: RelatorioProntoPayload) => {
      setItems((prev) =>
        prev.map((item) =>
          item.id === payload.relatorioId
            ? { ...item, status: 'PRONTO' as const, expiresAt: payload.expiresAt }
            : item,
        ),
      );
      setToastMsg(`Relatório ${payload.formato} pronto para download!`);
      // Auto-dismiss toast em 5s
      setTimeout(() => setToastMsg(null), 5000);
    });

    return () => {
      socket.off('report:pronto');
      socket.close();
    };
  }, [apiBaseUrl]);

  // Polling como fallback (30s) — atualiza a lista caso Socket.IO desconecte
  useEffect(() => {
    const interval = window.setInterval(() => {
      fetch('/api/relatorios-proxy', { credentials: 'include' })
        .then((r) => r.json())
        .then((data: { items?: RelatorioItem[] }) => {
          if (data.items) {
            setItems(data.items);
          }
        })
        .catch(() => {
          // silencioso — Socket.IO é a fonte primária
        });
    }, 30_000);

    return () => window.clearInterval(interval);
  }, []);

  async function handleDownload(relatorioId: string) {
    setDownloadError(null);
    try {
      const res = await fetch(`/api/relatorios-proxy/${relatorioId}/download`, {
        credentials: 'include',
      });
      if (res.status === 410) {
        setDownloadError('Link expirado — solicite um novo relatório');
        return;
      }
      if (!res.ok) {
        setDownloadError('Erro ao gerar link de download');
        return;
      }
      const { downloadUrl } = (await res.json()) as { downloadUrl: string };
      window.open(downloadUrl, '_blank', 'noopener,noreferrer');
    } catch {
      setDownloadError('Erro de rede ao baixar relatório');
    }
  }

  const now = new Date();

  return (
    <div className="space-y-3">
      {/* Toast de notificação Socket.IO */}
      {toastMsg && (
        <div className="flex items-center justify-between rounded-lg border border-green-200 bg-green-50 px-4 py-3">
          <p className="text-sm font-medium text-green-800">{toastMsg}</p>
          <button
            onClick={() => setToastMsg(null)}
            className="ml-4 text-green-600 hover:text-green-800 text-xs font-medium"
          >
            Fechar
          </button>
        </div>
      )}

      {/* Erro de download */}
      {downloadError && (
        <div className="flex items-center justify-between rounded-lg border border-red-200 bg-red-50 px-4 py-3">
          <p className="text-sm text-red-700">{downloadError}</p>
          <button
            onClick={() => setDownloadError(null)}
            className="ml-4 text-red-500 hover:text-red-700 text-xs font-medium"
          >
            Fechar
          </button>
        </div>
      )}

      {items.length === 0 ? (
        <p className="text-sm text-slate-500">Nenhum relatório solicitado ainda.</p>
      ) : (
        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b border-slate-200 bg-slate-50">
                <tr>
                  <th className="px-4 py-3 text-left font-medium text-slate-600">Data</th>
                  <th className="px-4 py-3 text-left font-medium text-slate-600">Formato</th>
                  <th className="px-4 py-3 text-left font-medium text-slate-600">Filtros</th>
                  <th className="px-4 py-3 text-left font-medium text-slate-600">Status</th>
                  <th className="px-4 py-3 text-left font-medium text-slate-600">Ação</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {items.map((item) => {
                  const isExpired =
                    item.status === 'PRONTO' &&
                    item.expiresAt != null &&
                    new Date(item.expiresAt) < now;

                  return (
                    <tr key={item.id} className="hover:bg-slate-50">
                      <td className="whitespace-nowrap px-4 py-3 text-slate-700">
                        {new Date(item.criadoEm).toLocaleString('pt-BR')}
                      </td>
                      <td className="px-4 py-3">
                        <span className="rounded bg-slate-100 px-2 py-0.5 text-xs font-mono font-medium text-slate-700">
                          {item.formato}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-slate-500 max-w-xs truncate">
                        {buildFiltrosSummary(item.filtros)}
                      </td>
                      <td className="px-4 py-3">
                        <StatusBadge status={item.status} />
                        {item.status === 'ERRO' && item.erroMsg && (
                          <p className="mt-1 text-xs text-red-600">{item.erroMsg}</p>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        {item.status === 'PRONTO' && !isExpired && (
                          <button
                            onClick={() => void handleDownload(item.id)}
                            className="rounded-lg bg-ggtech-blue px-3 py-1.5 text-xs font-medium text-white hover:opacity-90"
                          >
                            Download
                          </button>
                        )}
                        {isExpired && (
                          <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-medium text-slate-500">
                            Expirado
                          </span>
                        )}
                        {(item.status === 'PENDENTE' || item.status === 'PROCESSANDO') && (
                          <span className="text-xs text-slate-400">Aguardando...</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
