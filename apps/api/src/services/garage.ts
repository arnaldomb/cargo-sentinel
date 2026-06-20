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
 * Generate a presigned GET URL for the public domain (STORAGE-03: 5-min TTL).
 *
 * CRITICAL (Pitfall 2): presigned URLs MUST be signed with GARAGE_SERVER_URL (public),
 * NOT GARAGE_INTERNAL_URL. The S3 signing algorithm includes the endpoint hostname in
 * the signature — a mismatch causes SignatureDoesNotMatch at 403.
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
