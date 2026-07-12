'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Building2, Clock, CheckCircle, Users, Camera, Bell } from 'lucide-react';
import { SuspendButton } from '../../suspend-button';
import { WhatsAppProvisionClient } from './whatsapp/whatsapp-provision-client';
import { UsuariosTab } from './usuarios-tab';

interface EmpresaDetail {
  id: string;
  nome: string;
  cnpj: string;
  status: 'ATIVO' | 'SUSPENSO';
  createdAt: string;
  _count: {
    obras: number;
    cameras: number;
    eventos: number;
    users: number;
  };
}

type TabKey = 'geral' | 'usuarios' | 'whatsapp';

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

const TABS: { key: TabKey; label: string }[] = [
  { key: 'geral', label: 'Geral' },
  { key: 'usuarios', label: 'Usuários' },
  { key: 'whatsapp', label: 'WhatsApp' },
];

export function EmpresaDetailShell({
  empresa,
  empresaId,
  initialTab,
}: {
  empresa: EmpresaDetail;
  empresaId: string;
  initialTab: TabKey;
}) {
  const [tab, setTab] = useState<TabKey>(initialTab);

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2 text-sm text-gray-500">
        <Link href="/admin" className="hover:text-ggtech-blue transition-colors">
          Empresas
        </Link>
        <span>/</span>
        <span className="text-gray-700">{empresa.nome}</span>
      </div>

      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-heading font-semibold text-gray-900">{empresa.nome}</h1>
        <SuspendButton empresaId={empresaId} status={empresa.status} />
      </div>

      <div className="flex gap-1 border-b border-gray-200">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
              tab === t.key
                ? 'border-ggtech-blue text-ggtech-blue'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'geral' && (
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 space-y-6">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
            <div className="flex items-start gap-3">
              <Building2 className="h-4 w-4 text-gray-400 mt-0.5" />
              <div>
                <p className="text-gray-500 text-xs">Nome</p>
                <p className="font-medium text-gray-800">{empresa.nome}</p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <Building2 className="h-4 w-4 text-gray-400 mt-0.5" />
              <div>
                <p className="text-gray-500 text-xs">CNPJ</p>
                <p className="font-medium text-gray-800 font-mono">{formatCnpj(empresa.cnpj)}</p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <CheckCircle className="h-4 w-4 text-gray-400 mt-0.5" />
              <div>
                <p className="text-gray-500 text-xs">Status</p>
                <span
                  className={`inline-block text-xs px-2 py-0.5 rounded-full font-medium ${
                    empresa.status === 'ATIVO'
                      ? 'bg-green-100 text-green-700'
                      : 'bg-red-100 text-red-700'
                  }`}
                >
                  {empresa.status}
                </span>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <Clock className="h-4 w-4 text-gray-400 mt-0.5" />
              <div>
                <p className="text-gray-500 text-xs">Criado em</p>
                <p className="font-medium text-gray-800">{formatDate(empresa.createdAt)}</p>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 pt-4 border-t border-gray-100 text-sm">
            <div className="flex items-center gap-2">
              <Building2 className="h-4 w-4 text-gray-400" />
              <div>
                <p className="text-gray-500 text-xs">Obras</p>
                <p className="font-semibold text-gray-800">{empresa._count.obras}</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Camera className="h-4 w-4 text-gray-400" />
              <div>
                <p className="text-gray-500 text-xs">Câmeras</p>
                <p className="font-semibold text-gray-800">{empresa._count.cameras}</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Bell className="h-4 w-4 text-gray-400" />
              <div>
                <p className="text-gray-500 text-xs">Eventos</p>
                <p className="font-semibold text-gray-800">{empresa._count.eventos}</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Users className="h-4 w-4 text-gray-400" />
              <div>
                <p className="text-gray-500 text-xs">Usuários</p>
                <p className="font-semibold text-gray-800">{empresa._count.users}</p>
              </div>
            </div>
          </div>
        </div>
      )}

      {tab === 'usuarios' && <UsuariosTab empresaId={empresaId} />}

      {tab === 'whatsapp' && (
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 max-w-2xl">
          <WhatsAppProvisionClient empresaId={empresaId} />
        </div>
      )}
    </div>
  );
}
