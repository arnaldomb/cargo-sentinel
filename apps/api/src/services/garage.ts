import { S3Client, PutObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { v4 as uuidv4 } from 'uuid';

const BUCKET = 'lpr-images';

/**
 * Internal S3Client — uses the Docker-internal Garage URL for uploads.
 * This client MUST NOT be used for presigned URLs (Pitfall 2).
 */
const internalS3 = new S3Client({
  region: 'garage',
  endpoint: process.env.GARAGE_INTERNAL_URL ?? 'http://garage:3900',
  credentials: {
    accessKeyId: process.env.GARAGE_ACCESS_KEY!,
    secretAccessKey: process.env.GARAGE_SECRET_KEY!,
  },
  forcePathStyle: true, // REQUIRED for Garage — no virtual-hosted URLs
});

/**
 * Upload an image buffer to Garage using the internal Docker endpoint.
 * Returns the storage key only (never a URL).
 * Key format: eventos/YYYY/MM/DD/{cameraId}_{uuid}.jpg
 */
export async function uploadToGarage(buffer: Buffer, cameraId: string): Promise<string> {
  const date = new Date();
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const key = `eventos/${year}/${month}/${day}/${cameraId}_${uuidv4()}.jpg`;

  await internalS3.send(
    new PutObjectCommand({
      Bucket: BUCKET,
      Key: key,
      Body: buffer,
      ContentType: 'image/jpeg',
    }),
  );

  return key; // store only the key, never the full URL
}

/**
 * Returns a thumbnail URL via the Next.js image proxy (same-domain, session-authenticated).
 * Used for browser display — avoids presigned URL localhost issues when Garage has no public tunnel.
 */
export function getThumbnailProxyUrl(key: string): string {
  const base = process.env.THUMBNAIL_PROXY_URL ?? 'http://localhost:3000/api/image-proxy';
  return `${base}?key=${encodeURIComponent(key)}`;
}

/**
 * Generate a presigned GET URL for the public domain (STORAGE-03: 5-min TTL).
 * Use only for server-side downloads (e.g. PDF report generation).
 * For browser thumbnails, use getThumbnailProxyUrl() instead.
 */
export async function getPresignedUrl(key: string): Promise<string> {
  const publicS3 = new S3Client({
    region: 'garage',
    endpoint: process.env.GARAGE_SERVER_URL, // public HTTPS endpoint
    credentials: {
      accessKeyId: process.env.GARAGE_ACCESS_KEY!,
      secretAccessKey: process.env.GARAGE_SECRET_KEY!,
    },
    forcePathStyle: true,
  });

  return getSignedUrl(publicS3, new GetObjectCommand({ Bucket: BUCKET, Key: key }), {
    expiresIn: 300, // 5-minute TTL per STORAGE-03
  });
}
