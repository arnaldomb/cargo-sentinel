import { Worker } from 'bullmq';
import { prisma } from '@cargo-sentinel/database';
import type { LprJobData } from '@cargo-sentinel/shared';
import { createRedisConnection } from '../services/redis';
import { uploadToGarage } from '../services/garage';
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
new Worker(
  'lpr-events',
  async (job) => {
    const { PlateNumber, ImageBase64, CameraId, Direction, DateTime, idempotencyKey } =
      job.data as LprJobData;

    // V4 access control: validate camera exists in DB before processing
    // empresaId sourced from DB (T-1-D2), never from payload
    const camera = await prisma.camera.findUnique({
      where: { codigoLpr: CameraId },
      include: { obra: true },
    });
    if (!camera) {
      throw new Error(`Camera not found: ${CameraId}`);
    }

    // Decode base64 image and upload to Garage (internal endpoint)
    const imageBuffer = Buffer.from(ImageBase64, 'base64');
    const garageKey = await uploadToGarage(imageBuffer, camera.id);

    // Strip image field before storing rawPayload (LPR-04: never store base64 in DB)
    const { ImageBase64: _stripped, ...rawPayloadWithoutImage } = job.data as LprJobData;

    // Upsert Evento — ON CONFLICT DO NOTHING semantics (update: {})
    await prisma.evento.upsert({
      where: { idempotencyKey },
      create: {
        placaNumero: PlateNumber,
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
  },
  {
    connection: createRedisConnection(), // SEPARATE connection from queue (Pitfall 5)
  },
);
