import { cookies } from 'next/headers';
import Link from 'next/link';
import { SuspendButton } from './suspend-button';
import { ImpersonateButton } from './impersonate-button';

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

function formatCnpj(cnpj: string): string {
  const digits = cnpj.replace(/\D/g, '');
  if (digits.length !== 14) return cnpj;
  return digits.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5');
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
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

      {empresas.length === 0 ? (
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-8 text-center text-gray-500">
          Nenhuma empresa cadastrada.
        </div>
      ) : (
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="text-left px-4 py-3 font-medium text-gray-700">Nome</th>
                <th className="text-left px-4 py-3 font-medium text-gray-700">CNPJ</th>
                <th className="text-left px-4 py-3 font-medium text-gray-700">Status</th>
                <th className="text-right px-4 py-3 font-medium text-gray-700">Obras</th>
                <th className="text-right px-4 py-3 font-medium text-gray-700">Câmeras</th>
                <th className="text-right px-4 py-3 font-medium text-gray-700">Eventos</th>
                <th className="text-left px-4 py-3 font-medium text-gray-700">Desde</th>
                <th className="text-right px-4 py-3 font-medium text-gray-700">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {empresas.map((empresa) => (
                <tr key={empresa.id} className="hover:bg-gray-50 transition-colors">
                  <td className="px-4 py-3 font-medium text-gray-900">{empresa.nome}</td>
                  <td className="px-4 py-3 text-gray-600 font-mono text-xs">
                    {formatCnpj(empresa.cnpj)}
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                        empresa.status === 'ATIVO'
                          ? 'bg-green-100 text-green-700'
                          : 'bg-red-100 text-red-700'
                      }`}
                    >
                      {empresa.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right text-gray-700">{empresa._count.obras}</td>
                  <td className="px-4 py-3 text-right text-gray-700">{empresa._count.cameras}</td>
                  <td className="px-4 py-3 text-right text-gray-700">{empresa._count.eventos}</td>
                  <td className="px-4 py-3 text-gray-600 text-xs">{formatDate(empresa.createdAt)}</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-end gap-2">
                      <SuspendButton empresaId={empresa.id} status={empresa.status} />
                      <ImpersonateButton empresaId={empresa.id} />
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
