'use client';

import { useActionState } from 'react';
import { criarCamera } from '../../../actions';

type State = { error?: string } | null;

export function NovaCameraForm({ obraId }: { obraId: string }) {
  const boundAction = criarCamera.bind(null, obraId);
  const [state, action, isPending] = useActionState<State, FormData>(boundAction, null);

  return (
    <form action={action} className="space-y-4">
      {state?.error && (
        <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {state.error}
        </div>
      )}

      <div>
        <label htmlFor="codigoLpr" className="block text-sm font-medium text-slate-700">
          Código LPR <span className="text-red-500">*</span>
        </label>
        <input
          id="codigoLpr"
          name="codigoLpr"
          type="text"
          required
          placeholder="Ex: CAM-001"
          className="mt-1 block w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ggtech-blue"
        />
      </div>

      <div>
        <label htmlFor="ip" className="block text-sm font-medium text-slate-700">
          Endereço IP
        </label>
        <input
          id="ip"
          name="ip"
          type="text"
          placeholder="192.168.1.x"
          className="mt-1 block w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ggtech-blue"
        />
      </div>

      <div className="flex items-center gap-3 pt-2">
        <button
          type="submit"
          disabled={isPending}
          className="rounded-md bg-ggtech-blue px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50 transition-opacity"
        >
          {isPending ? 'Criando...' : 'Criar Câmera'}
        </button>
        <a
          href={`/gestao/obras/${obraId}`}
          className="rounded-md border border-ggtech-lightblue px-4 py-2 text-sm font-medium text-ggtech-lightblue hover:bg-slate-50 transition-colors"
        >
          Cancelar
        </a>
      </div>
    </form>
  );
}
