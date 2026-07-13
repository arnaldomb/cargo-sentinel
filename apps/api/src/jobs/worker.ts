import { Worker } from 'bullmq';
import { prisma } from '@cargo-sentinel/database';
import type { LprJobData } from '@cargo-sentinel/shared';
import { createRedisConnection } from '../services/redis';
import { getThumbnailProxyUrl, uploadToGarage } from '../services/garage';
import { emitCameraStatus, emitEventoNovo } from '../realtime/server';
import { alertQueue } from './queue';
import type { CrossSiteAlertPayload, WhatsAppAlertPayload } from './alert-worker';
/**
 * Resolve Direcao enum from raw direction string sent by the camera.
 * Handles both English ('in'/'out') and Portuguese ('entrada'/'saida') variants.
 */
function resolveDirection(direction: string | undefined): 'ENTRADA' | 'SAIDA' | null {
  if (!direction) return null;
  const normalized = direction.toLowerCase().trim();
  if (normalized === 'in' || normalized === 'entrada') return 'ENTRADA';
  if (normalized === 'out' || normalized === 'saida') return 'SAIDA';
  return null;
}

async function resolveCamera(cameraIdentifier: string) {
  if (!cameraIdentifier) return null;

  return prisma.camera.findUnique({
    where: { codigoLpr: cameraIdentifier },
    include: { obra: true },
  });
}

