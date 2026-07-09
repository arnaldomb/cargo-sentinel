import { auth } from '../../../../auth';
import { NextRequest } from 'next/server';

const GARAGE_INTERNAL = process.env.GARAGE_INTERNAL_URL ?? 'http://garage:3900';
const BUCKET = process.env.GARAGE_DEFAULT_BUCKET ?? 'lpr-images';
const ACCESS_KEY = process.env.GARAGE_ACCESS_KEY!;
const SECRET_KEY = process.env.GARAGE_SECRET_KEY!;

async function hmacSha256(key: ArrayBuffer, data: string): Promise<ArrayBuffer> {
  const cryptoKey = await crypto.subtle.importKey('raw', key, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return crypto.subtle.sign('HMAC', cryptoKey, new TextEncoder().encode(data));
}

function toHex(buf: ArrayBuffer): string {
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, '0')).join('');
}

async function sha256Hex(data: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(data));
  return toHex(buf);
}

async function buildAwsV4Headers(
  method: string,
  host: string,
  path: string,
): Promise<Record<string, string>> {
  const now = new Date();
  const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, '').slice(0, 15) + 'Z';
  const dateStamp = amzDate.slice(0, 8);
  const region = 'garage';
  const service = 's3';

  const payloadHash = await sha256Hex('');
  const canonicalHeaders = `host:${host}\nx-amz-content-sha256:${payloadHash}\nx-amz-date:${amzDate}\n`;
  const signedHeaders = 'host;x-amz-content-sha256;x-amz-date';
  const canonicalRequest = [method, path, '', canonicalHeaders, signedHeaders, payloadHash].join('\n');
  const credentialScope = `${dateStamp}/${region}/${service}/aws4_request`;
  const stringToSign = ['AWS4-HMAC-SHA256', amzDate, credentialScope, await sha256Hex(canonicalRequest)].join('\n');

  const enc = (s: string) => new TextEncoder().encode(s);
  const signingKey = await hmacSha256(
    await hmacSha256(
      await hmacSha256(
        await hmacSha256(enc(`AWS4${SECRET_KEY}`).buffer as ArrayBuffer, dateStamp),
        region,
      ),
      service,
    ),
    'aws4_request',
  );
  const signature = toHex(await hmacSha256(signingKey, stringToSign));

  return {
    Authorization: `AWS4-HMAC-SHA256 Credential=${ACCESS_KEY}/${credentialScope},SignedHeaders=${signedHeaders},Signature=${signature}`,
    'x-amz-date': amzDate,
    'x-amz-content-sha256': payloadHash,
  };
}

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session) {
    return new Response('Unauthorized', { status: 401 });
  }

  const key = req.nextUrl.searchParams.get('key');
  if (!key) return new Response('Missing key', { status: 400 });

  const host = new URL(GARAGE_INTERNAL).host;
  const path = `/${BUCKET}/${key}`;
  const authHeaders = await buildAwsV4Headers('GET', host, path);

  const upstream = await fetch(`${GARAGE_INTERNAL}${path}`, {
    headers: authHeaders,
    cache: 'no-store',
  });

  if (!upstream.ok) {
    return new Response('Not found', { status: upstream.status });
  }

  const contentType = upstream.headers.get('content-type') ?? 'image/jpeg';
  return new Response(upstream.body, {
    status: 200,
    headers: {
      'Content-Type': contentType,
      'Cache-Control': 'private, max-age=300',
    },
  });
}
