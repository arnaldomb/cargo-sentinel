import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';

// Mock the queue module BEFORE importing the app (vi.mock is hoisted)
vi.mock('../jobs/queue', () => ({
  lprQueue: {
    add: vi.fn().mockResolvedValue({ id: 'mocked-job-id' }),
  },
}));

// Import after mock is in place
import { app } from '../index';
import { lprQueue } from '../jobs/queue';
import { buildIdempotencyKey } from '../jobs/idempotency';

const validPayload = {
  PlateNumber: 'ABC1234',
  ImageBase64: 'aGVsbG8=', // 'hello' in base64
  CameraId: 'LPR-0001',
  DateTime: '2026-06-20T14:32:00',
  Direction: 'in',
};

describe('POST /api/lpr/NotificationInfo/vehicle', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns HTTP 200 immediately with { status: "received" }', async () => {
    const response = await request(app)
      .post('/api/lpr/NotificationInfo/vehicle')
      .send(validPayload)
      .set('Content-Type', 'application/json');

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ status: 'received' });
  });

  it('calls lprQueue.add with the SHA256 idempotencyKey as the BullMQ jobId', async () => {
    await request(app)
      .post('/api/lpr/NotificationInfo/vehicle')
      .send(validPayload)
      .set('Content-Type', 'application/json');

    const expectedKey = buildIdempotencyKey(
      validPayload.CameraId,
      validPayload.PlateNumber,
      validPayload.DateTime,
    );

    expect(lprQueue.add).toHaveBeenCalledOnce();
    const [, , options] = (lprQueue.add as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(options).toMatchObject({ jobId: expectedKey });
  });

  it('two identical POSTs both return 200 and call queue.add with the SAME jobId (Layer 1 dedup)', async () => {
    await request(app)
      .post('/api/lpr/NotificationInfo/vehicle')
      .send(validPayload)
      .set('Content-Type', 'application/json');

    await request(app)
      .post('/api/lpr/NotificationInfo/vehicle')
      .send(validPayload)
      .set('Content-Type', 'application/json');

    expect(lprQueue.add).toHaveBeenCalledTimes(2);

    const jobId1 = (lprQueue.add as ReturnType<typeof vi.fn>).mock.calls[0][2].jobId;
    const jobId2 = (lprQueue.add as ReturnType<typeof vi.fn>).mock.calls[1][2].jobId;
    expect(jobId1).toBe(jobId2);
    // Verify the jobId matches the expected SHA256
    const expectedKey = buildIdempotencyKey(
      validPayload.CameraId,
      validPayload.PlateNumber,
      validPayload.DateTime,
    );
    expect(jobId1).toBe(expectedKey);
  });

  it('returns 200 for non-vehicle action without enqueuing', async () => {
    const response = await request(app)
      .post('/api/lpr/NotificationInfo/other')
      .send(validPayload)
      .set('Content-Type', 'application/json');

    expect(response.status).toBe(200);
    expect(lprQueue.add).not.toHaveBeenCalled();
  });

  it('returns 200 even when payload is invalid (200 already sent before validation)', async () => {
    const response = await request(app)
      .post('/api/lpr/NotificationInfo/vehicle')
      .send({ CameraId: 'LPR-0001', DateTime: '2026-06-20T14:32:00' }) // missing plate + image
      .set('Content-Type', 'application/json');

    expect(response.status).toBe(200);
    // queue.add should NOT be called for invalid payloads
    expect(lprQueue.add).not.toHaveBeenCalled();
  });
});
