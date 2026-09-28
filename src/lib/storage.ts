import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

export interface SaveFileOptions {
  buffer: Buffer;
  filename: string;
  mimeType: string;
  subDir: string;
}

export interface SaveFileResult {
  url: string;
  provider: 'vps-disk' | 's3-compatible';
  key: string;
}

export interface StorageProvider {
  name: string;
  saveFile(opts: SaveFileOptions): Promise<SaveFileResult>;
  deleteFile?(key: string): Promise<boolean>;
}

/**
 * Local Storage Provider — persistent storage on local VPS disk (/public/uploads).
 * Suitable for single-instance deployments and local development.
 */
export class LocalStorageProvider implements StorageProvider {
  name = 'vps-disk' as const;

  async saveFile(opts: SaveFileOptions): Promise<SaveFileResult> {
    const cleanSubDir = opts.subDir.replace(/[^a-zA-Z0-9_-]/g, '');
    const cleanFilename = path.basename(opts.filename).replace(/[^a-zA-Z0-9._-]/g, '_');
    const uploadDir = path.join(process.cwd(), 'public', 'uploads', cleanSubDir);

    await fs.promises.mkdir(uploadDir, { recursive: true });
    const filepath = path.join(uploadDir, cleanFilename);
    await fs.promises.writeFile(filepath, opts.buffer);

    return {
      url: `/uploads/${cleanSubDir}/${cleanFilename}`,
      provider: 'vps-disk',
      key: `${cleanSubDir}/${cleanFilename}`,
    };
  }

  async deleteFile(key: string): Promise<boolean> {
    try {
      const cleanKey = key.replace(/\.\./g, '');
      const filepath = path.join(process.cwd(), 'public', 'uploads', cleanKey);
      await fs.promises.unlink(filepath);
      return true;
    } catch {
      return false;
    }
  }
}

/**
 * S3-Compatible Storage Provider (AWS S3, Cloudflare R2, MinIO, Wasabi).
 * Native SigV4 signing using Node.js crypto — no bloated SDK dependencies required.
 * Ensures multi-replica consistency and persistence across ephemeral container restarts.
 */
export class S3CompatibleStorageProvider implements StorageProvider {
  name = 's3-compatible' as const;

  private bucket: string;
  private endpoint: string;
  private region: string;
  private accessKeyId: string;
  private secretAccessKey: string;
  private publicUrlPrefix: string;

  constructor(config: {
    bucket: string;
    endpoint?: string;
    region?: string;
    accessKeyId: string;
    secretAccessKey: string;
    publicUrlPrefix?: string;
  }) {
    this.bucket = config.bucket;
    this.endpoint = (config.endpoint || 'https://s3.amazonaws.com').replace(/\/$/, '');
    this.region = config.region || 'auto';
    this.accessKeyId = config.accessKeyId;
    this.secretAccessKey = config.secretAccessKey;
    this.publicUrlPrefix = (config.publicUrlPrefix || `${this.endpoint}/${this.bucket}`).replace(/\/$/, '');
  }

  private hmac(key: string | Buffer, string: string): Buffer {
    return crypto.createHmac('sha256', key).update(string, 'utf8').digest();
  }

  private sha256(content: string | Buffer): string {
    return crypto.createHash('sha256').update(content).digest('hex');
  }

  private getSignatureKey(key: string, dateStamp: string, regionName: string, serviceName: string): Buffer {
    const kDate = this.hmac('AWS4' + key, dateStamp);
    const kRegion = this.hmac(kDate, regionName);
    const kService = this.hmac(kRegion, serviceName);
    return this.hmac(kService, 'aws4_request');
  }

  async saveFile(opts: SaveFileOptions): Promise<SaveFileResult> {
    const cleanSubDir = opts.subDir.replace(/[^a-zA-Z0-9_-]/g, '');
    const cleanFilename = path.basename(opts.filename).replace(/[^a-zA-Z0-9._-]/g, '_');
    const objectKey = `${cleanSubDir}/${cleanFilename}`;

    const parsedEndpoint = new URL(this.endpoint);
    const host = parsedEndpoint.host;
    const pathPrefix = parsedEndpoint.pathname.replace(/\/$/, '');
    const canonicalUri = `${pathPrefix}/${this.bucket}/${objectKey}`;

    const now = new Date();
    const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, '');
    const dateStamp = amzDate.slice(0, 8);
    const payloadHash = this.sha256(opts.buffer);

    const canonicalHeaders = `content-type:${opts.mimeType}\nhost:${host}\nx-amz-content-sha256:${payloadHash}\nx-amz-date:${amzDate}\n`;
    const signedHeaders = 'content-type;host;x-amz-content-sha256;x-amz-date';

    const canonicalRequest = [
      'PUT',
      canonicalUri,
      '',
      canonicalHeaders,
      signedHeaders,
      payloadHash,
    ].join('\n');

    const credentialScope = `${dateStamp}/${this.region}/s3/aws4_request`;
    const stringToSign = [
      'AWS4-HMAC-SHA256',
      amzDate,
      credentialScope,
      this.sha256(canonicalRequest),
    ].join('\n');

    const signingKey = this.getSignatureKey(this.secretAccessKey, dateStamp, this.region, 's3');
    const signature = crypto.createHmac('sha256', signingKey).update(stringToSign, 'utf8').digest('hex');

    const authorizationHeader = `AWS4-HMAC-SHA256 Credential=${this.accessKeyId}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;

    const uploadUrl = `${this.endpoint}/${this.bucket}/${objectKey}`;
    const res = await fetch(uploadUrl, {
      method: 'PUT',
      headers: {
        'Content-Type': opts.mimeType,
        'Host': host,
        'x-amz-date': amzDate,
        'x-amz-content-sha256': payloadHash,
        'Authorization': authorizationHeader,
      },
      body: opts.buffer as any,
      signal: AbortSignal.timeout(15000),
    });

    if (!res.ok) {
      const errText = await res.text().catch(() => '');
      throw new Error(`S3 upload failed with status ${res.status}: ${errText.slice(0, 200)}`);
    }

    const publicUrl = `${this.publicUrlPrefix}/${objectKey}`;
    return {
      url: publicUrl,
      provider: 's3-compatible',
      key: objectKey,
    };
  }
}

let activeProvider: StorageProvider | null = null;

export function getStorageProvider(): StorageProvider {
  if (activeProvider) return activeProvider;

  const bucket = process.env.S3_BUCKET || process.env.R2_BUCKET || process.env.STORAGE_BUCKET;
  const accessKeyId = process.env.S3_ACCESS_KEY_ID || process.env.R2_ACCESS_KEY_ID || process.env.AWS_ACCESS_KEY_ID;
  const secretAccessKey = process.env.S3_SECRET_ACCESS_KEY || process.env.R2_SECRET_ACCESS_KEY || process.env.AWS_SECRET_ACCESS_KEY;

  if (bucket && accessKeyId && secretAccessKey) {
    activeProvider = new S3CompatibleStorageProvider({
      bucket,
      endpoint: process.env.S3_ENDPOINT || process.env.R2_ENDPOINT,
      region: process.env.S3_REGION || process.env.R2_REGION || 'auto',
      accessKeyId,
      secretAccessKey,
      publicUrlPrefix: process.env.S3_PUBLIC_URL_PREFIX || process.env.STORAGE_PUBLIC_URL_PREFIX,
    });
    return activeProvider;
  }

  activeProvider = new LocalStorageProvider();
  return activeProvider;
}

export function resetStorageProviderForTesting(provider: StorageProvider | null = null): void {
  activeProvider = provider;
}
