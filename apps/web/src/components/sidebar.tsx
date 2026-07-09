'use client';

import { useState } from 'react';
import { usePathname } from 'next/navigation';
import Link from 'next/link';
import { X, LayoutDashboard, Bell, Search, FileText, Settings, ChevronDown, ChevronUp, ShieldAlert } from 'lucide-react';
import type { CameraStatusItem } from '@/lib/dashboard';

type SidebarProps = {
  cameras: CameraStatusItem[];
  userName: string;
  userRole: string;
  isOpen: boolean;
  onClose: () => void;
};

function navClass(active: boolean) {
  return active
    ? 'flex items-center gap-2 rounded-lg bg-ggtech-blue px-3 py-2 text-sm font-semibold text-white'
    : 'flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-blue-200 transition-colors hover:bg-white/10 hover:text-white';
}

export function Sidebar({ cameras, userName, userRole, isOpen, onClose }: SidebarProps) {
  const [camerasVisible, setCamerasVisible] = useState(true);
  const pathname = usePathname();

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

        <nav className="mb-4 flex flex-col gap-1">
          <Link href="/" className={navClass(pathname === '/')} aria-current={pathname === '/' ? 'page' : undefined}>
            <LayoutDashboard size={16} aria-hidden="true" />
            Dashboard
          </Link>

          <Link href="/buscar" className={navClass(pathname === '/buscar')} aria-current={pathname === '/buscar' ? 'page' : undefined}>
            <Search size={16} aria-hidden="true" />
            Buscar
          </Link>

          <Link href="/relatorios" className={navClass(pathname === '/relatorios')} aria-current={pathname === '/relatorios' ? 'page' : undefined}>
            <FileText size={16} aria-hidden="true" />
            Relatórios
          </Link>

          <Link href="/suspeitos" className={navClass(pathname === '/suspeitos')} aria-current={pathname === '/suspeitos' ? 'page' : undefined}>
            <ShieldAlert size={16} aria-hidden="true" />
            Suspeitos
          </Link>

          {userRole === 'ADMIN_EMPRESA' && (
            <Link href="/gestao" className={navClass(pathname.startsWith('/gestao'))} aria-current={pathname.startsWith('/gestao') ? 'page' : undefined}>
              <Settings size={16} aria-hidden="true" />
              Gestão
            </Link>
          )}

          {userRole === 'ADMIN_EMPRESA' && (
            <Link href="/configuracoes/alertas" className={navClass(pathname.startsWith('/configuracoes'))} aria-current={pathname.startsWith('/configuracoes') ? 'page' : undefined}>
              <Bell size={16} aria-hidden="true" />
              Alertas WhatsApp
            </Link>
          )}
        </nav>

        {/* Lista de câmeras */}
        <div className="flex flex-col gap-2">
          <button
            onClick={() => setCamerasVisible((v) => !v)}
            className="flex items-center justify-between rounded-md px-1 py-1 text-xs font-medium text-blue-300 hover:text-white transition-colors"
          >
            <span>Câmeras ({cameras.length})</span>
            {camerasVisible ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
          </button>

          {camerasVisible && (
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
                    <strong className="text-sm font-semibold">
                      {camera.nome ?? camera.codigoLpr}
                    </strong>
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs font-medium text-white ${
                        camera.status === 'online' ? 'bg-green-600' : 'bg-slate-500'
                      }`}
                    >
                      {camera.status}
                    </span>
                  </div>
                  {camera.nome && (
                    <div className="mt-0.5 font-mono text-xs text-blue-300">{camera.codigoLpr}</div>
                  )}
                  <div className="mt-1 text-xs text-blue-200">{camera.obra.nome}</div>
                  <div className="mt-1 text-xs text-blue-300">
                    Último sinal:{' '}
                    {camera.ultimoEventoEm
                      ? new Date(camera.ultimoEventoEm).toLocaleString('pt-BR')
                      : 'nunca'}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </aside>
    </>
  );
}
