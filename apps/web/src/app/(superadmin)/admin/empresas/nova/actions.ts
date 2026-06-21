'use server';

import { redirect } from 'next/navigation';
import { cookies } from 'next/headers';

export async function criarEmpresaAction(_prev: unknown, formData: FormData) {
  const cnpjRaw = (formData.get('cnpj') as string) ?? '';
  const cnpjDigits = cnpjRaw.replace(/\D/g, '');

  if (cnpjDigits.length < 14) {
    return { error: 'CNPJ inválido. Informe 14 dígitos.' };
  }

  const body = {
    nome: formData.get('nome'),
    cnpj: cnpjDigits,
    adminEmail: formData.get('adminEmail'),
    adminNome: formData.get('adminNome'),
    adminSenha: formData.get('adminSenha'),
  };

  const cookieStore = await cookies();
  const sessionCookie = cookieStore
    .getAll()
    .map((c) => `${c.name}=${c.value}`)
    .join('; ');

  const apiUrl = process.env.INTERNAL_API_URL ?? 'http://localhost:4000';
  const res = await fetch(`${apiUrl}/api/admin/empresas`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      cookie: sessionCookie,
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    return { error: (data as { error?: string }).error ?? 'Erro ao criar empresa' };
  }

  redirect('/admin');
}
