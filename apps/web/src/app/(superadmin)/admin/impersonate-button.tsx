'use client';

import { useState } from 'react';

interface ImpersonateButtonProps {
  empresaId: string;
}

export function ImpersonateButton({ empresaId }: ImpersonateButtonProps) {
  const [loading, setLoading] = useState(false);

  async function handleClick() {
    setLoading(true);
    try {
      const res = await fetch(
        `${process.env.NEXT_PUBLIC_API_BASE_URL}/api/admin/empresas/${empresaId}/impersonate`,
        {
          method: 'POST',
          credentials: 'include',
        },
      );
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        alert(data.error ?? 'Erro ao impersonar empresa');
        return;
      }
      const { token } = await res.json();
      // Set the session cookie for the impersonated tenant (TTL 15min, path=/, SameSite=Lax)
      // Not httpOnly so Next.js client can read it
      document.cookie = `authjs.session-token=${token}; path=/; max-age=900; SameSite=Lax`;
      // Hard navigation to force new session load
      window.location.href = '/';
    } finally {
      setLoading(false);
    }
  }

  return (
    <button
      onClick={handleClick}
      disabled={loading}
      className="text-xs px-2 py-1 rounded font-medium bg-ggtech-blue text-white hover:opacity-90 transition-opacity disabled:opacity-50"
    >
      {loading ? '...' : 'Impersonar'}
    </button>
  );
}
