import { redirect } from 'next/navigation';
import { auth } from '../../../../../../../../auth';
import { NovaCameraForm } from '../nova-camera-form';

export default async function NovaCameraPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await auth();

  if (!session?.user || session.user.role !== 'ADMIN_EMPRESA') {
    redirect('/');
  }

  const { id } = await params;

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="mx-auto max-w-3xl">
        <div className="mb-6">
          <a
            href={`/gestao/obras/${id}`}
            className="text-sm text-ggtech-blue hover:underline"
          >
            ← Voltar para a Obra
          </a>
          <h1 className="mt-2 font-heading text-2xl font-bold text-slate-900">Nova Câmera</h1>
          <p className="mt-1 text-sm text-slate-500">
            Cadastre uma câmera LPR para esta obra.
          </p>
        </div>

        <div className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
          <NovaCameraForm obraId={id} />
        </div>
      </div>
    </div>
  );
}
