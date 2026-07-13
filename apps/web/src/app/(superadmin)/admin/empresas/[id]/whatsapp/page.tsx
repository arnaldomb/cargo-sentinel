import { redirect } from 'next/navigation';
import Link from 'next/link';
import { auth } from '../../../../../../../auth';
import { WhatsAppProvisionClient } from './whatsapp-provision-client';

export const metadata = {
  title: 'WhatsApp — Super Admin',
};

export default async function AdminEmpresaWhatsAppPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await auth();
  if (!session?.user || session.user.role !== 'SUPER_ADMIN') {
    redirect('/');
  }

  const { id } = await params;

  return (
    <div className="max-w-2xl mx-auto">
      <div className="mb-6 flex items-center gap-2 text-sm text-gray-500">
        <Link href="/admin" className="hover:text-ggtech-blue transition-colors">
          Empresas
        </Link>
        <span>/</span>
        <span className="text-gray-700">WhatsApp</span>
      </div>

      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
        <h1 className="text-xl font-heading font-semibold text-gray-900 mb-1">
          Provisionamento WhatsApp
        </h1>
        <p className="text-sm text-gray-500 mb-6">
          Vincule a instância WhatsApp desta empresa. O tenant não tem acesso às credenciais brutas —
          ele apenas conecta o aparelho e configura o destino dos alertas.
        </p>
        <WhatsAppProvisionClient empresaId={id} />
      </div>
    </div>
  );
}
