'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  Building2,
  Clock,
  CheckCircle,
  Users,
  Camera,
  Bell,
  Pencil,
  Save,
  X,
  Loader2,
  Trash2,
} from 'lucide-react';
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
  const router = useRouter();
  const [tab, setTab] = useState<TabKey>(initialTab);

  const [empresaAtual, setEmpresaAtual] = useState(empresa);
  const [editando, setEditando] = useState(false);
  const [formEdicao, setFormEdicao] = useState({ nome: empresaAtual.nome, cnpj: empresaAtual.cnpj });
  const [salvandoEdicao, setSalvandoEdicao] = useState(false);
  const [erroEdicao, setErroEdicao] = useState('');

  const [modalExcluir, setModalExcluir] = useState(false);
  const [confirmacaoNome, setConfirmacaoNome] = useState('');
  const [excluindo, setExcluindo] = useState(false);
  const [erroExclusao, setErroExclusao] = useState('');

  function iniciarEdicao() {
    setFormEdicao({ nome: empresaAtual.nome, cnpj: empresaAtual.cnpj });
    setErroEdicao('');
    setEditando(true);
  }

  async function salvarEdicao(e: React.FormEvent) {
    e.preventDefault();
    setSalvandoEdicao(true);
    setErroEdicao('');
    try {
      const res = await fetch(`/api/admin-empresa-proxy/${empresaId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formEdicao),
      });
      const body = await res.json().catch(() => null);
      if (!res.ok) {
        throw new Error(body?.error ?? `Erro ${res.status}`);
      }
      setEmpresaAtual((prev) => ({ ...prev, nome: body.nome, cnpj: body.cnpj }));
      setEditando(false);
      router.refresh();
    } catch (err) {
      setErroEdicao(String(err instanceof Error ? err.message : err));
    } finally {
      setSalvandoEdicao(false);
    }
  }

  async function excluirEmpresa() {
    setExcluindo(true);
    setErroExclusao('');
    try {
      const res = await fetch(`/api/admin-empresa-proxy/${empresaId}`, { method: 'DELETE' });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(body?.error ?? `Erro ${res.status}`);
      }
      router.push('/admin');
    } catch (err) {
      setErroExclusao(String(err instanceof Error ? err.message : err));
      setExcluindo(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2 text-sm text-gray-500">
        <Link href="/admin" className="hover:text-ggtech-blue transition-colors">
          Empresas
        </Link>
        <span>/</span>
        <span className="text-gray-700">{empresaAtual.nome}</span>
      </div>

      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-heading font-semibold text-gray-900">{empresaAtual.nome}</h1>
        <SuspendButton empresaId={empresaId} status={empresaAtual.status} />
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
          {editando ? (
            <form onSubmit={salvarEdicao} className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">Nome *</label>
                  <input
                    className="w-full border border-gray-200 rounded-md px-3 py-2 text-sm"
                    required
                    value={formEdicao.nome}
                    onChange={(e) => setFormEdicao((f) => ({ ...f, nome: e.target.value }))}
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">CNPJ *</label>
                  <input
                    className="w-full border border-gray-200 rounded-md px-3 py-2 text-sm font-mono"
                    required
                    value={formEdicao.cnpj}
                    onChange={(e) => setFormEdicao((f) => ({ ...f, cnpj: e.target.value }))}
                  />
                </div>
              </div>
              {erroEdicao && (
                <div className="bg-red-50 border border-red-200 rounded-lg px-3 py-2 text-sm text-red-700">
                  {erroEdicao}
                </div>
              )}
              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={() => setEditando(false)}
                  className="px-4 py-2 rounded-md text-sm font-medium text-gray-600 border border-gray-200 hover:bg-gray-50 flex items-center gap-2"
                >
                  <X className="h-4 w-4" /> Cancelar
                </button>
                <button
                  type="submit"
                  disabled={salvandoEdicao}
                  className="px-4 py-2 rounded-md text-sm font-medium bg-ggtech-blue text-white hover:opacity-90 disabled:opacity-50 flex items-center gap-2"
                >
                  {salvandoEdicao ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Save className="h-4 w-4" />
                  )}
                  {salvandoEdicao ? 'Salvando...' : 'Salvar'}
                </button>
              </div>
            </form>
          ) : (
            <>
              <div className="flex justify-end">
                <button
                  onClick={iniciarEdicao}
                  className="px-3 py-1.5 rounded-md text-xs font-medium text-gray-600 border border-gray-200 hover:bg-gray-50 flex items-center gap-2"
                >
                  <Pencil className="h-3.5 w-3.5" /> Editar
                </button>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
                <div className="flex items-start gap-3">
                  <Building2 className="h-4 w-4 text-gray-400 mt-0.5" />
                  <div>
                    <p className="text-gray-500 text-xs">Nome</p>
                    <p className="font-medium text-gray-800">{empresaAtual.nome}</p>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <Building2 className="h-4 w-4 text-gray-400 mt-0.5" />
                  <div>
                    <p className="text-gray-500 text-xs">CNPJ</p>
                    <p className="font-medium text-gray-800 font-mono">
                      {formatCnpj(empresaAtual.cnpj)}
                    </p>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <CheckCircle className="h-4 w-4 text-gray-400 mt-0.5" />
                  <div>
                    <p className="text-gray-500 text-xs">Status</p>
                    <span
                      className={`inline-block text-xs px-2 py-0.5 rounded-full font-medium ${
                        empresaAtual.status === 'ATIVO'
                          ? 'bg-green-100 text-green-700'
                          : 'bg-red-100 text-red-700'
                      }`}
                    >
                      {empresaAtual.status}
                    </span>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <Clock className="h-4 w-4 text-gray-400 mt-0.5" />
                  <div>
                    <p className="text-gray-500 text-xs">Criado em</p>
                    <p className="font-medium text-gray-800">{formatDate(empresaAtual.createdAt)}</p>
                  </div>
                </div>
              </div>
            </>
          )}

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 pt-4 border-t border-gray-100 text-sm">
            <div className="flex items-center gap-2">
              <Building2 className="h-4 w-4 text-gray-400" />
              <div>
                <p className="text-gray-500 text-xs">Obras</p>
                <p className="font-semibold text-gray-800">{empresaAtual._count.obras}</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Camera className="h-4 w-4 text-gray-400" />
              <div>
                <p className="text-gray-500 text-xs">Câmeras</p>
                <p className="font-semibold text-gray-800">{empresaAtual._count.cameras}</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Bell className="h-4 w-4 text-gray-400" />
              <div>
                <p className="text-gray-500 text-xs">Eventos</p>
                <p className="font-semibold text-gray-800">{empresaAtual._count.eventos}</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Users className="h-4 w-4 text-gray-400" />
              <div>
                <p className="text-gray-500 text-xs">Usuários</p>
                <p className="font-semibold text-gray-800">{empresaAtual._count.users}</p>
              </div>
            </div>
          </div>

          <div className="pt-4 border-t border-gray-100 flex justify-end">
            <button
              onClick={() => {
                setConfirmacaoNome('');
                setErroExclusao('');
                setModalExcluir(true);
              }}
              className="px-3 py-1.5 rounded-md text-xs font-medium text-red-600 border border-red-200 hover:bg-red-50 flex items-center gap-2"
            >
              <Trash2 className="h-3.5 w-3.5" /> Excluir empresa
            </button>
          </div>
        </div>
      )}

      {tab === 'usuarios' && <UsuariosTab empresaId={empresaId} />}

      {tab === 'whatsapp' && (
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 max-w-2xl">
          <WhatsAppProvisionClient empresaId={empresaId} />
        </div>
      )}

      {modalExcluir && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
            <div className="flex items-center justify-between px-6 pt-6 pb-4 border-b border-gray-100">
              <h2 className="font-heading font-semibold text-gray-800">Excluir empresa</h2>
              <button
                onClick={() => setModalExcluir(false)}
                className="p-1 rounded-lg hover:bg-gray-100 text-gray-400"
                disabled={excluindo}
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="p-6 space-y-4">
              <p className="text-sm text-gray-600">
                Esta ação é <span className="font-semibold text-red-600">irreversível</span> e vai
                apagar obras, câmeras, eventos, placas, histórico, usuários, configuração de
                WhatsApp e relatórios da empresa <span className="font-semibold">{empresaAtual.nome}</span>.
                Para confirmar, digite o nome exato da empresa abaixo.
              </p>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">
                  Nome da empresa
                </label>
                <input
                  className="w-full border border-gray-200 rounded-md px-3 py-2 text-sm"
                  value={confirmacaoNome}
                  onChange={(e) => setConfirmacaoNome(e.target.value)}
                  autoFocus
                />
              </div>
              {erroExclusao && (
                <div className="bg-red-50 border border-red-200 rounded-lg px-3 py-2 text-sm text-red-700">
                  {erroExclusao}
                </div>
              )}
              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setModalExcluir(false)}
                  disabled={excluindo}
                  className="flex-1 px-4 py-2 rounded-md text-sm font-medium text-gray-600 border border-gray-200 hover:bg-gray-50"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={excluirEmpresa}
                  disabled={excluindo || confirmacaoNome !== empresaAtual.nome}
                  className="flex-1 bg-red-600 text-white px-4 py-2 rounded-md text-sm font-medium hover:opacity-90 disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {excluindo ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Trash2 className="h-4 w-4" />
                  )}
                  {excluindo ? 'Excluindo...' : 'Excluir empresa'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
