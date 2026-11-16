import { randomUUID } from 'node:crypto';
import { Inject, Injectable, type OnModuleInit } from '@nestjs/common';
import type { AssetAccessView, AssetKind, AssetView } from '@vachelearn/contracts';
import type { Request } from 'express';
import { PinoLogger } from 'nestjs-pino';
import { z } from 'zod';
import type { Asset } from '../../generated/prisma/client';
import { liveReach, reachFor, readsCourses } from '../access/reach';
import type { RequestContext } from '../access/request-context';
import { AuditService, type Tx } from '../audit/audit.service';
import { ApiException } from '../common/errors/api-exception';
import { APP_CONFIG, type AppConfig } from '../config/env';
import { defineJob, JobRegistry, PermanentJobError } from '../jobs/job-handlers';
import { JobsService } from '../jobs/jobs.service';
import { PrismaService } from '../prisma/prisma.service';
import { MalwareScanner } from '../storage/malware-scanner';
import { StorageService } from '../storage/storage.service';
import { VideoProvider } from '../storage/video.provider';
import { receiveFile } from './upload';

/*
 * Assets (Slice 3.4; D-131–D-135). Uploads stream through the API (D-131): checked by content and size (D-132),
 * scanned when a scanner exists (D-134), stored under a key the API chooses, and recorded with an audit event. A video
 * is handed to the VideoProvider and finishes through a job. Reading is a signed link valid for 5 minutes (D-135),
 * issued only after the D-133 check; anyone else gets 404, so existence never leaks.
 */

export const LINK_SECONDS = 300;
/** Uploads one person may have in flight at once (security review 3.4: each can hold up to 500 MB of temporary disk). */
export const MAX_UPLOADS_IN_FLIGHT = 2;

/** The download name ends in the detected type's extension, whatever the uploader called it (security review 3.4). */
const EXTENSION: Record<string, string> = {
  'image/png': '.png',
  'image/jpeg': '.jpg',
  'image/webp': '.webp',
  'application/pdf': '.pdf',
  'video/mp4': '.mp4',
  'video/webm': '.webm',
};
export function downloadName(fileName: string, contentType: string) {
  const ext = EXTENSION[contentType] ?? '';
  const stem = fileName.replace(/\.[^.]{1,10}$/, '');
  return `${stem || 'file'}${ext}`;
}
export const VIDEO_JOB = 'asset.video_check';
const VideoJobPayload = z.strictObject({ assetId: z.uuid(), tenantId: z.uuid() });

function tenantOf(ctx: RequestContext) {
  if (!ctx.tenant) throw ApiException.notFound();
  return ctx.tenant.tenantId;
}

export function toAssetView(a: Asset): AssetView {
  return {
    id: a.id,
    kind: a.kind,
    status: a.status,
    contentType: a.contentType,
    sizeBytes: a.sizeBytes,
    sha256: a.sha256,
    fileName: a.fileName,
    scanStatus: a.scanStatus,
    failureReason: a.failureReason,
    createdAt: a.createdAt.toISOString(),
    readyAt: a.readyAt?.toISOString() ?? null,
  };
}

async function assertUploader(tx: Tx, ctx: RequestContext, tenantId: string) {
  const reach = await liveReach(tx, ctx, tenantId, 'asset.upload');
  if (reach.kind !== 'tenant') throw new ApiException(403, 'FORBIDDEN', 'Forbidden');
}

