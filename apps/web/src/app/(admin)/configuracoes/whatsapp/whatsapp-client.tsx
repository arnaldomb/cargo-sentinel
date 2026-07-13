'use client';

import { useEffect, useState } from 'react';

type Classificacao = 'LIBERADO' | 'VISITANTE' | 'ATENCAO' | 'SUSPEITO' | 'CRITICO';

type ConfiguracaoWhatsApp = {
  ativo: boolean;
  whatsappInstStatus: 'DESCONECTADO' | 'AGUARDANDO_QR' | 'CONECTADO';
  whatsappDestino?: string | null;
  whatsappGrupoJid?: string | null;
  whatsappGrupoNome?: string | null;
  classificacoesAlerta: Classificacao[];
  instanciaVinculada: boolean;
};

type ZapiGrupo = {
  id: string;
  nome: string;
};

export function WhatsAppClient() {
  const [config, setConfig] = useState<ConfiguracaoWhatsApp | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [checkingStatus, setCheckingStatus] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);
  const [testing, setTesting] = useState(false);
  const [qrCode, setQrCode] = useState<string | null>(null);
  const [grupos, setGrupos] = useState<ZapiGrupo[]>([]);
  const [loadingGrupos, setLoadingGrupos] = useState(false);
  const [ativo, setAtivo] = useState(true);
  const [whatsappDestino, setWhatsappDestino] = useState('');
  const [whatsappGrupoJid, setWhatsappGrupoJid] = useState<string | null>(null);
  const [whatsappGrupoNome, setWhatsappGrupoNome] = useState<string | null>(null);
  const [classificacoesAlerta, setClassificacoesAlerta] = useState<Classificacao[]>(['SUSPEITO', 'CRITICO']);

  function carregarConfig() {
    setLoading(true);
    return fetch('/api/configuracoes-whatsapp-proxy', { credentials: 'include' })
      .then((r) => r.json())
      .then((data: ConfiguracaoWhatsApp) => {
        setConfig(data);
        setAtivo(data.ativo);
        setWhatsappDestino(data.whatsappDestino ?? '');
        setWhatsappGrupoJid(data.whatsappGrupoJid ?? null);
        setWhatsappGrupoNome(data.whatsappGrupoNome ?? null);
        setClassificacoesAlerta(data.classificacoesAlerta);
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }

  // Carregar configuração inicial
  useEffect(() => {
    carregarConfig();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Polling automático enquanto a instância está vinculada mas ainda não conectada
  // (cobre tanto o período logo após escanear o QR quanto reload da página no meio da conexão).
  useEffect(() => {
    if (!config?.instanciaVinculada || config.whatsappInstStatus === 'CONECTADO') {
      return;
    }

    const interval = setInterval(async () => {
      try {
        const res = await fetch('/api/configuracoes-whatsapp-proxy/status', { credentials: 'include' });
        if (!res.ok) return;
        const data = await res.json();
        setConfig((prev) => (prev ? { ...prev, whatsappInstStatus: data.status } : prev));
      } catch {
        // silencioso — próxima tentativa do polling tenta de novo
      }
    }, 4000);

    return () => clearInterval(interval);
  }, [config?.instanciaVinculada, config?.whatsappInstStatus]);

  // Salvar configuração de envio
  async function handleSave() {
    setSaving(true);
    try {
      const res = await fetch('/api/configuracoes-whatsapp-proxy', {
        method: 'PUT',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ativo,
          whatsappDestino: whatsappDestino || null,
          whatsappGrupoJid: whatsappGrupoJid || null,
          whatsappGrupoNome: whatsappGrupoNome || null,
          classificacoesAlerta,
        }),
      });

      if (!res.ok) {
        const body = (await res.json()) as { error?: string };
        window.alert(body.error ?? 'Erro ao salvar configuração');
        return;
      }

      const newConfig = (await res.json()) as ConfiguracaoWhatsApp;
      setConfig(newConfig);
      window.alert('Configuração salva com sucesso!');
    } catch {
      window.alert('Erro de rede ao salvar configuração');
    } finally {
      setSaving(false);
    }
  }

  // Verificar status da instância
  async function handleCheckStatus() {
    setCheckingStatus(true);
    try {
      const res = await fetch('/api/configuracoes-whatsapp-proxy/status', {
        credentials: 'include',
      });
      if (!res.ok) {
        const body = (await res.json()) as { error?: string };
        window.alert(body.error ?? 'Erro ao verificar status');
        return;
      }
      const data = await res.json();
      if (config) {
        setConfig({ ...config, whatsappInstStatus: data.status });
      }
      window.alert(`Status da instância: ${data.status}`);
    } catch {
      window.alert('Erro de rede ao verificar status');
    } finally {
      setCheckingStatus(false);
    }
  }

  // Carregar QR code
  async function handleGetQrCode() {
    try {
      const res = await fetch('/api/configuracoes-whatsapp-proxy/qrcode', {
        credentials: 'include',
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        window.alert(data.error ?? 'Erro ao obter QR code');
        return;
      }
      setQrCode(data.qrCode ?? null);
      if (config && data.status) {
        setConfig({ ...config, whatsappInstStatus: data.status });
      }
    } catch {
      window.alert('Erro de rede ao obter QR code');
    }
  }

  // Desconectar sessão
  async function handleDisconnect() {
    setDisconnecting(true);
    try {
      const res = await fetch('/api/configuracoes-whatsapp-proxy/desconectar', {
        method: 'POST',
        credentials: 'include',
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        window.alert(data.error ?? 'Erro ao desconectar');
        return;
      }
      setQrCode(null);
      await carregarConfig();
      window.alert('Sessão desconectada.');
    } catch {
      window.alert('Erro de rede ao desconectar');
    } finally {
      setDisconnecting(false);
    }
  }

  // Testar envio
  async function handleTestar() {
    setTesting(true);
    try {
      const res = await fetch('/api/configuracoes-whatsapp-proxy/testar', {
        method: 'POST',
        credentials: 'include',
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        window.alert(data.error ?? 'Erro ao enviar mensagem de teste');
        return;
      }
      window.alert('Mensagem de teste enviada com sucesso!');
    } catch {
      window.alert('Erro de rede ao enviar mensagem de teste');
    } finally {
      setTesting(false);
    }
  }

  // Carregar grupos
  async function handleLoadGrupos() {
    setLoadingGrupos(true);
    try {
      const res = await fetch('/api/configuracoes-whatsapp-proxy/grupos', {
        credentials: 'include',
      });
      if (!res.ok) {
        const body = (await res.json()) as { error?: string };
        window.alert(body.error ?? 'Erro ao carregar grupos');
        return;
      }
      const data = await res.json();
      setGrupos(data.grupos ?? []);
    } catch {
      window.alert('Erro de rede ao carregar grupos');
    } finally {
      setLoadingGrupos(false);
    }
  }

  const handleClassificacaoToggle = (classificacao: Classificacao) => {
    setClassificacoesAlerta((prev) =>
      prev.includes(classificacao)
        ? prev.filter((c) => c !== classificacao)
        : [...prev, classificacao]
    );
  };

  const handleSelectGrupo = (grupo: ZapiGrupo) => {
    setWhatsappGrupoJid(grupo.id);
    setWhatsappGrupoNome(grupo.nome);
  };

  if (loading) {
    return <div className="max-w-2xl space-y-6">Carregando...</div>;
  }

  const instanciaVinculada = config?.instanciaVinculada ?? false;

  return (
    <div className="max-w-4xl space-y-6">
      {/* Status da instância */}
      <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="mb-4 text-sm font-semibold text-slate-700">Status da Instância</h2>
        {!instanciaVinculada ? (
          <div className="rounded-lg bg-amber-50 border border-amber-200 px-4 py-3 text-sm text-amber-700">
            Instância ainda não provisionada — solicite ao administrador da plataforma.
          </div>
        ) : (
          <div className="space-y-4">
            <div>
              <span className="text-sm text-slate-600">
                Status:{' '}
                <span
                  className={`font-medium ${config?.whatsappInstStatus === 'CONECTADO' ? 'text-green-600' : 'text-orange-600'}`}
                >
                  {config?.whatsappInstStatus}
                </span>
              </span>
              {config?.whatsappInstStatus !== 'CONECTADO' && (
                <span className="ml-2 text-xs text-slate-400">
                  Aguardando conexão... verificando automaticamente
                </span>
              )}
            </div>
            <div className="flex flex-wrap gap-3">
              <button
                onClick={handleCheckStatus}
                disabled={checkingStatus}
                className="rounded-lg bg-ggtech-blue px-4 py-2 text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-50"
              >
                {checkingStatus ? 'Verificando...' : 'Verificar Status'}
              </button>
              <button
                onClick={handleGetQrCode}
                className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-50"
              >
                Obter QR Code
              </button>
              <button
                onClick={handleDisconnect}
                disabled={disconnecting}
                className="rounded-lg border border-red-200 bg-white px-4 py-2 text-sm font-medium text-red-600 transition-colors hover:bg-red-50 disabled:opacity-50"
              >
                {disconnecting ? 'Desconectando...' : 'Desconectar'}
              </button>
            </div>
            {qrCode && (
              <div className="mt-4">
                <img src={qrCode} alt="QR Code para conectar WhatsApp" className="rounded border" />
                <p className="mt-2 text-xs text-slate-500">
                  Escaneie este QR Code com o WhatsApp do dispositivo que enviará os alertas
                </p>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Destinatários */}
      <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="mb-4 text-sm font-semibold text-slate-700">Destinatários</h2>
        <div className="space-y-4">
          <div className="flex items-center gap-3">
            <input
              type="checkbox"
              id="ativo"
              checked={ativo}
              onChange={(e) => setAtivo(e.target.checked)}
              className="h-4 w-4 rounded border-slate-300 text-ggtech-blue focus:ring-ggtech-blue"
            />
            <label htmlFor="ativo" className="text-sm text-slate-700">
              Ativar alertas WhatsApp
            </label>
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">
              Número Individual (formato: 5511999999999)
            </label>
            <input
              type="text"
              value={whatsappDestino}
              onChange={(e) => setWhatsappDestino(e.target.value)}
              placeholder="5511999999999"
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ggtech-blue"
            />
          </div>

          <div>
            <h3 className="mb-2 text-sm font-medium text-slate-700">Grupo WhatsApp</h3>
            <div className="flex gap-3 items-center mb-3">
              <button
                onClick={handleLoadGrupos}
                disabled={loadingGrupos || !instanciaVinculada}
                className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-50 disabled:opacity-50"
              >
                {loadingGrupos ? 'Carregando...' : 'Carregar Grupos'}
              </button>
              {whatsappGrupoNome && (
                <span className="text-sm text-slate-600">Grupo selecionado: {whatsappGrupoNome}</span>
              )}
            </div>

            {grupos.length > 0 && (
              <div className="max-h-40 overflow-y-auto space-y-2 border border-slate-200 rounded-lg p-2">
                {grupos.map((grupo) => (
                  <button
                    key={grupo.id}
                    onClick={() => handleSelectGrupo(grupo)}
                    className={`w-full text-left px-3 py-2 rounded text-sm ${whatsappGrupoJid === grupo.id ? 'bg-blue-50 border border-blue-200 text-blue-700' : 'hover:bg-slate-50 text-slate-700'}`}
                  >
                    {grupo.nome}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Classificações que disparam alertas */}
      <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="mb-4 text-sm font-semibold text-slate-700">Classificações de Alerta</h2>
        <div className="grid grid-cols-2 gap-3">
          {(['LIBERADO', 'VISITANTE', 'ATENCAO', 'SUSPEITO', 'CRITICO'] as Classificacao[]).map(
            (classificacao) => (
              <label key={classificacao} className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={classificacoesAlerta.includes(classificacao)}
                  onChange={() => handleClassificacaoToggle(classificacao)}
                  className="h-4 w-4 rounded border-slate-300 text-ggtech-blue focus:ring-ggtech-blue"
                />
                <span className="text-sm text-slate-700">{classificacao}</span>
              </label>
            )
          )}
        </div>
      </div>

      {/* Ações */}
      <div className="flex flex-wrap gap-3">
        <button
          onClick={handleSave}
          disabled={saving}
          className="flex-1 rounded-lg bg-ggtech-blue px-4 py-3 text-sm font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-50"
        >
          {saving ? 'Salvando...' : 'Salvar Configurações'}
        </button>
        <button
          onClick={handleTestar}
          disabled={testing || !instanciaVinculada || config?.whatsappInstStatus !== 'CONECTADO'}
          className="rounded-lg border border-slate-300 bg-white px-4 py-3 text-sm font-semibold text-slate-700 transition-colors hover:bg-slate-50 disabled:opacity-50"
        >
          {testing ? 'Enviando...' : 'Testar envio'}
        </button>
      </div>
    </div>
  );
}
