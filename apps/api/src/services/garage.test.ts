import { describe, it, expect, beforeEach } from 'vitest';

// Set env vars before importing the module under test
beforeEach(() => {
  process.env.GARAGE_SERVER_URL = 'https://sentinel.example.com/media';
  process.env.GARAGE_INTERNAL_URL = 'http://garage:3900';
  process.env.GARAGE_ACCESS_KEY = 'GKtestkey123456789ab';
  process.env.GARAGE_SECRET_KEY = 'testsecret00000000000000000000001';
});

describe('getPresignedUrl', () => {
  it('returns a URL containing the public GARAGE_SERVER_URL host, not the internal Docker host', async () => {
    // Dynamic import so env vars are set before S3Client is constructed
    const { getPresignedUrl } = await import('./garage');
    const url = await getPresignedUrl('eventos/2026/06/20/cam001_test.jpg');

    expect(url).toContain('sentinel.example.com');
    expect(url).not.toContain('garage:3900');
  });

  it('generates a presigned URL with X-Amz-Expires=300 (5-minute TTL)', async () => {
    const { getPresignedUrl } = await import('./garage');
    const url = await getPresignedUrl('eventos/2026/06/20/cam001_test.jpg');

    // SigV4 presigned URLs include X-Amz-Expires query param
    expect(url).toContain('X-Amz-Expires=300');
  });
});
