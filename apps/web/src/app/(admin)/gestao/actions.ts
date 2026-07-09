'use server';

import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';

const API_BASE = process.env.INTERNAL_API_URL ?? 'http://localhost:4000';

export async function criarObra(_prevState: unknown, formData: FormData) {
  const cookieStore = await cookies();
  const nome = formData.get('nome') as string;
  const endereco = formData.get('endereco') as string | null;

  if (!nome?.trim()) return { error: 'Nome é obrigatório' };

  const res = await fetch(`${API_BASE}/api/obras`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: cookieStore.toString() },
    body: JSON.stringify({ nome: nome.trim(), endereco: endereco?.trim() || undefined }),
  });

  if (!res.ok) return { error: 'Erro ao criar obra' };
  redirect('/gestao');
}

export async function criarCamera(obraId: string, _prevState: unknown, formData: FormData) {
  const cookieStore = await cookies();
  const codigoLpr = formData.get('codigoLpr') as string;
  const nome = formData.get('nome') as string | null;

  if (!codigoLpr?.trim()) return { error: 'Código LPR é obrigatório' };

  const res = await fetch(`${API_BASE}/api/obras/${obraId}/cameras`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: cookieStore.toString() },
    body: JSON.stringify({
      codigoLpr: codigoLpr.trim(),
      nome: nome?.trim() || undefined,
    }),
  });

  if (!res.ok) return { error: 'Erro ao criar câmera' };
  redirect(`/gestao/obras/${obraId}`);
}
