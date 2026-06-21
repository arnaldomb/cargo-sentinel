'use server';

import { AuthError } from 'next-auth';

export async function loginAction(_prev: unknown, formData: FormData) {
  try {
    const { signIn } = await import('../../../../auth');
    await signIn('credentials', {
      email: formData.get('email'),
      password: formData.get('password'),
      redirectTo: '/',
    });
  } catch (error) {
    if (error instanceof AuthError) {
      return { error: 'Credenciais inválidas ou empresa suspensa' };
    }
    throw error; // redirect interno do Next precisa propagar
  }
}

export async function logoutAction() {
  'use server';
  const { signOut } = await import('../../../../auth');
  await signOut({ redirectTo: '/login' });
}
