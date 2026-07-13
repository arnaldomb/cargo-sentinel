import { Worker } from 'bullmq';
import { prisma } from '@cargo-sentinel/database';
import { createRedisConnection } from '../services/redis';
import { sendWhatsAppText, sendWhatsAppImage, zapiConfigFrom } from '../infra/zapi/zapi.service';

export type CrossSiteAlertPayload = {
  empresaId: string;
  placaNumero: string;
  classificacao: 'SUSPEITO' | 'CRITICO';
  obraDetectadaId: string;
  obraDetectadaNome: string;
  obraClassificacaoId: string;
  obraClassificacaoNome: string;
  eventoId: string;
  timestamp: string;
};

export type WhatsAppAlertPayload = {
  empresaId: string;
  obraId: string;
  placaNumero: string;
  classificacao: 'SUSPEITO' | 'CRITICO';
  obraDetectadaNome: string;
  obraClassificacaoNome: string;
  timestamp: string;
  /** Data URI base64 (data:image/jpeg;base64,...) da foto do evento, se disponível. */
  fotoBase64?: string;
};

export type AlertJobData =
  | { type: 'alert:cross-site'; payload: CrossSiteAlertPayload }
  | { type: 'alert:whatsapp'; payload: WhatsAppAlertPayload };

/** TTL de dedup em segundos por nível de classificação (ALERTS-04) */
const DEDUP_TTL: Record<'SUSPEITO' | 'CRITICO', number> = {
  SUSPEITO: 300,  // 5 minutos
  CRITICO: 900,   // 15 minutos
};

/**
 * Verifica deduplicação via Redis NX+EX.
 * Retorna true se devemos enviar (primeira ocorrência na janela).
 * Retorna false se já enviamos (chave existe — janela ativa).
 */
export async function checkAndSetDedup(
  redis: import('ioredis').default,
  empresaId: string,
  placa: string,
  classificacao: 'SUSPEITO' | 'CRITICO',
): Promise<boolean> {
  const key = `alert:dedup:${empresaId}:${placa}`;
  const ttl = DEDUP_TTL[classificacao];
  // SET key value EX ttl NX — retorna "OK" se setou, null se já existia
  // ioredis exige ordem: EX antes de NX
  const result = await redis.set(key, '1', 'EX', ttl, 'NX');
  return result === 'OK';
}

/**
 * Formata mensagem WhatsApp para alert cross-site.
 * INTEL-03: deve conter placa, classificação, obra detectada, obra original.
 */
export function formatWhatsAppMessage(payload: WhatsAppAlertPayload): string {
  const nivel = payload.classificacao === 'CRITICO' ? 'CRITICO' : 'SUSPEITO';
  return (
    `⚠️ ALERTA ${nivel} — Cargo Sentinel\n\n` +
    `Placa: ${payload.placaNumero}\n` +
    `Nível: ${nivel}\n` +
    `Detectada em: ${payload.obraDetectadaNome}\n` +
    `Classificada originalmente em: ${payload.obraClassificacaoNome}\n` +
    `Horário: ${new Date(payload.timestamp).toLocaleString('pt-BR')}`
  );
}

/**
 * Processa um job de alerta.
 * Exportada para facilitar testes sem instanciar o Worker BullMQ.
 *
 * ALERTS-03: Nunca chamado diretamente do webhook — sempre via fila.
 */
