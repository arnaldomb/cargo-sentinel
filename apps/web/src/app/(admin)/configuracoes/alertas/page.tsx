import { redirect } from 'next/navigation';
import { auth } from '../../../../../auth';
import { AlertasClient } from './alertas-client';

export default async function AlertasPage() {
  const session = await auth();

  // Apenas ADMIN_EMPRESA pode gerenciar alertas (T-04-15)
  if (!session?.user || session.user.role !== 'ADMIN_EMPRESA') {
    redirect('/');
  }

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="mx-auto max-w-3xl">
        <div className="mb-6">
          <h1 className="font-heading text-2xl font-bold text-slate-900">
            Configuracao de Alertas WhatsApp
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            Configure os numeros que receberao alertas quando veiculos Suspeitos ou Criticos
            forem detectados nas suas obras.
          </p>
        </div>
        <AlertasClient />
      </div>
    </div>
  );
}
