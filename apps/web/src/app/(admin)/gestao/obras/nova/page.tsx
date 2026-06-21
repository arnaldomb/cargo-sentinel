import { redirect } from 'next/navigation';
import { auth } from '../../../../../../auth';
import { NovaObraForm } from '../../nova-obra-form';

export default async function NovaObraPage() {
  const session = await auth();

  if (!session?.user || session.user.role !== 'ADMIN_EMPRESA') {
    redirect('/');
  }

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="mx-auto max-w-3xl">
        <div className="mb-6">
          <a
            href="/gestao"
            className="text-sm text-ggtech-blue hover:underline"
          >
            ← Voltar para Gestão
          </a>
          <h1 className="mt-2 font-heading text-2xl font-bold text-slate-900">Nova Obra</h1>
          <p className="mt-1 text-sm text-slate-500">
            Preencha os dados para cadastrar uma nova obra.
          </p>
        </div>

        <div className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
          <NovaObraForm />
        </div>
      </div>
    </div>
  );
}
