'use client';

import { useEffect, useState, useCallback } from 'react';
import { Loader2, MessageCircle, Power, Save, Trash2 } from 'lucide-react';

type WppInfo =
  | { vinculada: false }
  | {
      vinculada: true;
      instanceId: string;
      tokenMask: string | null;
      temClientToken: boolean;
      status: 'DESCONECTADO' | 'AGUARDANDO_QR' | 'CONECTADO';
      grupoNome: string | null;
    };

export function WhatsAppProvisionClient({ empresaId }: { empresaId: string }) {
  const [wpp, setWpp] = useState<WppInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [salvando, setSalvando] = useState(false);
  const [removendo, setRemovendo] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [form, setForm] = useState({ instanceId: '', token: '', clientToken: '' });
  const [editando, setEditando] = useState(false);

  const proxyBase = `/api/admin-whatsapp-proxy/${empresaId}`;

  const carregar = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(proxyBase, { cache: 'no-store' });
      const data = (await res.json()) as WppInfo;
      setWpp(data);
    } catch {
      setErro('Erro de rede ao carregar dados da instância.');
    } finally {
      setLoading(false);
    }
  }, [proxyBase]);

  useEffect(() => {
    carregar();
  }, [carregar]);

  async function salvarWhatsapp(e: React.FormEvent) {
    e.preventDefault();
    setSalvando(true);
    setErro(null);
    setOk(null);
    try {
      const res = await fetch(proxyBase, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          instanceId: form.instanceId,
          token: form.token,
          clientToken: form.clientToken || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setErro(data.error ?? 'Erro ao vincular instância');
        return;
      }
      setOk('Instância vinculada com sucesso!');
      setForm({ instanceId: '', token: '', clientToken: '' });
      setEditando(false);
      await carregar();
    } catch {
      setErro('Erro de rede ao vincular instância.');
    } finally {
      setSalvando(false);
    }
  }

  async function desconectarWhatsapp() {
    setRemovendo(true);
    setErro(null);
    setOk(null);
    try {
      const res = await fetch(`${proxyBase}/desconectar`, { method: 'POST' });
      const data = await res.json();
      if (!res.ok) {
        setErro(data.error ?? 'Erro ao desconectar sessão');
        return;
      }
      setOk('Sessão desconectada.');
      await carregar();
    } catch {
      setErro('Erro de rede ao desconectar sessão.');
    } finally {
      setRemovendo(false);
    }
  }

  async function removerWhatsapp() {
    if (!window.confirm('Remover o vínculo WhatsApp desta empresa? As credenciais serão apagadas.')) {
      return;
    }
    setRemovendo(true);
    setErro(null);
    setOk(null);
    try {
      const res = await fetch(proxyBase, { method: 'DELETE' });
      const data = await res.json();
      if (!res.ok) {
        setErro(data.error ?? 'Erro ao remover vínculo');
        return;
      }
      setOk('Vínculo removido.');
      await carregar();
    } catch {
      setErro('Erro de rede ao remover vínculo.');
    } finally {
      setRemovendo(false);
    }
  }

  if (loading) {
    return <div className="text-sm text-gray-500">Carregando...</div>;
  }

  return (
    <div className="space-y-4">
      {wpp?.vinculada && !editando ? (
        <div className="space-y-4">
          <div className="flex items-center justify-between pb-2 border-b border-gray-100">
            <div className="flex items-center gap-2">
              <MessageCircle className="h-4 w-4 text-green-600" />
              <h3 className="font-heading font-semibold text-gray-800">Instância vinculada</h3>
            </div>
            <span
              className={`inline-block text-xs px-2 py-0.5 rounded-full font-medium ${
                wpp.status === 'CONECTADO' ? 'bg-green-100 text-green-700' : 'bg-yellow-100 text-yellow-700'
              }`}
            >
              {wpp.status === 'CONECTADO' ? 'Conectado' : 'Aguardando conexão do cliente'}
            </span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
            <div>
              <p className="text-gray-400 text-xs">ID da instância</p>
              <p className="font-mono text-gray-800 break-all">{wpp.instanceId}</p>
            </div>
            <div>
              <p className="text-gray-400 text-xs">Token</p>
              <p className="font-mono text-gray-800">{wpp.tokenMask ?? '—'}</p>
            </div>
            <div>
              <p className="text-gray-400 text-xs">Client-Token</p>
              <p className="text-gray-800">{wpp.temClientToken ? 'Definido (do cliente)' : 'Usando o global do servidor'}</p>
            </div>
            <div>
              <p className="text-gray-400 text-xs">Grupo de alertas</p>
              <p className="text-gray-800">{wpp.grupoNome ?? 'Não selecionado pelo cliente'}</p>
            </div>
          </div>
          <p className="text-xs text-gray-400">
            O cliente conecta o aparelho e escolhe o grupo em <strong>Configurações → WhatsApp</strong> no painel dele.
          </p>
          <div className="flex flex-wrap items-center gap-3">
            {wpp.status === 'CONECTADO' && (
              <button
                onClick={desconectarWhatsapp}
                disabled={removendo}
                className="flex items-center gap-2 text-sm text-orange-600 border border-orange-200 rounded-lg px-3 py-2 hover:bg-orange-50 disabled:opacity-50"
              >
                {removendo ? <Loader2 className="h-4 w-4 animate-spin" /> : <Power className="h-4 w-4" />}
                Desconectar sessão
              </button>
            )}
            <button
              onClick={() => {
                setForm({ instanceId: wpp.instanceId, token: '', clientToken: '' });
                setErro(null);
                setOk(null);
                setEditando(true);
              }}
              className="flex items-center gap-2 text-sm text-ggtech-blue border border-ggtech-blue/30 rounded-lg px-3 py-2 hover:bg-ggtech-blue/5"
            >
              <Save className="h-4 w-4" />
              Editar credenciais
            </button>
            <button
              onClick={removerWhatsapp}
              disabled={removendo}
              className="flex items-center gap-2 text-sm text-red-500 hover:bg-red-50 rounded-lg px-3 py-2 disabled:opacity-50"
            >
              {removendo ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
              Remover vínculo
            </button>
          </div>
        </div>
      ) : (
        <form onSubmit={salvarWhatsapp} className="space-y-4">
          <div className="flex items-center gap-2 pb-2 border-b border-gray-100">
            <MessageCircle className="h-4 w-4 text-green-600" />
            <h3 className="font-heading font-semibold text-gray-800">
              {editando ? 'Editar credenciais' : 'Vincular instância'}
            </h3>
          </div>
          {editando ? (
            <p className="text-sm text-gray-500">
              As credenciais serão revalidadas ao salvar. Por segurança, informe novamente o{' '}
              <strong>Token</strong> completo (e o Client-Token, se aplicável) — eles não são pré-preenchidos.
            </p>
          ) : (
            <p className="text-sm text-gray-500">
              Crie a instância no painel do provedor e cole aqui o <strong>ID</strong> e o <strong>Token</strong> da instância.
              As credenciais são validadas antes de salvar.
            </p>
          )}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">ID da instância *</label>
            <input
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-ggtech-blue"
              required
              value={form.instanceId}
              onChange={(e) => setForm((f) => ({ ...f, instanceId: e.target.value }))}
              placeholder="3F5F7A3E92FAC19597F8…"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Token da instância *</label>
            <input
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-ggtech-blue"
              required
              value={form.token}
              onChange={(e) => setForm((f) => ({ ...f, token: e.target.value }))}
              placeholder="A101FC3F7999C9A215E3…"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Client-Token (segurança da conta)</label>
            <input
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-ggtech-blue"
              value={form.clientToken}
              onChange={(e) => setForm((f) => ({ ...f, clientToken: e.target.value }))}
              placeholder="Opcional — usa o global do servidor se vazio"
            />
          </div>
          <div className="flex items-center gap-3">
            <button
              type="submit"
              disabled={salvando}
              className="flex items-center gap-2 rounded-lg bg-ggtech-blue px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
            >
              {salvando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              {salvando ? 'Validando...' : editando ? 'Salvar credenciais' : 'Vincular instância'}
            </button>
            {editando && (
              <button
                type="button"
                onClick={() => {
                  setEditando(false);
                  setErro(null);
                  setOk(null);
                }}
                disabled={salvando}
                className="text-sm text-gray-600 hover:text-gray-800 px-3 py-2"
              >
                Cancelar
              </button>
            )}
          </div>
        </form>
      )}
      {erro && <div className="bg-red-50 border border-red-200 rounded-lg px-3 py-2 text-sm text-red-700">{erro}</div>}
      {ok && <div className="bg-green-50 border border-green-200 rounded-lg px-3 py-2 text-sm text-green-700">{ok}</div>}
    </div>
  );
}
