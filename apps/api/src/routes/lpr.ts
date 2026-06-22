import { Router, type Request, type Response, type Router as RouterType } from 'express';
import { lprQueue } from '../jobs/queue';
import { normalizeIntelbrasPayload } from '../lpr/normalize';
import { recordCameraHeartbeat } from '../lpr/heartbeat';
import { buildIdempotencyKey } from '../jobs/idempotency';

const router: RouterType = Router();
const CAMERA_HINT_TTL_MS = 30 * 60 * 1000;
const cameraHintsBySourceIp = new Map<string, { deviceId?: string; updatedAt: number }>();

function getNestedRecord(raw: Record<string, unknown>, key: string): Record<string, unknown> | null {
  const value = raw[key];
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function getString(raw: Record<string, unknown>, key: string): string | undefined {
  const value = raw[key];
  return typeof value === 'string' && value.trim() !== '' ? value : undefined;
}

function normalizeSourceIp(ip: string | undefined): string {
  if (!ip) return 'unknown';
  return ip.startsWith('::ffff:') ? ip.slice(7) : ip;
}

function rememberCameraHint(req: Request, payload: Record<string, unknown>): void {
  const sourceIp = normalizeSourceIp(req.ip);
  const deviceId = getString(payload, 'DeviceID') ?? getString(payload, 'DeviceId');
  if (!deviceId) return;

  cameraHintsBySourceIp.set(sourceIp, {
    deviceId,
    updatedAt: Date.now(),
  });
}

function inferCameraId(req: Request): string {
  const sourceIp = normalizeSourceIp(req.ip);
  const hint = cameraHintsBySourceIp.get(sourceIp);
  if (!hint) return '';
  if (Date.now() - hint.updatedAt > CAMERA_HINT_TTL_MS) {
    cameraHintsBySourceIp.delete(sourceIp);
    return '';
  }
  return hint.deviceId ?? '';
}

export function resetCameraHintCache(): void {
  cameraHintsBySourceIp.clear();
}

function getPresentKeys(raw: Record<string, unknown>, keys: string[]): string[] {
  return keys.filter((key) => {
    const value = raw[key];
    return typeof value === 'string' ? value.trim() !== '' : value !== undefined && value !== null;
  });
}

function summarizePayload(raw: Record<string, unknown>) {
  const bodyKeys = Object.keys(raw).sort();
  const picture = getNestedRecord(raw, 'Picture');
  const plate = picture ? getNestedRecord(picture, 'Plate') : null;
  const normalPic = picture ? getNestedRecord(picture, 'NormalPic') : null;
  const plateKeys = getPresentKeys(raw, [
    'PlateNumber',
    'plate_number',
    'LicensePlate',
    'Plate',
    'placa',
  ]);
  const imageKeys = getPresentKeys(raw, ['ImageBase64', 'PicData', 'image_base64', 'picture']);
  const cameraKeys = getPresentKeys(raw, ['CameraId', 'camera_id', 'ChannelId', 'DeviceId']);

  return {
    bodyKeys,
    plateKeys: plate?.PlateNumber ? [...plateKeys, 'Picture.Plate.PlateNumber'] : plateKeys,
    imageKeys: normalPic?.Content ? [...imageKeys, 'Picture.NormalPic.Content'] : imageKeys,
    cameraKeys: raw['DeviceID'] ? [...cameraKeys, 'DeviceID'] : cameraKeys,
    hasNestedObjects: bodyKeys.some((key) => {
      const value = raw[key];
      return typeof value === 'object' && value !== null;
    }),
  };
}

function shouldProcessLprAction(action: string): boolean {
  const normalizedAction = action.toLowerCase();
  return normalizedAction === 'vehicle' || normalizedAction === 'tollgateinfo';
}

async function handleNotification(req: Request, res: Response, action: string) {
  res.status(200).json({ Result: true });

  const payload = (req.body ?? {}) as Record<string, unknown>;
  rememberCameraHint(req, payload);
  if (action.toLowerCase() === 'keepalive') {
    const deviceId = getString(payload, 'DeviceID') ?? getString(payload, 'DeviceId');
    if (deviceId) recordCameraHeartbeat(deviceId);
  }
  const sourceIp = normalizeSourceIp(req.ip);
  console.error(
    '[lpr][incoming]',
    JSON.stringify({
      action,
      contentType: req.get('content-type') ?? null,
      ip: sourceIp,
      userAgent: req.get('user-agent') ?? null,
      summary: summarizePayload(payload),
    }),
  );

  if (!shouldProcessLprAction(action)) return;

  let normalized;
  try {
    normalized = normalizeIntelbrasPayload(payload);
  } catch (err) {
    // V5: invalid payload — log and return (200 already sent)
    console.error(
      '[lpr][debug] invalid payload',
      JSON.stringify({
        action,
        error: err instanceof Error ? err.message : String(err),
        ...summarizePayload(payload),
      }),
    );
    return;
  }

  const resolvedCameraId = normalized.CameraId || inferCameraId(req);
  if (!resolvedCameraId) {
    console.error(
      '[lpr][debug] missing camera mapping',
      JSON.stringify({
        action,
        ip: sourceIp,
        ...summarizePayload(payload),
      }),
    );
    return;
  }

  const { PlateNumber, ImageBase64, Direction, DateTime } = normalized;
  const idempotencyKey = buildIdempotencyKey(resolvedCameraId, PlateNumber, DateTime);

  await lprQueue.add(
    'process-lpr-event',
    {
      PlateNumber,
      ImageBase64,
      CameraId: resolvedCameraId,
      Direction,
      DateTime,
      idempotencyKey,
    },
    { jobId: idempotencyKey },
  );
}

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
router.post('/NotificationInfo/KeepAlive', async (req, res) => {
  await handleNotification(req, res, 'KeepAlive');
});

router.post('/NotificationInfo/DeviceInfo', async (req, res) => {
  await handleNotification(req, res, 'DeviceInfo');
});

router.post('/NotificationInfo/TollgateInfo', async (req, res) => {
  await handleNotification(req, res, 'TollgateInfo');
});

router.post(['/NotificationInfo', '/NotificationInfo/'], async (req, res) => {
  await handleNotification(req, res, 'NotificationInfo');
});

router.post('/NotificationInfo/:action', async (req, res) => {
  await handleNotification(req, res, req.params.action);
});

export default router;