@Injectable()
export class AssetsService implements OnModuleInit {
  /** Per-process count of each user's uploads in progress (one API process for now; Phase 7 revisits with scaling). */
  private readonly inFlight = new Map<string, number>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly jobs: JobsService,
    private readonly registry: JobRegistry,
    private readonly storage: StorageService,
    private readonly video: VideoProvider,
    private readonly scanner: MalwareScanner,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
    private readonly logger: PinoLogger,
  ) {
    logger.setContext(AssetsService.name);
  }

  async onModuleInit() {
    this.registry.register(
      defineJob({
        type: VIDEO_JOB,
        payload: VideoJobPayload,
        run: (payload, job) => {
          // The job row and its payload are written together by the server; a mismatch is refused, never followed.
          if (job.tenantId !== payload.tenantId) throw new PermanentJobError('job tenant mismatch');
          return this.finishVideo(payload.tenantId, payload.assetId);
        },
      }),
    );
    if (this.config.storage.autoCreateBucket) {
      try {
        await this.storage.ensureBucket();
      } catch (err) {
        // Local convenience only: uploads fail clearly until storage is up (`pnpm services:up`).
        this.logger.warn({ err: (err as Error).name }, 'could not create the storage bucket');
      }
    }
  }

  /** Stores one uploaded file (D-131). The temporary file is always removed; a stored object whose record fails is too. */
  async upload(ctx: RequestContext, kind: AssetKind, req: Request): Promise<AssetView> {
    const tenantId = tenantOf(ctx);
    // Refuse before reading any bytes when the caller cannot upload any more.
    await this.prisma.$transaction((tx) => assertUploader(tx, ctx, tenantId));
    const inFlight = this.inFlight.get(ctx.userId) ?? 0;
    if (inFlight >= MAX_UPLOADS_IN_FLIGHT) {
      throw new ApiException(429, 'TOO_MANY_UPLOADS', 'Wait for your other uploads to finish');
    }
    this.inFlight.set(ctx.userId, inFlight + 1);
    try {
      return await this.store(ctx, tenantId, kind, req);
    } finally {
      const left = (this.inFlight.get(ctx.userId) ?? 1) - 1;
      if (left > 0) this.inFlight.set(ctx.userId, left);
      else this.inFlight.delete(ctx.userId);
    }
  }

  private async store(ctx: RequestContext, tenantId: string, kind: AssetKind, req: Request) {
    const file = await receiveFile(req, kind);
    const key = `tenants/${tenantId}/${kind}/${randomUUID()}`;
    let stored = false;
    try {
      const scan = await this.scanner.scan(file.filePath);
      if (scan.verdict === 'infected') {
        throw ApiException.validation([
          { field: 'file', code: 'infected', message: 'This file was refused by the malware scan' },
        ]);
      }
      await this.storage.put(key, file.filePath, file.contentType, file.sizeBytes);
      stored = true;
      const isVideo = kind === 'video';
      const providerRef = isVideo ? await this.video.ingest(key) : null;
      const asset = await this.prisma.$transaction(async (tx) => {
        await assertUploader(tx, ctx, tenantId);
        const row = await tx.asset.create({
          data: {
            tenantId,
            kind,
            status: isVideo ? 'processing' : 'ready',
            storageKey: key,
            contentType: file.contentType,
            sizeBytes: file.sizeBytes,
            sha256: file.sha256,
            fileName: file.fileName,
            provider: isVideo ? this.video.name : 'storage',
            providerRef,
            scanStatus: scan.verdict === 'clean' ? 'clean' : 'not_scanned',
            readyAt: isVideo ? null : new Date(),
            createdById: ctx.userId,
          },
        });
        await this.audit.record(tx, {
          actorUserId: ctx.userId,
          tenantId,
          action: 'asset.uploaded',
          entityType: 'asset',
          entityId: row.id,
          requestId: ctx.requestId,
          after: { kind, contentType: row.contentType, sizeBytes: row.sizeBytes },
        });
        if (isVideo) {
          await this.jobs.enqueue(
            { type: VIDEO_JOB, businessKey: `asset:${row.id}`, tenantId, payload: { assetId: row.id, tenantId } },
            tx,
          );
        }
        return row;
      });
      return toAssetView(asset);
    } catch (err) {
      if (stored) await this.storage.remove(key).catch(() => undefined);
      throw err;
    } finally {
      await file.cleanup();
    }
  }

  async get(ctx: RequestContext, id: string): Promise<AssetView> {
    return toAssetView(await this.readable(ctx, id));
  }

  /** A signed link (D-135) for a ready asset the caller may read (D-133). */
  async access(ctx: RequestContext, id: string): Promise<AssetAccessView> {
    const asset = await this.readable(ctx, id);
    if (asset.status !== 'ready') {
      throw new ApiException(409, 'ASSET_NOT_READY', 'This file is not ready yet');
    }
    const expiresAt = new Date(Date.now() + LINK_SECONDS * 1000);
    const url = await this.storage.signedGetUrl(asset.storageKey, {
      contentType: asset.contentType,
      disposition: asset.kind === 'document' ? 'attachment' : 'inline',
      fileName: downloadName(asset.fileName, asset.contentType),
      expiresInSeconds: LINK_SECONDS,
    });
    return { url, expiresAt: expiresAt.toISOString() };
  }

  /**
   * D-133: Tenant Admins (tenant-wide `asset.read`) read every asset of the tenant; course readers (D-127) read an asset
   * that is a course's cover; everyone else gets 404 — the same answer as a missing or other-tenant asset.
   */
  private async readable(ctx: RequestContext, id: string) {
    const tenantId = tenantOf(ctx);
    const asset = await this.prisma.asset.findFirst({ where: { id, tenantId } });
    if (!asset) throw ApiException.notFound();
    if (reachFor(ctx, 'asset.read')?.kind === 'tenant') return asset;
    // Course reading itself, whatever the calling route's permission (isolation audit 3.4).
    if (reachFor(ctx, 'course.read') !== null && readsCourses(ctx)) {
      const cover = await this.prisma.courseVersion.findFirst({
        where: { tenantId, coverAssetId: id },
        select: { id: true },
      });
      if (cover) return asset;
    }
    throw ApiException.notFound();
  }

  /** The video job: idempotent (only a processing asset changes); still processing → retried with backoff. */
  async finishVideo(tenantId: string, assetId: string) {
    const asset = await this.prisma.asset.findFirst({ where: { id: assetId, tenantId } });
    if (!asset) throw new PermanentJobError('asset not found');
    if (asset.status !== 'processing' || !asset.providerRef) return;
    const status = await this.video.status(asset.providerRef);
    if (status.state === 'processing') throw new Error('video still processing');
    await this.prisma.asset.updateMany({
      where: { id: assetId, tenantId, status: 'processing' },
      data:
        status.state === 'ready'
          ? { status: 'ready', readyAt: new Date() }
          : { status: 'failed', failedAt: new Date(), failureReason: status.reason.slice(0, 200) },
    });
  }
}
