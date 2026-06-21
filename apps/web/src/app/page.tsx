import { redirect } from 'next/navigation';
import { DashboardClient } from '@/components/dashboard-client';
import { auth } from '../../auth';
import { logoutAction } from './(auth)/login/actions';

export default async function Home() {
  const session = await auth();

  if (!session?.user) {
    redirect('/login');
  }

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-gray-50">
      {/* Top bar */}
      <header className="flex flex-shrink-0 items-center justify-between bg-ggtech-darkblue px-6 py-3 shadow-md">
        <div>
          <h1 className="font-heading text-xl font-bold text-white">Cargo Sentinel</h1>
          <p className="text-xs text-blue-200">
            Inteligência de perímetro logístico em tempo real
          </p>
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

      {/* Body: sidebar + main — contido na altura restante */}
      <div className="flex flex-1 overflow-hidden">
        <DashboardClient
          userName={session.user.name ?? session.user.email ?? 'Operador'}
          userRole={session.user.role}
        />
      </div>
    </div>
  );
}