export async function processLprJob(jobData: LprJobData): Promise<void> {
  const { PlateNumber, ImageBase64, CameraId, Direction, DateTime, idempotencyKey } = jobData;

  // V4 access control: validate camera exists in DB before processing
  // empresaId sourced from DB (T-1-D2), never from payload
  const camera = await resolveCamera(CameraId);
  if (!camera) {
    console.error('[lpr][worker] camera not found', JSON.stringify({ cameraIdentifier: CameraId }));
    throw new Error(`Camera not found: ${CameraId}`);
  }

  const placa = await prisma.placa.upsert({
    where: {
      numero_empresaId: {
        numero: PlateNumber,
        empresaId: camera.empresaId,
      },
    },
    update: {},
    create: {
      numero: PlateNumber,
      empresaId: camera.empresaId,
      classificacao: 'VISITANTE',
    },
  });

  // ── INTEL-01/02: Cross-site intelligence check ───────────────────────────
  // Classificações que disparam alerta: SUSPEITO (4) ou CRITICO (5)
  const isHighRisk =
    placa.classificacao === 'SUSPEITO' || placa.classificacao === 'CRITICO';

  // INTEL-02: cross-site = placa foi classificada em OUTRA obra
  // obraClassificacaoId === null: placa nunca foi classificada manualmente — não é cross-site
  const isCrossSite =
    isHighRisk &&
    placa.obraClassificacaoId !== null &&
    placa.obraClassificacaoId !== camera.obraId;

  if (isCrossSite && placa.obraClassificacaoId) {
    // Buscar nome da obra de classificação original para o payload
    const obraClassificacao = await prisma.obra.findUnique({
      where: { id: placa.obraClassificacaoId },
      select: { id: true, nome: true },
    });

    const obraClassificacaoNome = obraClassificacao?.nome ?? 'Obra desconhecida';

    const crossSitePayload: CrossSiteAlertPayload = {
      empresaId: camera.empresaId,
      placaNumero: PlateNumber,
      classificacao: placa.classificacao as 'SUSPEITO' | 'CRITICO',
      obraDetectadaId: camera.obraId,
      obraDetectadaNome: camera.obra.nome,
      obraClassificacaoId: placa.obraClassificacaoId,
      obraClassificacaoNome,
      eventoId: idempotencyKey, // placeholder — evento ainda não criado; atualizado em Plan 04-03
      timestamp: new Date(DateTime).toISOString(),
    };

    const whatsAppPayload: WhatsAppAlertPayload = {
      empresaId: camera.empresaId,
      obraId: camera.obraId, // obra que detectou — tem ConfiguracaoAlerta
      placaNumero: PlateNumber,
      classificacao: placa.classificacao as 'SUSPEITO' | 'CRITICO',
      obraDetectadaNome: camera.obra.nome,
      obraClassificacaoNome,
      timestamp: new Date(DateTime).toISOString(),
      fotoBase64: ImageBase64 ? `data:image/jpeg;base64,${ImageBase64}` : undefined,
    };

    // Enfileira os dois jobs — alert-worker processa com concorrência 1 (ALERTS-03)
    await Promise.all([
      alertQueue.add('alert:cross-site', { type: 'alert:cross-site', payload: crossSitePayload }),
      alertQueue.add('alert:whatsapp', { type: 'alert:whatsapp', payload: whatsAppPayload }),
    ]);
  } else if (isHighRisk && !placa.obraClassificacaoId) {
    // Placa pré-cadastrada na lista de suspeitos (sem evento anterior) — emite overlay + WhatsApp
    const crossSitePayload: CrossSiteAlertPayload = {
      empresaId: camera.empresaId,
      placaNumero: PlateNumber,
      classificacao: placa.classificacao as 'SUSPEITO' | 'CRITICO',
      obraDetectadaId: camera.obraId,
      obraDetectadaNome: camera.obra.nome,
      obraClassificacaoId: 'manual',
      obraClassificacaoNome: 'Lista de Suspeitos',
      eventoId: idempotencyKey,
      timestamp: new Date(DateTime).toISOString(),
    };
    const whatsAppPayload: WhatsAppAlertPayload = {
      empresaId: camera.empresaId,
      obraId: camera.obraId,
      placaNumero: PlateNumber,
      classificacao: placa.classificacao as 'SUSPEITO' | 'CRITICO',
      obraDetectadaNome: camera.obra.nome,
      obraClassificacaoNome: 'Lista de Suspeitos',
      timestamp: new Date(DateTime).toISOString(),
      fotoBase64: ImageBase64 ? `data:image/jpeg;base64,${ImageBase64}` : undefined,
    };
    await Promise.all([
      alertQueue.add('alert:cross-site', { type: 'alert:cross-site', payload: crossSitePayload }),
      alertQueue.add('alert:whatsapp', { type: 'alert:whatsapp', payload: whatsAppPayload }),
    ]);
  }
  // ─────────────────────────────────────────────────────────────────────────

  // Decode base64 image and upload to Garage (internal endpoint)
  const imageBuffer = Buffer.from(ImageBase64, 'base64');
  const garageKey = await uploadToGarage(imageBuffer, camera.id);

  // Strip image field before storing rawPayload (LPR-04: never store base64 in DB)
  const { ImageBase64: _stripped, ...rawPayloadWithoutImage } = jobData;

  // Upsert Evento — ON CONFLICT DO NOTHING semantics (update: {})
  const evento = await prisma.evento.upsert({
    where: { idempotencyKey },
    create: {
      placaNumero: PlateNumber,
      placaId: placa.id,
      classificacao: placa.classificacao,
      direcao: resolveDirection(Direction),
      fotoGarageKey: garageKey,
      idempotencyKey,
      cameraId: camera.id,
      obraId: camera.obraId,
      empresaId: camera.empresaId, // TRUSTED DB source — never from payload
      timestamp: new Date(DateTime),
      rawPayload: rawPayloadWithoutImage,
    },
    update: {}, // do nothing on conflict — idempotent
  });

  const thumbnailUrl = garageKey ? getThumbnailProxyUrl(garageKey) : null;

  emitEventoNovo(camera.empresaId, {
    id: evento.id,
    timestamp: evento.timestamp.toISOString(),
    placaId: placa.id,
    placaNumero: evento.placaNumero,
    classificacao: evento.classificacao,
    direcao: evento.direcao,
    thumbnailUrl,
    obra: {
      id: camera.obra.id,
      nome: camera.obra.nome,
    },
    camera: {
      id: camera.id,
      codigoLpr: camera.codigoLpr,
    },
  });

  emitCameraStatus(camera.empresaId, {
    id: camera.id,
    codigoLpr: camera.codigoLpr,
    ip: camera.ip,
    obra: {
      id: camera.obra.id,
      nome: camera.obra.nome,
    },
    ultimoEventoEm: evento.timestamp.toISOString(),
    status: 'online',
  });
}

/**
 * BullMQ worker for LPR event processing.
 *
 * Uses a SEPARATE Redis connection from the queue (Pitfall 5).
 *
 * Security (T-1-D2): empresaId is resolved from the trusted DB (camera.empresaId),
 * NEVER from the webhook payload.
 *
 * Security (T-1-01 / V4): rejects events whose CameraId has no matching Camera row.
 *
 * Idempotency (LPR-03): upsert with update:{} gives ON CONFLICT DO NOTHING semantics.
 * Image never stored as base64 in DB (LPR-04 / anti-pattern from RESEARCH line 483).
 */
export const lprWorker =
  process.env.NODE_ENV === 'test'
    ? null
    : new Worker(
        'lpr-events',
        async (job) => {
          await processLprJob(job.data as LprJobData);
        },
        {
          connection: createRedisConnection(), // SEPARATE connection from queue (Pitfall 5)
        },
      );
