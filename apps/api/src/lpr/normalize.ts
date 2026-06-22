import type { IntelbrasPayload } from '@cargo-sentinel/shared';

function getString(raw: Record<string, unknown>, key: string): string | undefined {
  const value = raw[key];
  return typeof value === 'string' ? value : undefined;
}

function getNestedRecord(raw: Record<string, unknown>, key: string): Record<string, unknown> | undefined {
  const value = raw[key];
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return undefined;
  return value as Record<string, unknown>;
}

/**
 * Normalize an unknown Intelbras LPR webhook payload to the canonical IntelbrasPayload shape.
 *
 * Different Intelbras LPR camera models (VIP 5460, VIP 74120, VIP 99300) use different
 * field names for the same data (Pitfall 1). This layer maps all known variants.
 *
 * Throws if the plate number or image data is missing (V5 input validation / T-1-02 DoS mitigation).
 */
export function normalizeIntelbrasPayload(raw: Record<string, unknown>): IntelbrasPayload {
  const picture = getNestedRecord(raw, 'Picture');
  const plateInfo = picture ? getNestedRecord(picture, 'Plate') : undefined;
  const normalPic = picture ? getNestedRecord(picture, 'NormalPic') : undefined;

  // Plate number — try multiple known field name conventions
  const plate =
    getString(raw, 'PlateNumber') ??
    getString(raw, 'plate_number') ??
    getString(raw, 'LicensePlate') ??
    getString(raw, 'Plate') ??
    getString(raw, 'placa') ??
    (plateInfo ? getString(plateInfo, 'PlateNumber') : undefined);

  // Image base64 — try multiple known field name conventions
  const image =
    getString(raw, 'ImageBase64') ??
    getString(raw, 'PicData') ??
    getString(raw, 'image_base64') ??
    getString(raw, 'picture') ??
    (normalPic ? getString(normalPic, 'Content') : undefined);

  // Camera ID — try multiple known field name conventions
  const camera =
    getString(raw, 'CameraId') ??
    getString(raw, 'camera_id') ??
    getString(raw, 'ChannelId') ??
    getString(raw, 'DeviceId') ??
    getString(raw, 'DeviceID') ??
    '';

  // Direction — optional field
  const direction =
    getString(raw, 'Direction') ??
    getString(raw, 'direcao') ??
    (plateInfo ? getString(plateInfo, 'Direction') : undefined);

  // Timestamp — try multiple known field name conventions
  const dateTime =
    getString(raw, 'DateTime') ??
    getString(raw, 'Timestamp') ??
    getString(raw, 'EventTime') ??
    getString(raw, 'time') ??
    (picture ? getString(picture, 'SnapTime') : undefined) ??
    (plateInfo ? getString(plateInfo, 'Time') : undefined) ??
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
