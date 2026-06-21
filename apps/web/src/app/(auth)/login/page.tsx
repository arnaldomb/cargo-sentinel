'use client';

import { useActionState } from 'react';
import { loginAction } from './actions';

const initialState = { error: '' };

export default function LoginPage() {
  const [state, formAction, isPending] = useActionState(loginAction, initialState);

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50">
      <div className="w-full max-w-md rounded-lg bg-white p-8 shadow-md">
        <h1 className="mb-6 text-center font-heading text-2xl font-semibold text-ggtech-darkblue">
          Cargo Sentinel
        </h1>
        <form action={formAction} className="space-y-4">
          <div>
            <label htmlFor="email" className="mb-1 block text-sm font-medium text-gray-700">
              E-mail
            </label>
            <input
              id="email"
              name="email"
              type="email"
              required
              autoComplete="email"
              className="w-full rounded-md border border-gray-300 px-3 py-2 focus:border-ggtech-blue focus:outline-none focus:ring-2 focus:ring-ggtech-blue"
              placeholder="seu@email.com"
            />
          </div>
          <div>
            <label htmlFor="password" className="mb-1 block text-sm font-medium text-gray-700">
              Senha
            </label>
            <input
              id="password"
              name="password"
              type="password"
              required
              autoComplete="current-password"
              className="w-full rounded-md border border-gray-300 px-3 py-2 focus:border-ggtech-blue focus:outline-none focus:ring-2 focus:ring-ggtech-blue"
              placeholder="••••••••"
            />
          </div>
          {state?.error && (
            <p className="text-center text-sm text-red-600">{state.error}</p>
          )}
          <button
            type="submit"
            disabled={isPending}
            className="w-full rounded-md bg-ggtech-blue px-4 py-2 font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-60"
          >
            {isPending ? 'Entrando...' : 'Entrar'}
          </button>
        </form>
      </div>
    </div>
  );
}
