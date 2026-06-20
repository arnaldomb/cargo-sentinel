import { describe, it, expect } from 'vitest';
import { buildIdempotencyKey } from './idempotency';

describe('buildIdempotencyKey', () => {
  it('returns a 64-character lowercase hex SHA256 string', () => {
    const key = buildIdempotencyKey('LPR-0001', 'ABC1234', '2026-06-20T14:32:00');
    expect(key).toHaveLength(64);
    expect(key).toMatch(/^[0-9a-f]{64}$/);
  });

  it('is deterministic — identical inputs produce identical keys', () => {
    const key1 = buildIdempotencyKey('LPR-0001', 'ABC1234', '2026-06-20T14:32:00');
    const key2 = buildIdempotencyKey('LPR-0001', 'ABC1234', '2026-06-20T14:32:00');
    expect(key1).toBe(key2);
  });

  it('produces different keys for different cameraId values', () => {
    const key1 = buildIdempotencyKey('LPR-0001', 'ABC1234', '2026-06-20T14:32:00');
    const key2 = buildIdempotencyKey('LPR-0002', 'ABC1234', '2026-06-20T14:32:00');
    expect(key1).not.toBe(key2);
  });

  it('produces different keys for different plate values', () => {
    const key1 = buildIdempotencyKey('LPR-0001', 'ABC1234', '2026-06-20T14:32:00');
    const key2 = buildIdempotencyKey('LPR-0001', 'XYZ9999', '2026-06-20T14:32:00');
    expect(key1).not.toBe(key2);
  });

  it('produces different keys for different dateTime values', () => {
    const key1 = buildIdempotencyKey('LPR-0001', 'ABC1234', '2026-06-20T14:32:00');
    const key2 = buildIdempotencyKey('LPR-0001', 'ABC1234', '2026-06-20T14:33:00');
    expect(key1).not.toBe(key2);
  });
});
