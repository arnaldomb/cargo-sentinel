import { redirect } from 'next/navigation';
import { auth } from '../../../auth';
import { logoutAction } from '../(auth)/login/actions';

export const metadata = {
  title: 'Cargo Sentinel — Super Admin',
};

export default async function SuperAdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();

  if (!session || session.user?.role !== 'SUPER_ADMIN') {
    redirect('/');
  }

  return (
    <div className="min-h-screen flex flex-col">
      <header className="bg-ggtech-darkblue text-white px-6 py-4 flex items-center justify-between">
        <span className="font-semibold text-lg">Cargo Sentinel — Super Admin</span>
        <form
          action={logoutAction}
        >
          <button
            type="submit"
            className="text-sm bg-white/10 hover:bg-white/20 transition-colors px-3 py-1.5 rounded-md"
          >
            Sair
          </button>
        </form>
      </header>
      <main className="flex-1 bg-gray-50 p-6">{children}</main>
    </div>
  );
}
