'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

interface SuspendButtonProps {
  empresaId: string;
  status: 'ATIVO' | 'SUSPENSO';
}

export function SuspendButton({ empresaId, status }: SuspendButtonProps) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  async function handleClick() {
    setLoading(true);
    const newStatus = status === 'ATIVO' ? 'SUSPENSO' : 'ATIVO';
    try {
      const res = await fetch(
        `${process.env.NEXT_PUBLIC_API_BASE_URL}/api/admin/empresas/${empresaId}/status`,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ status: newStatus }),
        },
      );
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        alert(data.error ?? 'Erro ao atualizar status');
        return;
      }
      router.refresh();
    } finally {
      setLoading(false);
    }
  }

  return (
    <button
      onClick={handleClick}
      disabled={loading}
      className={`text-xs px-2 py-1 rounded font-medium transition-colors disabled:opacity-50 ${
        status === 'ATIVO'
          ? 'bg-red-100 text-red-700 hover:bg-red-200'
          : 'bg-green-100 text-green-700 hover:bg-green-200'
      }`}
    >
      {loading ? '...' : status === 'ATIVO' ? 'Suspender' : 'Reativar'}
    </button>
  );
}
