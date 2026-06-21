'use client';

import { useEffect, useRef } from 'react';
import { getClassificationLabel, getClassificationTailwindClasses, type FeedItem } from '@/lib/dashboard';

const CLASSIFICACOES: FeedItem['classificacao'][] = [
  'LIBERADO',
  'VISITANTE',
  'ATENCAO',
  'SUSPEITO',
  'CRITICO',
];

type ClassificationPopoverProps = {
  current: FeedItem['classificacao'];
  onSelect: (classificacao: FeedItem['classificacao']) => void;
  onClose: () => void;
};

export function ClassificationPopover({ current, onSelect, onClose }: ClassificationPopoverProps) {
  const ref = useRef<HTMLDivElement>(null);

  // Close on outside click
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (ref.current && !ref.current.contains(event.target as Node)) {
        onClose();
      }
    }

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [onClose]);

  // Close on Escape key
  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  return (
    <div
      ref={ref}
      className="flex min-w-[160px] flex-col gap-1 rounded-xl border border-slate-200 bg-white p-2 shadow-lg"
      data-testid="classification-popover"
      role="menu"
      aria-label="Selecionar classificação"
    >
      {CLASSIFICACOES.map((option) => {
        const { bg, text } = getClassificationTailwindClasses(option);
        const isActive = option === current;

        return (
          <button
            key={option}
            role="menuitem"
            onClick={() => onSelect(option)}
            className={`flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-opacity hover:opacity-90 ${
              isActive ? `${bg} ${text}` : 'bg-slate-50 text-slate-700 hover:bg-slate-100'
            }`}
            data-testid={`popover-option-${option}`}
          >
            <span
              className={`h-2 w-2 flex-shrink-0 rounded-full ${bg}`}
              aria-hidden="true"
            />
            {getClassificationLabel(option)}
          </button>
        );
      })}
    </div>
  );
}
