'use client';

import { useActionState } from 'react';
import { criarObra } from './actions';

type State = { error?: string } | null;

export function NovaObraForm() {
  const [state, action, isPending] = useActionState<State, FormData>(criarObra, null);

  return (
    <form action={action} className="space-y-4">
      {state?.error && (
        <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {state.error}
        </div>
      )}

      <div>
        <label htmlFor="nome" className="block text-sm font-medium text-slate-700">
          Nome da Obra <span className="text-red-500">*</span>
        </label>
        <input
          id="nome"
          name="nome"
          type="text"
          required
          maxLength={100}
          placeholder="Ex: Residencial Alto das Flores"
          className="mt-1 block w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ggtech-blue"
        />
      </div>

      <div>
        <label htmlFor="endereco" className="block text-sm font-medium text-slate-700">
          Endereço
        </label>
        <input
          id="endereco"
          name="endereco"
          type="text"
          maxLength={200}
          placeholder="Ex: Av. Brasil, 1234 — São Paulo, SP"
          className="mt-1 block w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ggtech-blue"
        />
      </div>

      <div className="flex items-center gap-3 pt-2">
        <button
          type="submit"
          disabled={isPending}
          className="rounded-md bg-ggtech-blue px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50 transition-opacity"
        >
          {isPending ? 'Criando...' : 'Criar Obra'}
        </button>
        <a
          href="/gestao"
          className="rounded-md border border-ggtech-lightblue px-4 py-2 text-sm font-medium text-ggtech-lightblue hover:bg-slate-50 transition-colors"
        >
          Cancelar
        </a>
      </div>
    </form>
  );
}
