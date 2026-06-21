'use client';

import { useActionState } from 'react';
import { criarEmpresaAction } from './actions';

const initialState = { error: '' };

export function NovaEmpresaForm() {
  const [state, formAction, isPending] = useActionState(criarEmpresaAction, initialState);

  return (
    <form action={formAction} className="space-y-4">
      {state?.error && (
        <div className="bg-red-50 border border-red-200 rounded-md px-4 py-3 text-sm text-red-700">
          {state.error}
        </div>
      )}

      <div>
        <label htmlFor="nome" className="block text-sm font-medium text-gray-700 mb-1">
          Nome da Empresa
        </label>
        <input
          id="nome"
          name="nome"
          type="text"
          required
          minLength={2}
          className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-ggtech-blue focus:outline-none focus:ring-2 focus:ring-ggtech-blue"
          placeholder="Construtora Exemplo Ltda"
        />
      </div>

      <div>
        <label htmlFor="cnpj" className="block text-sm font-medium text-gray-700 mb-1">
          CNPJ
        </label>
        <input
          id="cnpj"
          name="cnpj"
          type="text"
          required
          className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-ggtech-blue focus:outline-none focus:ring-2 focus:ring-ggtech-blue"
          placeholder="00.000.000/0000-00"
        />
      </div>

      <hr className="border-gray-200" />
      <p className="text-sm font-medium text-gray-700">Administrador da Empresa</p>

      <div>
        <label htmlFor="adminEmail" className="block text-sm font-medium text-gray-700 mb-1">
          E-mail do Admin
        </label>
        <input
          id="adminEmail"
          name="adminEmail"
          type="email"
          required
          className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-ggtech-blue focus:outline-none focus:ring-2 focus:ring-ggtech-blue"
          placeholder="admin@empresa.com"
        />
      </div>

      <div>
        <label htmlFor="adminNome" className="block text-sm font-medium text-gray-700 mb-1">
          Nome do Admin
        </label>
        <input
          id="adminNome"
          name="adminNome"
          type="text"
          required
          minLength={2}
          className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-ggtech-blue focus:outline-none focus:ring-2 focus:ring-ggtech-blue"
          placeholder="João Silva"
        />
      </div>

      <div>
        <label htmlFor="adminSenha" className="block text-sm font-medium text-gray-700 mb-1">
          Senha
        </label>
        <input
          id="adminSenha"
          name="adminSenha"
          type="password"
          required
          minLength={8}
          className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-ggtech-blue focus:outline-none focus:ring-2 focus:ring-ggtech-blue"
          placeholder="Mínimo 8 caracteres"
        />
      </div>

      <div className="flex items-center gap-3 pt-2">
        <button
          type="submit"
          disabled={isPending}
          className="bg-ggtech-blue text-white px-5 py-2 rounded-md text-sm font-medium hover:opacity-90 transition-opacity disabled:opacity-60"
        >
          {isPending ? 'Criando...' : 'Criar Empresa'}
        </button>
        <a
          href="/admin"
          className="text-sm text-gray-600 hover:text-gray-800 transition-colors"
        >
          Cancelar
        </a>
      </div>
    </form>
  );
}
