'use client';

import { X } from 'lucide-react';
import type { CameraStatusItem } from '@/lib/dashboard';

type SidebarProps = {
  cameras: CameraStatusItem[];
  userName: string;
  userRole: string;
  isOpen: boolean;
  onClose: () => void;
};

export function Sidebar({ cameras, userName, userRole, isOpen, onClose }: SidebarProps) {
  return (
    <>
      {/* Mobile overlay — fecha ao clicar fora */}
      {isOpen && (
        <div
          className="fixed inset-0 z-30 bg-black/50 lg:hidden"
          onClick={onClose}
          aria-hidden="true"
        />
      )}

      {/* Sidebar panel */}
      <aside
        className={[
          'flex flex-col overflow-y-auto bg-ggtech-darkblue p-4',
          // Mobile: drawer fixo fora da tela por padrão
          'fixed inset-y-0 left-0 z-40 w-72',
          'transition-transform duration-300 ease-in-out',
          // Desktop (lg+): sempre visível, estático no layout flex
          'lg:relative lg:flex-shrink-0 lg:translate-x-0',
          // Visibilidade no mobile controlada por isOpen
          isOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0',
        ].join(' ')}
        aria-label="Navegação lateral"
      >
        {/* Cabeçalho: título + botão fechar (apenas mobile) */}
        <div className="mb-4 flex items-center justify-between lg:block">
          <div>
            <h2 className="font-heading text-base font-semibold text-white">Câmeras LPR</h2>
            <p className="mt-1 text-xs text-blue-300">
              {userName} · {userRole}
            </p>
          </div>
          <button
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-lg text-white hover:bg-white/10 lg:hidden"
            aria-label="Fechar menu"
          >
            <X size={18} />
          </button>
        </div>

        {/* Lista de câmeras */}
        <div className="flex flex-col gap-3">
          {cameras.length === 0 && (
            <p className="text-xs text-blue-300">Nenhuma câmera registrada.</p>
          )}
          {cameras.map((camera) => (
            <div
              key={camera.id}
              className="rounded-lg bg-white/10 p-3 text-white backdrop-blur-sm"
            >
              <div className="flex items-center justify-between gap-2">
                <strong className="text-sm font-semibold">{camera.codigoLpr}</strong>
                <span
                  className={`rounded-full px-2 py-0.5 text-xs font-medium text-white ${
                    camera.status === 'online' ? 'bg-green-600' : 'bg-slate-500'
                  }`}
                >
                  {camera.status}
                </span>
              </div>
              <div className="mt-1 text-xs text-blue-200">{camera.obra.nome}</div>
              <div className="mt-1 text-xs text-blue-300">
                Último:{' '}
                {camera.ultimoEventoEm
                  ? new Date(camera.ultimoEventoEm).toLocaleString('pt-BR')
                  : 'nunca'}
              </div>
            </div>
          ))}
        </div>
      </aside>
    </>
  );
}