export async function processAlertJob(
  data: AlertJobData,
  deps: {
    emitCrossSite: (empresaId: string, payload: CrossSiteAlertPayload) => void;
    redis: import('ioredis').default;
  },
): Promise<void> {
  if (data.type === 'alert:cross-site') {
    // Emite via Socket.IO para todos operadores da empresa (INTEL-04)
    try {
      deps.emitCrossSite(data.payload.empresaId, data.payload);
    } catch (err) {
      // Socket.IO pode não estar inicializado em testes — não falha o job
      console.warn('[alert-worker] emitCrossSite falhou (socket não iniciado?):', err);
    }
    return;
  }

  if (data.type === 'alert:whatsapp') {
    const { payload } = data;

    // ALERTS-04 + ALERTS-05: dedup Redis antes de buscar números
    const shouldSend = await checkAndSetDedup(
      deps.redis,
      payload.empresaId,
      payload.placaNumero,
      payload.classificacao,
    );

    if (!shouldSend) {
      console.log(
        `[alert-worker] dedup: pulando WhatsApp para ${payload.placaNumero} (janela ativa)`,
      );
      return;
    }

    const mensagem = formatWhatsAppMessage(payload);

    // Busca configuração Z-API da empresa
    const configWhatsApp = await prisma.configuracaoWhatsApp.findUnique({
      where: { empresaId: payload.empresaId },
    });

    if (!configWhatsApp) {
      console.log(
        `[alert-worker] WhatsApp não configurado para empresa ${payload.empresaId} — pulando envio`,
      );
      return;
    }

    if (!configWhatsApp.ativo) {
      console.log(
        `[alert-worker] alertas WhatsApp desativados para empresa ${payload.empresaId} — pulando envio`,
      );
      return;
    }

    if (configWhatsApp.whatsappInstStatus !== 'CONECTADO') {
      console.log(
        `[alert-worker] instância WhatsApp não conectada (status=${configWhatsApp.whatsappInstStatus}) para empresa ${payload.empresaId} — pulando envio da placa ${payload.placaNumero}`,
      );
      return;
    }

    const zapiCfg = zapiConfigFrom(configWhatsApp);
    if (!zapiCfg) {
      console.log(
        `[alert-worker] credenciais Z-API ausentes para empresa ${payload.empresaId} — pulando envio`,
      );
      return;
    }

    // Verifica se a classificação está na lista de alertas (ou lista vazia = todos)
    const deveEnviarClassificacao =
      configWhatsApp.classificacoesAlerta.length === 0 ||
      configWhatsApp.classificacoesAlerta.includes(payload.classificacao);

    if (!deveEnviarClassificacao) {
      console.log(
        `[alert-worker] classificação ${payload.classificacao} fora da lista de alertas configurada para empresa ${payload.empresaId} — pulando envio`,
      );
      return;
    }

    if (!configWhatsApp.whatsappDestino && !configWhatsApp.whatsappGrupoJid) {
      console.log(
        `[alert-worker] nenhum destino (número/grupo) configurado para empresa ${payload.empresaId} — pulando envio`,
      );
      return;
    }

    // Envia para número individual, se configurado
    if (configWhatsApp.whatsappDestino) {
      try {
        if (payload.fotoBase64) {
          await sendWhatsAppImage(zapiCfg, configWhatsApp.whatsappDestino, payload.fotoBase64, mensagem);
        } else {
          await sendWhatsAppText(zapiCfg, configWhatsApp.whatsappDestino, mensagem);
        }
        console.log(
          `[alert-worker] WhatsApp (Z-API) enviado para número ${configWhatsApp.whatsappDestino}`,
        );
      } catch (err) {
        console.error(
          `[alert-worker] falha ao enviar WhatsApp (Z-API) para ${configWhatsApp.whatsappDestino}:`,
          err,
        );
      }
    }
    // Envia para grupo, se configurado
    if (configWhatsApp.whatsappGrupoJid) {
      try {
        if (payload.fotoBase64) {
          await sendWhatsAppImage(zapiCfg, configWhatsApp.whatsappGrupoJid, payload.fotoBase64, mensagem);
        } else {
          await sendWhatsAppText(zapiCfg, configWhatsApp.whatsappGrupoJid, mensagem);
        }
        console.log(
          `[alert-worker] WhatsApp (Z-API) enviado para grupo ${configWhatsApp.whatsappGrupoNome}`,
        );
      } catch (err) {
        console.error(
          `[alert-worker] falha ao enviar WhatsApp (Z-API) para grupo ${configWhatsApp.whatsappGrupoJid}:`,
          err,
        );
      }
    }
  }
}

/**
 * BullMQ Worker para processamento de alertas.
 * concurrency: 1 garante ordem de entrega (ALERTS-03).
 * Não instanciado em ambiente de teste.
 */
export const alertWorker =
  process.env.NODE_ENV === 'test'
    ? null
    : new Worker(
        'alert-jobs',
        async (job) => {
          const { emitAlertaCrossSite } = await import('../realtime/server');
          const redis = createRedisConnection();

          try {
            await processAlertJob(job.data as AlertJobData, {
              emitCrossSite: emitAlertaCrossSite,
              redis,
            });
          } finally {
            await redis.quit();
          }
        },
        {
          connection: createRedisConnection(),
          concurrency: 1, // ALERTS-03: nunca paralelo
        },
      );
