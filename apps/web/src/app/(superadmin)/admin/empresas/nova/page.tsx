import Link from 'next/link';
import { NovaEmpresaForm } from './nova-empresa-form';

export const metadata = {
  title: 'Nova Empresa — Super Admin',
};

export default function NovaEmpresaPage() {
  return (
    <div className="max-w-lg mx-auto">
      <div className="mb-6 flex items-center gap-2 text-sm text-gray-500">
        <Link href="/admin" className="hover:text-ggtech-blue transition-colors">
          Empresas
        </Link>
        <span>/</span>
        <span className="text-gray-700">Nova Empresa</span>
      </div>

      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
        <h1 className="text-xl font-heading font-semibold text-gray-900 mb-6">Nova Empresa</h1>
        <NovaEmpresaForm />
      </div>
    </div>
  );
}
