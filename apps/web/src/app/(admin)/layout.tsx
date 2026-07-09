import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { auth } from '../../../auth';
import { logoutAction } from '../(auth)/login/actions';
import { AppShell } from '@/components/app-shell';
import type { CameraStatusItem } from '@/lib/dashboard';

const API_BASE = process.env.INTERNAL_API_URL ?? 'http://localhost:4000';

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  if (!session?.user) redirect('/login');

  const cookieStore = await cookies();
  let initialCameras: CameraStatusItem[] = [];
  try {
    const res = await fetch(`${API_BASE}/api/cameras/status`, {
      headers: { Cookie: cookieStore.toString() },
      cache: 'no-store',
    });
    if (res.ok) {
      const data = (await res.json()) as { items?: CameraStatusItem[] };
      initialCameras = data.items ?? [];
    }
  } catch {
    // show sidebar with empty cameras rather than crash
  }

  const userName = session.user.name ?? session.user.email ?? 'Operador';
  const userRole = session.user.role;

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-gray-50">
      {/* Top bar — identical to root dashboard */}
      <header className="flex flex-shrink-0 items-center justify-between bg-ggtech-darkblue px-6 py-3 shadow-md">
        <div>
          <h1 className="font-heading text-xl font-bold text-white">Cargo Sentinel</h1>
          <p className="text-xs text-blue-200">Inteligência de perímetro logístico em tempo real</p>
        </div>
        <form action={logoutAction}>
          <button
            type="submit"
            className="rounded-lg bg-ggtech-blue px-4 py-2 text-sm font-medium text-white transition-opacity hover:opacity-90 active:opacity-75"
          >
            Sair
          </button>
        </form>
      </header>

      {/* Sidebar + main content */}
      <div className="flex flex-1 overflow-hidden">
        <AppShell initialCameras={initialCameras} userName={userName} userRole={userRole}>
          {children}
        </AppShell>
      </div>
    </div>
  );
}
