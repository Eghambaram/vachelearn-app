import { createReadStream } from 'node:fs';
import {
  CreateBucketCommand,
  DeleteObjectCommand,
  GetObjectCommand,
  HeadBucketCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import type { AppConfig } from '../config/env';

/*
 * StorageService adapter (D-009, D-078): S3-compatible object storage — RustFS locally, AWS S3 or R2 in production.
 * The bucket is private; objects are read only through short-lived signed links issued after an authorization check
 * (D-133, D-135). Signed links are secrets while they live: never log them, never store them.
 */

export type SignedLinkOptions = {
  /** The checked content type, sent back as the response's Content-Type. */
  contentType: string;
  /** `attachment` downloads (documents); `inline` displays (images, video). */
  disposition: 'inline' | 'attachment';
  fileName: string;
  expiresInSeconds: number;
};

export abstract class StorageService {
  /** Stores a local file under `key` (never overwritten: keys are unique per asset). */
  abstract put(
    key: string,
    filePath: string,
    contentType: string,
    sizeBytes: number,
  ): Promise<void>;
  /** Removes an object written for an upload that then failed. Missing objects are fine. */
  abstract remove(key: string): Promise<void>;
  abstract exists(key: string): Promise<boolean>;
  abstract signedGetUrl(key: string, options: SignedLinkOptions): Promise<string>;
  /** Local start-up only (STORAGE_AUTO_CREATE_BUCKET). */
  abstract ensureBucket(): Promise<void>;
  /** Readiness: the bucket answers within a few seconds. */
  abstract isReady(): Promise<boolean>;
}

/** `attachment; filename="…"; filename*=UTF-8''…` with the name reduced to safe ASCII in the plain form. */
export function contentDisposition(disposition: 'inline' | 'attachment', fileName: string) {
  const ascii = fileName.replace(/[^\x20-\x7e]/g, '_').replace(/["\\]/g, '_');
  // RFC 8187 attr-char: encodeURIComponent leaves ' ( ) * unencoded, which `filename*` does not allow.
  const encoded = encodeURIComponent(fileName).replace(
    /['()*]/g,
    (ch) => `%${ch.charCodeAt(0).toString(16).toUpperCase()}`,
  );
  return `${disposition}; filename="${ascii}"; filename*=UTF-8''${encoded}`;
}

export class S3StorageService extends StorageService {
  private readonly client: S3Client;
  /** Signs links for the address browsers reach (it can differ from the API's own route to storage). */
  private readonly signer: S3Client;
  private readonly bucket: string;

  constructor(storage: AppConfig['storage']) {
    super();
    const base = {
      region: storage.region,
      forcePathStyle: storage.forcePathStyle,
      credentials: { accessKeyId: storage.accessKeyId, secretAccessKey: storage.secretAccessKey },
    };
    this.client = new S3Client({ ...base, endpoint: storage.endpoint });
    this.signer = new S3Client({ ...base, endpoint: storage.publicEndpoint });
    this.bucket = storage.bucket;
  }

  async put(key: string, filePath: string, contentType: string, sizeBytes: number) {
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Body: createReadStream(filePath),
        ContentType: contentType,
        ContentLength: sizeBytes,
        // Never overwrite an existing object (a key is unique per asset; this is the backstop).
        IfNoneMatch: '*',
      }),
    );
  }

  async remove(key: string) {
    await this.client.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: key }));
  }

  async exists(key: string) {
    try {
      await this.client.send(new HeadObjectCommand({ Bucket: this.bucket, Key: key }));
      return true;
    } catch (err) {
      if ((err as { $metadata?: { httpStatusCode?: number } }).$metadata?.httpStatusCode === 404)
        return false;
      throw err;
    }
  }

  signedGetUrl(key: string, options: SignedLinkOptions) {
    return getSignedUrl(
      this.signer,
      new GetObjectCommand({
        Bucket: this.bucket,
        Key: key,
        ResponseContentType: options.contentType,
        ResponseContentDisposition: contentDisposition(options.disposition, options.fileName),
        ResponseCacheControl: 'private, no-store',
      }),
      { expiresIn: options.expiresInSeconds },
    );
  }

  async isReady() {
    try {
      await this.client.send(new HeadBucketCommand({ Bucket: this.bucket }), {
        abortSignal: AbortSignal.timeout(3000),
      });
      return true;
    } catch {
      return false;
    }
  }

  async ensureBucket() {
    try {
      await this.client.send(new HeadBucketCommand({ Bucket: this.bucket }));
    } catch {
      await this.client.send(new CreateBucketCommand({ Bucket: this.bucket }));
    }
  }
}

export function createStorageService(config: AppConfig): StorageService {
  return new S3StorageService(config.storage);
}
