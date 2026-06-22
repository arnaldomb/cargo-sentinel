import { describe, it, expect } from 'vitest';
import { normalizeIntelbrasPayload } from './normalize';

describe('normalizeIntelbrasPayload', () => {
  it('maps canonical field names (PlateNumber / ImageBase64 / CameraId / DateTime) correctly', () => {
    const raw = {
      PlateNumber: 'ABC1234',
      ImageBase64: 'base64data==',
      CameraId: 'LPR-0001',
      DateTime: '2026-06-20T14:32:00',
      Direction: 'in',
    };
    const result = normalizeIntelbrasPayload(raw);
    expect(result.PlateNumber).toBe('ABC1234');
    expect(result.ImageBase64).toBe('base64data==');
    expect(result.CameraId).toBe('LPR-0001');
    expect(result.DateTime).toBe('2026-06-20T14:32:00');
    expect(result.Direction).toBe('in');
  });

  it('maps snake_case / PicData / camera_id / EventTime variant field names to canonical shape', () => {
    const raw = {
      plate_number: 'XYZ9999',
      PicData: 'picbase64data==',
      camera_id: 'LPR-0002',
      EventTime: '2026-06-20T15:00:00',
    };
    const result = normalizeIntelbrasPayload(raw);
    expect(result.PlateNumber).toBe('XYZ9999');
    expect(result.ImageBase64).toBe('picbase64data==');
    expect(result.CameraId).toBe('LPR-0002');
    expect(result.DateTime).toBe('2026-06-20T15:00:00');
  });

  it('maps LicensePlate / picture / ChannelId / Timestamp variant field names', () => {
    const raw = {
      LicensePlate: 'DEF5678',
      picture: 'picturebase64==',
      ChannelId: 'LPR-0003',
      Timestamp: '2026-06-20T16:00:00',
    };
    const result = normalizeIntelbrasPayload(raw);
    expect(result.PlateNumber).toBe('DEF5678');
    expect(result.ImageBase64).toBe('picturebase64==');
    expect(result.CameraId).toBe('LPR-0003');
    expect(result.DateTime).toBe('2026-06-20T16:00:00');
  });

  it('maps the nested Intelbras Picture payload used by the base project', () => {
    const raw = {
      DeviceID: 'VIP-5460-LPR-IA',
      Picture: {
        SnapTime: '2026-06-20T17:00:00',
        Plate: {
          PlateNumber: 'GHI9012',
        },
        NormalPic: {
          Content: 'nestedbase64==',
        },
      },
    };
    const result = normalizeIntelbrasPayload(raw);
    expect(result.PlateNumber).toBe('GHI9012');
    expect(result.ImageBase64).toBe('nestedbase64==');
    expect(result.CameraId).toBe('VIP-5460-LPR-IA');
    expect(result.DateTime).toBe('2026-06-20T17:00:00');
  });

  it('throws when plate number is missing (V5 input validation)', () => {
    const raw = {
      ImageBase64: 'base64data==',
      CameraId: 'LPR-0001',
      DateTime: '2026-06-20T14:32:00',
    };
    expect(() => normalizeIntelbrasPayload(raw)).toThrow(
      'invalid LPR payload: missing plate or image',
    );
  });

  it('throws when image data is missing (V5 input validation)', () => {
    const raw = {
      PlateNumber: 'ABC1234',
      CameraId: 'LPR-0001',
      DateTime: '2026-06-20T14:32:00',
    };
    expect(() => normalizeIntelbrasPayload(raw)).toThrow(
      'invalid LPR payload: missing plate or image',
    );
  });

  it('throws when plate is an empty string (V5 input validation)', () => {
    const raw = {
      PlateNumber: '',
      ImageBase64: 'base64data==',
      CameraId: 'LPR-0001',
      DateTime: '2026-06-20T14:32:00',
    };
    expect(() => normalizeIntelbrasPayload(raw)).toThrow(
      'invalid LPR payload: missing plate or image',
    );
  });
});
