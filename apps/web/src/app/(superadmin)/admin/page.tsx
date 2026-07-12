import { cookies } from 'next/headers';
import Link from 'next/link';
import { EmpresasTable } from './empresas-table';

interface EmpresaCount {
  obras: number;
  cameras: number;
  eventos: number;
}

interface Empresa {
  id: string;
  nome: string;
  cnpj: string;
  status: 'ATIVO' | 'SUSPENSO';
  createdAt: string;
  _count: EmpresaCount;
}

async function fetchEmpresas(): Promise<Empresa[]> {
  const cookieStore = await cookies();
  const sessionCookie = cookieStore
    .getAll()
    .map((c) => `${c.name}=${c.value}`)
    .join('; ');

  const apiUrl = process.env.INTERNAL_API_URL ?? 'http://localhost:4000';
  const res = await fetch(`${apiUrl}/api/admin/empresas`, {
    headers: { cookie: sessionCookie },
    cache: 'no-store',
  });

  if (!res.ok) {
    return [];
  }

  return res.json();
}

export default async function AdminPage() {
  const empresas = await fetchEmpresas();

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-heading font-semibold text-gray-900">Empresas</h1>
        <Link
          href="/admin/empresas/nova"
          className="bg-ggtech-blue text-white px-4 py-2 rounded-md text-sm font-medium hover:opacity-90 transition-opacity"
        >
          + Nova Empresa
        </Link>
      </div>

      <EmpresasTable empresas={empresas} />
    </div>
  );
}
