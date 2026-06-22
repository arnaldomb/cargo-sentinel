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
import { resetCameraHintCache } from './lpr';

const validPayload = {
  PlateNumber: 'ABC1234',
  ImageBase64: 'aGVsbG8=', // 'hello' in base64
  CameraId: 'LPR-0001',
  DateTime: '2026-06-20T14:32:00',
  Direction: 'in',
};

const nestedIntelbrasPayload = {
  DeviceID: 'LPR-0009',
  Picture: {
    SnapTime: '2026-06-20T14:45:00',
    Plate: {
      PlateNumber: 'XYZ1234',
    },
    NormalPic: {
      Content: 'bmVzdGVk',
    },
  },
};

describe('POST /api/lpr/NotificationInfo/vehicle', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetCameraHintCache();
  });

  it('returns HTTP 200 immediately with { Result: true }', async () => {
    const response = await request(app)
      .post('/api/lpr/NotificationInfo/vehicle')
      .send(validPayload)
      .set('Content-Type', 'application/json');

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ Result: true });
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

  it('accepts the Intelbras TollgateInfo endpoint and enqueues the event', async () => {
    const response = await request(app)
      .post('/NotificationInfo/TollgateInfo')
      .send(validPayload)
      .set('Content-Type', 'application/json');

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ Result: true });
    expect(lprQueue.add).toHaveBeenCalledOnce();
  });

  it('accepts the nested Intelbras Picture payload used by the base project', async () => {
    const response = await request(app)
      .post('/NotificationInfo/TollgateInfo')
      .send(nestedIntelbrasPayload)
      .set('Content-Type', 'application/json');

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ Result: true });
    expect(lprQueue.add).toHaveBeenCalledWith(
      'process-lpr-event',
      expect.objectContaining({
        PlateNumber: 'XYZ1234',
        ImageBase64: 'bmVzdGVk',
        CameraId: 'LPR-0009',
        DateTime: '2026-06-20T14:45:00',
      }),
      expect.anything(),
    );
  });

  it('accepts KeepAlive and DeviceInfo without enqueuing LPR work', async () => {
    const keepAliveResponse = await request(app)
      .post('/NotificationInfo/KeepAlive')
      .send({ DeviceID: 'cam-1', Time: '2026-06-21T15:00:00Z' })
      .set('Content-Type', 'application/json');

    const deviceInfoResponse = await request(app)
      .post('/NotificationInfo/DeviceInfo')
      .send({ DeviceID: 'cam-1', DeviceModel: 'VIP-5460-LPR-IA' })
      .set('Content-Type', 'application/json');

    expect(keepAliveResponse.status).toBe(200);
    expect(deviceInfoResponse.status).toBe(200);
    expect(lprQueue.add).not.toHaveBeenCalled();
  });

  it('uses the recent KeepAlive camera hint when TollgateInfo omits CameraId', async () => {
    await request(app)
      .post('/NotificationInfo/KeepAlive')
      .send({
        DeviceID: '6a2598b1-9b6c-92f9-c0f7-bf4344b19b6c',
        IPAddress: '192.168.16.117',
      })
      .set('Content-Type', 'application/json');

    const response = await request(app)
      .post('/NotificationInfo/TollgateInfo')
      .send({
        Picture: {
          SnapTime: '2026-06-21T16:10:00Z',
          Plate: { PlateNumber: 'AB12349' },
          NormalPic: { Content: 'bmVzdGVk' },
        },
      })
      .set('Content-Type', 'application/json');

    expect(response.status).toBe(200);
    expect(lprQueue.add).toHaveBeenCalledWith(
      'process-lpr-event',
      expect.objectContaining({
        PlateNumber: 'AB12349',
        CameraId: '6a2598b1-9b6c-92f9-c0f7-bf4344b19b6c',
      }),
      expect.anything(),
    );
  });

  it('accepts the base NotificationInfo endpoint without an action', async () => {
    const response = await request(app)
      .post('/NotificationInfo')
      .send({ DeviceID: 'cam-1' })
      .set('Content-Type', 'application/json');

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ Result: true });
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
