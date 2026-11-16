import { z } from 'zod';
import { IsoInstant } from './common';

/*
 * Uploaded files (Slice 3.4; D-131–D-135). Uploads go through the API as multipart/form-data (field `file`); the API
 * detects the type from the contents and enforces the kind's limits. A file never changes once stored. It is read only
 * through a short-lived signed link issued after an authorization check: a course cover follows course reading
 * (D-127), any other asset only Tenant Admins (D-133). The storage key is never returned in a response body; it is
 * part of a signed link's path, which is why the bucket must stay private (Phase 7 launch check).
 */

export const AssetKind = z.enum(['image', 'document', 'video']);
export type AssetKind = z.infer<typeof AssetKind>;
export const AssetStatus = z.enum(['processing', 'ready', 'failed']);
export type AssetStatus = z.infer<typeof AssetStatus>;

/** D-132: what each kind accepts (the API checks the contents; these drive the web's file picker and messages). */
export const ASSET_RULES = {
  image: { types: ['image/png', 'image/jpeg', 'image/webp'], maxBytes: 5 * 1024 * 1024 },
  document: { types: ['application/pdf'], maxBytes: 25 * 1024 * 1024 },
  video: { types: ['video/mp4', 'video/webm'], maxBytes: 500 * 1024 * 1024 },
} as const satisfies Record<AssetKind, { types: readonly string[]; maxBytes: number }>;

/** `POST /assets?kind=`: the kind decides the allowed types and size limit. */
export const UploadAssetQuery = z.strictObject({ kind: AssetKind });
export type UploadAssetQuery = z.input<typeof UploadAssetQuery>;

export const AssetView = z.object({
  id: z.uuid(),
  kind: AssetKind,
  status: AssetStatus,
  /** Detected from the file's contents. */
  contentType: z.string(),
  sizeBytes: z.number().int().positive(),
  sha256: z.string().regex(/^[0-9a-f]{64}$/),
  fileName: z.string(),
  /** D-134: `not_scanned` until a scanner runs (Phase 7). */
  scanStatus: z.enum(['not_scanned', 'clean']),
  failureReason: z.string().nullable(),
  createdAt: IsoInstant,
  readyAt: IsoInstant.nullable(),
});
export type AssetView = z.infer<typeof AssetView>;

/** `GET /assets/:id/access`: a signed link valid for 5 minutes (D-135). A secret while it lives: never log it. */
export const AssetAccessView = z.object({ url: z.url(), expiresAt: IsoInstant });
export type AssetAccessView = z.infer<typeof AssetAccessView>;
