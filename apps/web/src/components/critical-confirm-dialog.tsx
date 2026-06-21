'use client';

import { useEffect, useRef } from 'react';
import type { FeedItem } from '@/lib/dashboard';

type CriticalConfirmDialogProps = {
  placaNumero: string;
  classificacao: FeedItem['classificacao'];
  classificacaoLabel: string;
  onConfirm: () => void;
  onCancel: () => void;
};

export function CriticalConfirmDialog({
  placaNumero,
  classificacaoLabel,
  classificacao,
  onConfirm,
  onCancel,
}: CriticalConfirmDialogProps) {
  const cancelRef = useRef<HTMLButtonElement>(null);

  // Focus cancel button on mount for keyboard accessibility
  useEffect(() => {
    cancelRef.current?.focus();
  }, []);

  // Close on Escape
  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') onCancel();
    }
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [onCancel]);

  const isCritico = classificacao === 'CRITICO';

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby="confirm-dialog-title"
      data-testid="critical-confirm-dialog"
    >
      <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl">
        <div className="mb-4 flex items-start gap-3">
          <span
            className={`flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full text-lg font-bold text-white ${
              isCritico ? 'bg-red-700' : 'bg-orange-600'
            }`}
            aria-hidden="true"
          >
            !
          </span>
          <div>
            <h2
              id="confirm-dialog-title"
              className="font-heading text-lg font-bold text-slate-900"
            >
              Confirmar classificação {classificacaoLabel}
            </h2>
            <p className="mt-1 text-sm text-slate-600">
              Você está classificando a placa{' '}
              <strong className="font-semibold">{placaNumero}</strong> como{' '}
              <strong className="font-semibold">{classificacaoLabel}</strong>.
            </p>
          </div>
        </div>

        <div
          className={`mb-5 rounded-lg border p-3 text-sm ${
            isCritico
              ? 'border-red-200 bg-red-50 text-red-800'
              : 'border-orange-200 bg-orange-50 text-orange-800'
          }`}
        >
          <strong>Impacto operacional:</strong> Todos os operadores da empresa receberão alerta
          automático na próxima leitura desta placa em qualquer obra.
        </div>

        <div className="flex justify-end gap-3">
          <button
            ref={cancelRef}
            onClick={onCancel}
            className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-50"
            data-testid="confirm-dialog-cancel"
          >
            Cancelar
          </button>
          <button
            onClick={onConfirm}
            className={`rounded-lg px-4 py-2 text-sm font-medium text-white transition-opacity hover:opacity-90 ${
              isCritico ? 'bg-red-700' : 'bg-orange-600'
            }`}
            data-testid="confirm-dialog-confirm"
          >
            Confirmar como {classificacaoLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
