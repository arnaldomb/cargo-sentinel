'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { Menu } from 'lucide-react';
import { io, type Socket } from 'socket.io-client';
import {
  getClassificationColor,
  getClassificationLabel,
  requiresCriticalConfirmation,
  resolveApiBaseUrl,
  updateFeedClassification,
  upsertCameraStatus,
  upsertFeedItem,
  type CameraStatusItem,
  type FeedItem,
} from '@/lib/dashboard';
import { ClassificationBadge } from './classification-badge';
import { ClassificationPopover } from './classification-popover';
import { CriticalConfirmDialog } from './critical-confirm-dialog';
import { CrossSiteAlertOverlay, type CrossSiteAlertDTO } from './cross-site-alert-overlay';
import { Sidebar } from './sidebar';

type DashboardClientProps = {
  userName: string;
  userRole: string;
};

export function DashboardClient({ userName, userRole }: DashboardClientProps) {
  const [feed, setFeed] = useState<FeedItem[]>([]);
  const [cameras, setCameras] = useState<CameraStatusItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activePlacaId, setActivePlacaId] = useState<string | null>(null);
  const [pendingCount, setPendingCount] = useState(0);
  const [sidebarOpen, setSidebarOpen] = useState(false);

  // Critical confirmation dialog state
  const [confirmDialog, setConfirmDialog] = useState<{
    item: FeedItem;
    classificacao: FeedItem['classificacao'];
  } | null>(null);

  // Cross-site alert overlay state (INTEL-05)
  const [crossSiteAlert, setCrossSiteAlert] = useState<CrossSiteAlertDTO | null>(null);

  const listRef = useRef<HTMLDivElement | null>(null);
  const pinnedToTopRef = useRef(true);
  const socketRef = useRef<Socket | null>(null);

  const apiBaseUrl = useMemo(() => {
    if (typeof window === 'undefined') return 'http://localhost:4000';
    return resolveApiBaseUrl(window.location.hostname, window.location.protocol);
  }, []);

  // Initial data load
  useEffect(() => {
    let isMounted = true;

    async function refreshCameraStatus() {
      try {
        const response = await fetch('/api/cameras-status-proxy');
        if (!response.ok || !isMounted) return;
        const cameraJson = await response.json();
        if (!isMounted) return;
        setCameras(cameraJson.items ?? []);
      } catch {
        // Keep the current sidebar state if the periodic refresh fails.
      }
    }

    async function load() {
      try {
        setLoading(true);
        setError(null);

        const [feedRes, cameraRes] = await Promise.all([
          fetch('/api/eventos-proxy/feed?limit=25'),
          fetch('/api/cameras-status-proxy'),
        ]);

        if (!feedRes.ok || !cameraRes.ok) {
          throw new Error('Não foi possível carregar o painel');
        }

        const [feedJson, cameraJson] = await Promise.all([feedRes.json(), cameraRes.json()]);
        setFeed(feedJson.items ?? []);
        setCameras(cameraJson.items ?? []);
      } catch (loadError) {
        setError(loadError instanceof Error ? loadError.message : 'Erro ao carregar o painel');
      } finally {
        setLoading(false);
      }
    }

    void load();
    const refreshTimer = window.setInterval(() => {
      void refreshCameraStatus();
    }, 15_000);

    return () => {
      isMounted = false;
      window.clearInterval(refreshTimer);
    };
  }, [apiBaseUrl]);

  // Socket.IO subscription
  useEffect(() => {
    const socket = io(apiBaseUrl || undefined, {
      withCredentials: true,
      path: '/socket.io',
      transports: ['websocket', 'polling'],
    });

    socket.on('feed:evento-novo', (incoming: FeedItem) => {
      setFeed((current) => upsertFeedItem(current, incoming));
      if (pinnedToTopRef.current && listRef.current) {
        listRef.current.scrollTop = 0;
      } else {
        setPendingCount((count) => count + 1);
      }
    });

    socket.on(
      'feed:placa-classificada',
      (incoming: { placaId: string; classificacao: FeedItem['classificacao'] }) => {
        setFeed((current) => updateFeedClassification(current, incoming));
      },
    );

    socket.on('feed:camera-status', (incoming: CameraStatusItem) => {
      setCameras((current) => upsertCameraStatus(current, incoming));
    });

    // Cross-site alert: novo alerta substitui o anterior (INTEL-05)
    socket.on('feed:alerta-cross-site', (incoming: CrossSiteAlertDTO) => {
      setCrossSiteAlert(incoming);
    });

    socketRef.current = socket;
    return () => {
      socket.close();
      socketRef.current = null;
    };
  }, [apiBaseUrl]);

  async function submitClassification(item: FeedItem, classificacao: FeedItem['classificacao']) {
    if (!item.placaId) return;

    const response = await fetch(`/api/placas-proxy/${item.placaId}/classificacao`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ classificacao }),
    });

    if (!response.ok) {
      window.alert('Não foi possível atualizar a classificação.');
      return;
    }

    setFeed((current) =>
      updateFeedClassification(current, { placaId: item.placaId!, classificacao }),
    );
    setActivePlacaId(null);
  }

  function handleClassificationSelect(item: FeedItem, classificacao: FeedItem['classificacao']) {
    if (!item.placaId) return;

    if (requiresCriticalConfirmation(classificacao)) {
      setConfirmDialog({ item, classificacao });
      return;
    }

    void submitClassification(item, classificacao);
  }

  function handleConfirmCritical() {
    if (!confirmDialog) return;
    void submitClassification(confirmDialog.item, confirmDialog.classificacao);
    setConfirmDialog(null);
  }

  function handleFeedScroll() {
    const element = listRef.current;
    if (!element) return;
    pinnedToTopRef.current = element.scrollTop <= 24;
  }

  function scrollToTopAndResume() {
    if (listRef.current) listRef.current.scrollTop = 0;
    pinnedToTopRef.current = true;
    setPendingCount(0);
  }

  return (
    <>
      {/* Sidebar com câmeras — responsiva (drawer no mobile) */}
      <Sidebar
        cameras={cameras}
        userName={userName}
        userRole={userRole}
        isOpen={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
      />

      {/* Main — live event feed */}
      <main className="flex flex-1 flex-col overflow-hidden p-4">
        <div className="mb-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            {/* Botão hamburger — visível apenas em mobile (lg:hidden) */}
            <button
              onClick={() => setSidebarOpen(true)}
              className="flex h-9 w-9 items-center justify-center rounded-lg text-slate-600 hover:bg-slate-100 lg:hidden"
              aria-label="Abrir menu de câmeras"
              data-testid="hamburger-btn"
            >
              <Menu size={20} />
            </button>
            <div>
              <h2 className="font-heading text-lg font-bold text-slate-900">Feed Operacional</h2>
              <p className="text-sm text-slate-500">Eventos ao vivo com classificação inline.</p>
            </div>
          </div>

          {pendingCount > 0 && (
            <button
              onClick={scrollToTopAndResume}
              className="rounded-full bg-ggtech-blue px-4 py-2 text-sm font-medium text-white transition-opacity hover:opacity-90"
              data-testid="pending-events-btn"
            >
              {pendingCount} novos eventos ↑
            </button>
          )}
        </div>

        {loading && <p className="text-sm text-slate-500">Carregando painel...</p>}
        {error && <p className="text-sm text-red-600">{error}</p>}

        <div
          ref={listRef}
          onScroll={handleFeedScroll}
          className="flex flex-col gap-3 overflow-y-auto pr-1"
          data-testid="event-feed"
        >
          {!loading &&
            !error &&
            feed.map((item) => (
              <article
                key={item.id}
                className="grid grid-cols-[120px_1fr_auto] items-center gap-3 rounded-xl border border-slate-200 bg-white p-3 shadow-sm"
                style={{
                  borderLeftColor: getClassificationColor(item.classificacao),
                  borderLeftWidth: 6,
                }}
                data-testid="event-row"
              >
                {/* Thumbnail */}
                <div className="flex h-[72px] w-[120px] items-center justify-center overflow-hidden rounded-lg bg-slate-100 text-xs text-slate-400">
                  {item.thumbnailUrl ? (
                    <img
                      src={item.thumbnailUrl}
                      alt={`Leitura da placa ${item.placaNumero}`}
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    'Sem foto'
                  )}
                </div>

                {/* Info */}
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <Link
                      href={`/placas/${item.placaNumero}`}
                      className="text-xl font-bold tracking-wider text-slate-900 underline-offset-2 hover:underline hover:text-ggtech-blue"
                      data-testid="placa-link"
                    >
                      {item.placaNumero}
                    </Link>
                    <span className="text-sm text-slate-500">
                      {item.obra.nome} · {item.camera.codigoLpr}
                    </span>
                  </div>
                  <div className="mt-1.5 flex flex-wrap gap-3 text-sm text-slate-500">
                    <span>{new Date(item.timestamp).toLocaleString('pt-BR')}</span>
                    <span>{item.direcao ?? 'Direção não informada'}</span>
                  </div>
                </div>

                {/* Classification badge + popover */}
                <div className="flex flex-col items-end gap-2">
                  <button
                    onClick={() =>
                      setActivePlacaId((current) =>
                        current === item.placaId ? null : item.placaId,
                      )
                    }
                    disabled={!item.placaId}
                    aria-label={`Classificação: ${item.classificacao}. Clique para alterar.`}
                    data-testid="classification-badge-btn"
                  >
                    <ClassificationBadge classificacao={item.classificacao} />
                  </button>

                  {activePlacaId === item.placaId && item.placaId && (
                    <ClassificationPopover
                      current={item.classificacao}
                      onSelect={(opt) => handleClassificationSelect(item, opt)}
                      onClose={() => setActivePlacaId(null)}
                    />
                  )}
                </div>
              </article>
            ))}
        </div>
      </main>

      {/* Critical confirmation dialog */}
      {confirmDialog && (
        <CriticalConfirmDialog
          placaNumero={confirmDialog.item.placaNumero}
          classificacao={confirmDialog.classificacao}
          classificacaoLabel={getClassificationLabel(confirmDialog.classificacao)}
          onConfirm={handleConfirmCritical}
          onCancel={() => setConfirmDialog(null)}
        />
      )}

      {/* Cross-site alert overlay — z-[100] acima de tudo (INTEL-05) */}
      {crossSiteAlert && (
        <CrossSiteAlertOverlay
          alert={crossSiteAlert}
          onDismiss={() => setCrossSiteAlert(null)}
        />
      )}
    </>
  );
}
