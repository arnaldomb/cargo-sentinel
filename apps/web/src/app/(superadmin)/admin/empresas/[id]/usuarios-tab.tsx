'use client';

import { useEffect, useState, useCallback } from 'react';
import { Plus, X, Save, Loader2, KeyRound, Power, User } from 'lucide-react';

type Role = 'SUPER_ADMIN' | 'ADMIN_EMPRESA' | 'OPERADOR';

interface Usuario {
  id: string;
  nome: string;
  email: string;
  role: Role;
  ativo: boolean;
  createdAt: string;
}

const ROLE_LABEL: Record<Role, string> = {
  SUPER_ADMIN: 'Super Admin',
  ADMIN_EMPRESA: 'Admin Empresa',
  OPERADOR: 'Operador',
};

export function UsuariosTab({ empresaId }: { empresaId: string }) {
  const [usuarios, setUsuarios] = useState<Usuario[]>([]);
  const [loading, setLoading] = useState(true);
  const [acaoUsuario, setAcaoUsuario] = useState<string | null>(null);

  const [modalUsuario, setModalUsuario] = useState(false);
  const [formUsuario, setFormUsuario] = useState({
    nome: '',
    email: '',
    senha: '',
    role: 'OPERADOR' as 'ADMIN_EMPRESA' | 'OPERADOR',
  });
  const [salvandoUsuario, setSalvandoUsuario] = useState(false);
  const [erroUsuario, setErroUsuario] = useState('');

  const [resetando, setResetando] = useState<Usuario | null>(null);
  const [novaSenha, setNovaSenha] = useState('');

  const proxyBase = `/api/admin-usuarios-proxy/${empresaId}`;

  const loadUsuarios = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(proxyBase, { cache: 'no-store' });
      const data = await res.json().catch(() => []);
      setUsuarios(Array.isArray(data) ? data : []);
    } finally {
      setLoading(false);
    }
  }, [proxyBase]);

  useEffect(() => {
    loadUsuarios();
  }, [loadUsuarios]);

  async function criarUsuario(e: React.FormEvent) {
    e.preventDefault();
    setSalvandoUsuario(true);
    setErroUsuario('');
    try {
      const res = await fetch(proxyBase, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formUsuario),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(body?.error ?? `Erro ${res.status}`);
      }
      setModalUsuario(false);
      setFormUsuario({ nome: '', email: '', senha: '', role: 'OPERADOR' });
      await loadUsuarios();
    } catch (err) {
      setErroUsuario(String(err instanceof Error ? err.message : err));
    } finally {
      setSalvandoUsuario(false);
    }
  }

  async function alterarUsuario(u: Usuario, data: { role?: Role; ativo?: boolean }) {
    setAcaoUsuario(u.id);
    try {
      const res = await fetch(`${proxyBase}/${u.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        alert(body?.error ?? `Erro ${res.status}`);
        return;
      }
      await loadUsuarios();
    } finally {
      setAcaoUsuario(null);
    }
  }

  async function resetarSenha(e: React.FormEvent) {
    e.preventDefault();
    if (!resetando) return;
    setSalvandoUsuario(true);
    setErroUsuario('');
    try {
      const res = await fetch(`${proxyBase}/${resetando.id}/resetar-senha`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ senha: novaSenha }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(body?.error ?? `Erro ${res.status}`);
      }
      setResetando(null);
      setNovaSenha('');
    } catch (err) {
      setErroUsuario(String(err instanceof Error ? err.message : err));
    } finally {
      setSalvandoUsuario(false);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-48">
        <Loader2 className="h-8 w-8 animate-spin text-ggtech-blue" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <button
          onClick={() => {
            setFormUsuario({ nome: '', email: '', senha: '', role: 'OPERADOR' });
            setErroUsuario('');
            setModalUsuario(true);
          }}
          className="bg-ggtech-blue text-white px-4 py-2 rounded-md text-sm font-medium hover:opacity-90 transition-opacity flex items-center gap-2"
        >
          <Plus className="h-4 w-4" /> Novo usuário
        </button>
      </div>

      <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
        {usuarios.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-gray-400 gap-2">
            <User className="h-10 w-10 text-gray-200" />
            <p className="text-sm">Nenhum usuário cadastrado nesta empresa</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr className="text-left text-xs text-gray-500 uppercase tracking-wider">
                  <th className="px-4 py-3">Nome</th>
                  <th className="px-4 py-3">Email</th>
                  <th className="px-4 py-3">Papel</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Criado em</th>
                  <th className="px-4 py-3 text-right">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {usuarios.map((u) => (
                  <tr key={u.id} className="hover:bg-gray-50/50">
                    <td className="px-4 py-3 font-medium text-gray-900">
                      <span className="inline-flex items-center gap-2">
                        <User className="h-3.5 w-3.5 text-gray-300" /> {u.nome}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-gray-500">{u.email}</td>
                    <td className="px-4 py-3">
                      {u.role === 'SUPER_ADMIN' ? (
                        <span className="text-xs text-gray-500">{ROLE_LABEL[u.role]}</span>
                      ) : (
                        <select
                          className="border border-gray-200 rounded-md px-2 py-1 text-xs w-32"
                          value={u.role}
                          disabled={acaoUsuario === u.id}
                          onChange={(e) => alterarUsuario(u, { role: e.target.value as Role })}
                        >
                          <option value="ADMIN_EMPRESA">Admin Empresa</option>
                          <option value="OPERADOR">Operador</option>
                        </select>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`inline-block text-xs px-2 py-0.5 rounded-full font-medium ${
                          u.ativo ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'
                        }`}
                      >
                        {u.ativo ? 'Ativo' : 'Inativo'}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-gray-500 text-xs">
                      {new Date(u.createdAt).toLocaleDateString('pt-BR')}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex justify-end gap-1">
                        <button
                          onClick={() => {
                            setResetando(u);
                            setNovaSenha('');
                            setErroUsuario('');
                          }}
                          className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-ggtech-blue transition-colors"
                          title="Resetar senha"
                        >
                          <KeyRound className="h-3.5 w-3.5" />
                        </button>
                        {u.role !== 'SUPER_ADMIN' && (
                          <button
                            onClick={() => alterarUsuario(u, { ativo: !u.ativo })}
                            disabled={acaoUsuario === u.id}
                            className={`p-1.5 rounded-lg transition-colors ${
                              u.ativo
                                ? 'hover:bg-red-50 text-gray-400 hover:text-red-500'
                                : 'hover:bg-green-50 text-gray-400 hover:text-green-600'
                            }`}
                            title={u.ativo ? 'Desativar usuário' : 'Reativar usuário'}
                          >
                            {acaoUsuario === u.id ? (
                              <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            ) : (
                              <Power className="h-3.5 w-3.5" />
                            )}
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {modalUsuario && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
            <div className="flex items-center justify-between px-6 pt-6 pb-4 border-b border-gray-100">
              <h2 className="font-heading font-semibold text-gray-800">Novo usuário</h2>
              <button
                onClick={() => setModalUsuario(false)}
                className="p-1 rounded-lg hover:bg-gray-100 text-gray-400"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <form onSubmit={criarUsuario} className="p-6 space-y-4">
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Nome *</label>
                <input
                  className="w-full border border-gray-200 rounded-md px-3 py-2 text-sm"
                  required
                  value={formUsuario.nome}
                  onChange={(e) => setFormUsuario((f) => ({ ...f, nome: e.target.value }))}
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Email *</label>
                <input
                  type="email"
                  className="w-full border border-gray-200 rounded-md px-3 py-2 text-sm"
                  required
                  value={formUsuario.email}
                  onChange={(e) => setFormUsuario((f) => ({ ...f, email: e.target.value }))}
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">
                  Senha * (mín. 8 caracteres)
                </label>
                <input
                  type="password"
                  className="w-full border border-gray-200 rounded-md px-3 py-2 text-sm"
                  required
                  minLength={8}
                  value={formUsuario.senha}
                  onChange={(e) => setFormUsuario((f) => ({ ...f, senha: e.target.value }))}
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Papel *</label>
                <select
                  className="w-full border border-gray-200 rounded-md px-3 py-2 text-sm"
                  value={formUsuario.role}
                  onChange={(e) =>
                    setFormUsuario((f) => ({
                      ...f,
                      role: e.target.value as 'ADMIN_EMPRESA' | 'OPERADOR',
                    }))
                  }
                >
                  <option value="ADMIN_EMPRESA">Admin Empresa</option>
                  <option value="OPERADOR">Operador</option>
                </select>
              </div>
              {erroUsuario && (
                <div className="bg-red-50 border border-red-200 rounded-lg px-3 py-2 text-sm text-red-700">
                  {erroUsuario}
                </div>
              )}
              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setModalUsuario(false)}
                  className="flex-1 px-4 py-2 rounded-md text-sm font-medium text-gray-600 border border-gray-200 hover:bg-gray-50"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={salvandoUsuario}
                  className="flex-1 bg-ggtech-blue text-white px-4 py-2 rounded-md text-sm font-medium hover:opacity-90 disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {salvandoUsuario ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Save className="h-4 w-4" />
                  )}
                  {salvandoUsuario ? 'Criando...' : 'Criar usuário'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {resetando && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
            <div className="flex items-center justify-between px-6 pt-6 pb-4 border-b border-gray-100">
              <h2 className="font-heading font-semibold text-gray-800">
                Resetar senha — {resetando.nome}
              </h2>
              <button
                onClick={() => setResetando(null)}
                className="p-1 rounded-lg hover:bg-gray-100 text-gray-400"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <form onSubmit={resetarSenha} className="p-6 space-y-4">
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">
                  Nova senha * (mín. 8 caracteres)
                </label>
                <input
                  type="password"
                  className="w-full border border-gray-200 rounded-md px-3 py-2 text-sm"
                  required
                  minLength={8}
                  value={novaSenha}
                  onChange={(e) => setNovaSenha(e.target.value)}
                  autoFocus
                />
              </div>
              {erroUsuario && (
                <div className="bg-red-50 border border-red-200 rounded-lg px-3 py-2 text-sm text-red-700">
                  {erroUsuario}
                </div>
              )}
              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setResetando(null)}
                  className="flex-1 px-4 py-2 rounded-md text-sm font-medium text-gray-600 border border-gray-200 hover:bg-gray-50"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={salvandoUsuario}
                  className="flex-1 bg-ggtech-blue text-white px-4 py-2 rounded-md text-sm font-medium hover:opacity-90 disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {salvandoUsuario ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <KeyRound className="h-4 w-4" />
                  )}
                  {salvandoUsuario ? 'Salvando...' : 'Definir nova senha'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
