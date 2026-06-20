import { createHash } from 'crypto';

/**
 * Build a SHA256 idempotency key from the three fields that uniquely identify
 * an LPR event. This is the Layer 1 dedup (BullMQ jobId); Layer 2 is
 * prisma.evento.upsert on this same key.
 *
 * Security (T-1-V6): uses SHA256 (Node crypto), never MD5.
 */
export function buildIdempotencyKey(cameraId: string, placa: string, dateTime: string): string {
  return createHash('sha256').update(`${cameraId}:${placa}:${dateTime}`).digest('hex');
}
