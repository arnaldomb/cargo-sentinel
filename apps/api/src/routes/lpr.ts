import { Router, type Router as RouterType } from 'express';
import { lprQueue } from '../jobs/queue';
import { normalizeIntelbrasPayload } from '../lpr/normalize';
import { buildIdempotencyKey } from '../jobs/idempotency';

const router: RouterType = Router();

/**
 * POST /api/lpr/NotificationInfo/:action
 *
 * Intelbras LPR webhook receiver.
 *
 * LPR-02: Returns HTTP 200 IMMEDIATELY before any async work (S3/DB).
 * Cameras have short timeout windows — blocking on S3/DB would cause retries.
 *
 * LPR-03: SHA256(cameraId:placa:dateTime) is used as the BullMQ jobId.
 * BullMQ silently ignores duplicate jobIds — Layer 1 dedup at the queue.
 */
router.post('/NotificationInfo/:action', async (req, res) => {
  // Return 200 IMMEDIATELY — before any async work (LPR-02)
  res.status(200).json({ status: 'received' });

  const { action } = req.params;
  if (action !== 'vehicle') return;

  let normalized;
  try {
    normalized = normalizeIntelbrasPayload(req.body as Record<string, unknown>);
  } catch (err) {
    // V5: invalid payload — log and return (200 already sent)
    console.error('[lpr] invalid payload:', err instanceof Error ? err.message : err);
    return;
  }

  const { PlateNumber, ImageBase64, CameraId, Direction, DateTime } = normalized;

  // SHA256 idempotency key — same payload produces same jobId (LPR-03)
  const idempotencyKey = buildIdempotencyKey(CameraId, PlateNumber, DateTime);

  // Enqueue — BullMQ dedup: if jobId already exists, it is silently ignored
  await lprQueue.add(
    'process-lpr-event',
    { PlateNumber, ImageBase64, CameraId, Direction, DateTime, idempotencyKey },
    { jobId: idempotencyKey }, // Layer 1 dedup
  );
});

export default router;
