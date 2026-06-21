'use client';

import { useEffect, useRef, useState } from 'react';

export type CrossSiteAlertDTO = {
  empresaId: string;
  placaNumero: string;
  classificacao: 'SUSPEITO' | 'CRITICO';
  obraDetectadaId: string;
  obraDetectadaNome: string;
  obraClassificacaoId: string;
  obraClassificacaoNome: string;
  eventoId: string;
  timestamp: string;
};

type CrossSiteAlertOverlayProps = {
  alert: CrossSiteAlertDTO;
  onDismiss: () => void;
  /** Countdown duration in seconds. Default: 30. */
  countdownSeconds?: number;
};

const HEADER_BG: Record<CrossSiteAlertDTO['classificacao'], string> = {
  SUSPEITO: 'bg-orange-500',
  CRITICO: 'bg-red-700',
};

const NIVEL_LABEL: Record<CrossSiteAlertDTO['classificacao'], string> = {
  SUSPEITO: 'SUSPEITO',
  CRITICO: 'CRÍTICO',
};

export function CrossSiteAlertOverlay({
  alert,
  onDismiss,
  countdownSeconds = 30,
}: CrossSiteAlertOverlayProps) {
  const [remaining, setRemaining] = useState(countdownSeconds);
  // Track remaining in a ref to avoid stale closure in setInterval
  const remainingRef = useRef(countdownSeconds);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  // Ref to onDismiss to avoid stale closure
  const onDismissRef = useRef(onDismiss);
  useEffect(() => {
    onDismissRef.current = onDismiss;
  });

  useEffect(() => {
    remainingRef.current = countdownSeconds;
    setRemaining(countdownSeconds);

    intervalRef.current = setInterval(() => {
      const next = remainingRef.current - 1;
      remainingRef.current = next;
      setRemaining(next);
      if (next <= 0) {
        clearInterval(intervalRef.current!);
        onDismissRef.current();
      }
    }, 1000);

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [alert.eventoId, countdownSeconds]);

  const headerBg = HEADER_BG[alert.classificacao];
  const nivelLabel = NIVEL_LABEL[alert.classificacao];

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 backdrop-blur-sm"
      role="alertdialog"
      aria-modal="true"
      aria-label={`Alerta ${nivelLabel}: placa ${alert.placaNumero}`}
      data-testid="cross-site-alert-overlay"
    >
      <div className="mx-4 w-full max-w-lg overflow-hidden rounded-2xl bg-white shadow-2xl">
        {/* Header colorido por nivel */}
        <div className={`${headerBg} px-6 py-4 text-white`}>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <span className="text-2xl" aria-hidden="true">&#9888;&#65039;</span>
              <div>
                <p className="text-sm font-medium uppercase tracking-widest opacity-90">
                  Alerta Cross-Site
                </p>
                <p className="text-xl font-bold">{nivelLabel}</p>
              </div>
            </div>
            <span
              className="font-mono text-sm opacity-80"
              data-testid="countdown"
            >
              {remaining}s
            </span>
          </div>
        </div>

        {/* Corpo */}
        <div className="px-6 py-5">
          <p className="mb-4 text-3xl font-bold tracking-widest text-slate-900">
            {alert.placaNumero}
          </p>

          <dl className="space-y-3 text-sm">
            <div>
              <dt className="font-medium text-slate-500">Detectada em</dt>
              <dd className="font-semibold text-slate-900">{alert.obraDetectadaNome}</dd>
            </div>
            <div>
              <dt className="font-medium text-slate-500">Classificada originalmente em</dt>
              <dd className="font-semibold text-slate-900">{alert.obraClassificacaoNome}</dd>
            </div>
            <div>
              <dt className="font-medium text-slate-500">Horario</dt>
              <dd className="text-slate-900">
                {new Date(alert.timestamp).toLocaleString('pt-BR')}
              </dd>
            </div>
          </dl>
        </div>

        {/* Rodape */}
        <div className="border-t border-slate-100 px-6 py-4">
          <button
            onClick={onDismiss}
            className="w-full rounded-lg bg-slate-100 py-2.5 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-200 focus:outline-none focus:ring-2 focus:ring-slate-400"
            data-testid="dismiss-btn"
          >
            Dispensar
          </button>
        </div>
      </div>
    </div>
  );
}
