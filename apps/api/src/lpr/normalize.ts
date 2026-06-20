import type { IntelbrasPayload } from '@cargo-sentinel/shared';

/**
 * Normalize an unknown Intelbras LPR webhook payload to the canonical IntelbrasPayload shape.
 *
 * Different Intelbras LPR camera models (VIP 5460, VIP 74120, VIP 99300) use different
 * field names for the same data (Pitfall 1). This layer maps all known variants.
 *
 * Throws if the plate number or image data is missing (V5 input validation / T-1-02 DoS mitigation).
 */
export function normalizeIntelbrasPayload(raw: Record<string, unknown>): IntelbrasPayload {
  // Plate number — try multiple known field name conventions
  const plate =
    (raw['PlateNumber'] as string | undefined) ??
    (raw['plate_number'] as string | undefined) ??
    (raw['LicensePlate'] as string | undefined) ??
    (raw['Plate'] as string | undefined) ??
    (raw['placa'] as string | undefined);

  // Image base64 — try multiple known field name conventions
  const image =
    (raw['ImageBase64'] as string | undefined) ??
    (raw['PicData'] as string | undefined) ??
    (raw['image_base64'] as string | undefined) ??
    (raw['picture'] as string | undefined);

  // Camera ID — try multiple known field name conventions
  const camera =
    (raw['CameraId'] as string | undefined) ??
    (raw['camera_id'] as string | undefined) ??
    (raw['ChannelId'] as string | undefined) ??
    (raw['DeviceId'] as string | undefined) ??
    '';

  // Direction — optional field
  const direction =
    (raw['Direction'] as string | undefined) ??
    (raw['direcao'] as string | undefined);

  // Timestamp — try multiple known field name conventions
  const dateTime =
    (raw['DateTime'] as string | undefined) ??
    (raw['Timestamp'] as string | undefined) ??
    (raw['EventTime'] as string | undefined) ??
    (raw['time'] as string | undefined) ??
    new Date().toISOString();

  // V5: validate required fields (plate + image) — reject before any further processing
  if (!plate || plate.trim() === '') {
    throw new Error('invalid LPR payload: missing plate or image');
  }
  if (!image || image.trim() === '') {
    throw new Error('invalid LPR payload: missing plate or image');
  }

  const normalized: IntelbrasPayload = {
    PlateNumber: plate,
    DateTime: dateTime,
    CameraId: camera,
    ImageBase64: image,
  };

  if (direction !== undefined) {
    normalized.Direction = direction;
  }

  return normalized;
}
