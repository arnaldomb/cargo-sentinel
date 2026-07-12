import { redirect } from 'next/navigation';
import { cookies } from 'next/headers';
import { auth } from '../../../../../../auth';
import { EmpresaDetailShell } from './empresa-detail-shell';

export const metadata = {
  title: 'Empresa — Super Admin',
};

interface EmpresaDetail {
  id: string;
  nome: string;
  cnpj: string;
  status: 'ATIVO' | 'SUSPENSO';
  createdAt: string;
  _count: {
    obras: number;
    cameras: number;
    eventos: number;
    users: number;
  };
}

async function fetchEmpresa(id: string): Promise<EmpresaDetail | null> {
  const cookieStore = await cookies();
  const sessionCookie = cookieStore
    .getAll()
    .map((c) => `${c.name}=${c.value}`)
    .join('; ');

  const apiUrl = process.env.INTERNAL_API_URL ?? 'http://localhost:4000';
  const res = await fetch(`${apiUrl}/api/admin/empresas/${id}`, {
    headers: { cookie: sessionCookie },
    cache: 'no-store',
  });

  if (!res.ok) return null;
  return res.json();
}

export default async function AdminEmpresaDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ tab?: string }>;
}) {
  const session = await auth();
  if (!session?.user || session.user.role !== 'SUPER_ADMIN') {
    redirect('/');
  }

  const { id } = await params;
  const { tab } = await searchParams;

  const empresa = await fetchEmpresa(id);

  if (!empresa) {
    return (
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-8 text-center text-gray-500">
        Empresa não encontrada.
      </div>
    );
  }

  const initialTab = tab === 'usuarios' || tab === 'whatsapp' ? tab : 'geral';

  return <EmpresaDetailShell empresa={empresa} empresaId={id} initialTab={initialTab} />;
}
