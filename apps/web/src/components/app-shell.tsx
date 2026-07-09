'use client';

import { useEffect, useState } from 'react';
import { Menu } from 'lucide-react';
import { Sidebar } from './sidebar';
import type { CameraStatusItem } from '@/lib/dashboard';

type AppShellProps = {
  children: React.ReactNode;
  initialCameras: CameraStatusItem[];
  userName: string;
  userRole: string;
};

export function AppShell({ children, initialCameras, userName, userRole }: AppShellProps) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [cameras, setCameras] = useState<CameraStatusItem[]>(initialCameras);

  useEffect(() => {
    let cancelled = false;
    async function refresh() {
      try {
        const res = await fetch('/api/cameras-status-proxy');
        if (res.ok && !cancelled) {
          const data = (await res.json()) as { items?: CameraStatusItem[] };
          setCameras(data.items ?? []);
        }
      } catch {
        // keep current state on error
      }
    }
    const timer = setInterval(() => { void refresh(); }, 15_000);
    return () => { cancelled = true; clearInterval(timer); };
  }, []);

  return (
    <>
      <Sidebar
        cameras={cameras}
        userName={userName}
        userRole={userRole}
        isOpen={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
      />
      <div className="flex flex-1 flex-col overflow-hidden">
        {/* Mobile hamburger strip */}
        <div className="flex items-center gap-2 border-b border-slate-200 bg-white px-4 py-2 lg:hidden">
          <button
            onClick={() => setSidebarOpen(true)}
            className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-600 hover:bg-slate-100"
            aria-label="Abrir menu lateral"
          >
            <Menu size={18} />
          </button>
        </div>
        <main className="flex flex-1 flex-col overflow-y-auto">
          {children}
        </main>
      </div>
    </>
  );
}
