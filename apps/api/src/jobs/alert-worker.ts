import { Worker } from 'bullmq';
import { prisma } from '@cargo-sentinel/database';
import { createRedisConnection } from '../services/redis';
import { sendAlertaWhatsApp } from '../services/whatsapp';

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

    // Busca números configurados para a obra (ALERTS-06)
    const configuracoes = await prisma.configuracaoAlerta.findMany({
      where: {
        obraId: payload.obraId,
        empresaId: payload.empresaId,
        ativo: true,
      },
      select: { telefone: true },
    });

    if (configuracoes.length === 0) {
      console.log(
        `[alert-worker] nenhum número configurado para obra ${payload.obraId}`,
      );
      return;
    }

    const mensagem = formatWhatsAppMessage(payload);

    // ALERTS-03: concorrência 1 — enviados sequencialmente por ordem do worker
    for (const config of configuracoes) {
      const result = await sendAlertaWhatsApp(config.telefone, mensagem);
      if (!result.success) {
        console.error(
          `[alert-worker] falha ao enviar WhatsApp para ${config.telefone}: ${result.error}`,
        );
        // Não relança — continua para próximos números. Falha de 1 não cancela os demais.
      } else {
        console.log(
          `[alert-worker] WhatsApp enviado para ${config.telefone} (msgId: ${result.messageId})`,
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
