'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Search } from 'lucide-react';
import { SuspendButton } from './suspend-button';
import { ImpersonateButton } from './impersonate-button';

interface EmpresaCount {
  obras: number;
  cameras: number;
  eventos: number;
}

interface Empresa {
  id: string;
  nome: string;
  cnpj: string;
  status: 'ATIVO' | 'SUSPENSO';
  createdAt: string;
  _count: EmpresaCount;
}

function formatCnpj(cnpj: string): string {
  const digits = cnpj.replace(/\D/g, '');
  if (digits.length !== 14) return cnpj;
  return digits.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5');
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
}

export function EmpresasTable({ empresas }: { empresas: Empresa[] }) {
  const [busca, setBusca] = useState('');

  const buscaNormalizada = busca.trim().toLowerCase();
  const buscaDigitos = busca.replace(/\D/g, '');

  const filtradas = empresas.filter((empresa) => {
    if (!buscaNormalizada) return true;
    const nomeMatch = empresa.nome.toLowerCase().includes(buscaNormalizada);
    const cnpjMatch = buscaDigitos.length > 0 && empresa.cnpj.replace(/\D/g, '').includes(buscaDigitos);
    return nomeMatch || cnpjMatch;
  });

  return (
    <div className="space-y-4">
      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
        <input
          className="w-full border border-gray-200 rounded-md pl-9 pr-3 py-2 text-sm"
          placeholder="Buscar por nome ou CNPJ..."
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
        />
      </div>

      {filtradas.length === 0 ? (
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-8 text-center text-gray-500">
          {empresas.length === 0
            ? 'Nenhuma empresa cadastrada.'
            : 'Nenhuma empresa encontrada para essa busca.'}
        </div>
      ) : (
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="text-left px-4 py-3 font-medium text-gray-700">Nome</th>
                <th className="text-left px-4 py-3 font-medium text-gray-700">CNPJ</th>
                <th className="text-left px-4 py-3 font-medium text-gray-700">Status</th>
                <th className="text-right px-4 py-3 font-medium text-gray-700">Obras</th>
                <th className="text-right px-4 py-3 font-medium text-gray-700">Câmeras</th>
                <th className="text-right px-4 py-3 font-medium text-gray-700">Eventos</th>
                <th className="text-left px-4 py-3 font-medium text-gray-700">Desde</th>
                <th className="text-right px-4 py-3 font-medium text-gray-700">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filtradas.map((empresa) => (
                <tr key={empresa.id} className="hover:bg-gray-50 transition-colors">
                  <td className="px-4 py-3 font-medium text-gray-900">
                    <Link
                      href={`/admin/empresas/${empresa.id}`}
                      className="hover:text-ggtech-blue transition-colors"
                    >
                      {empresa.nome}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-gray-600 font-mono text-xs">
                    {formatCnpj(empresa.cnpj)}
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                        empresa.status === 'ATIVO'
                          ? 'bg-green-100 text-green-700'
                          : 'bg-red-100 text-red-700'
                      }`}
                    >
                      {empresa.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right text-gray-700">{empresa._count.obras}</td>
                  <td className="px-4 py-3 text-right text-gray-700">{empresa._count.cameras}</td>
                  <td className="px-4 py-3 text-right text-gray-700">{empresa._count.eventos}</td>
                  <td className="px-4 py-3 text-gray-600 text-xs">{formatDate(empresa.createdAt)}</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-end gap-2">
                      <Link
                        href={`/admin/empresas/${empresa.id}?tab=whatsapp`}
                        className="text-xs px-2 py-1 rounded font-medium bg-green-100 text-green-700 hover:bg-green-200 transition-colors"
                      >
                        WhatsApp
                      </Link>
                      <SuspendButton empresaId={empresa.id} status={empresa.status} />
                      <ImpersonateButton empresaId={empresa.id} />
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
