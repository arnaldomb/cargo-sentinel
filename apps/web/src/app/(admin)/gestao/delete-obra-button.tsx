'use client';

import { useRouter } from 'next/navigation';

export function DeleteObraButton({ obraId }: { obraId: string }) {
  const router = useRouter();

  async function handleDelete() {
    if (!confirm('Excluir esta obra? Todas as câmeras serão desativadas.')) return;
    const res = await fetch(`/api/obras-proxy/${obraId}`, { method: 'DELETE' });
    if (res.ok) router.push('/gestao');
    else alert('Erro ao excluir obra.');
  }

  return (
    <button
      onClick={handleDelete}
      className="rounded-md border border-red-300 px-3 py-1.5 text-sm text-red-600 hover:bg-red-50 transition-colors"
    >
      Excluir Obra
    </button>
  );
}
