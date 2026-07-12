import { redirect } from 'next/navigation';
import { auth } from '../../../../../auth';
import { WhatsAppClient } from './whatsapp-client';

export default async function WhatsAppPage() {
  const session = await auth();

  if (!session?.user || session.user.role !== 'ADMIN_EMPRESA') {
    redirect('/');
  }

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="mx-auto max-w-5xl">
        <div className="mb-6">
          <h1 className="font-heading text-2xl font-bold text-slate-900">
            Configuração de WhatsApp (Z-API)
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            Configure alertas WhatsApp via Z-API para envio para números ou grupos.
          </p>
        </div>
        <WhatsAppClient />
      </div>
    </div>
  );
}
