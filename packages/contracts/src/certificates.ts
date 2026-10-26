import { z } from 'zod';
import { cursorPage, IsoDate, IsoInstant } from './common';

/*
 * Certificates (UI spec #43; domain model: CertificateAward).
 *   GET /api/v1/me/certificates                          → MyCertificates (own awards, `certificate.read` scope O)
 *   GET /api/v1/me/certificates/:awardId                 → CertificateDetail (own award only; anyone else's is a 404)
 *   GET /api/v1/public/certificates/:verificationId      → CertificateVerification (public, rate-limited, D-017)
 * Stored status is `valid` / `revoked` / `superseded`; **expired** is derived from `expiresAt` at read time. The
 * public shape is a strict object holding only what D-017 allows, so a stray private field fails to parse.
 */

export const StoredCertificateStatus = z.enum(['valid', 'revoked', 'superseded']);
export type StoredCertificateStatus = z.infer<typeof StoredCertificateStatus>;

export const CertificateStatus = z.enum(['valid', 'expired', 'revoked', 'superseded']);
export type CertificateStatus = z.infer<typeof CertificateStatus>;

/** D-075: `VL-` + 16 Crockford base32 characters in groups of four (no I, L, O, U). */
export const VerificationId = z.string().regex(/^VL(-[0-9A-HJKMNP-TV-Z]{4}){4}$/);
export type VerificationId = z.infer<typeof VerificationId>;

/**
 * Accepts what people type from paper or a screen: any case, spaces or dashes in any place, with or without the `VL`
 * prefix. Returns the canonical id, or null when it cannot be one (the page then says "no certificate matches").
 */
export function normalizeVerificationId(input: unknown): VerificationId | null {
  // Query strings and request bodies can carry arrays or objects; only a string can be an id.
  if (typeof input !== 'string' || input.length > 64) return null;
  const compact = input.toUpperCase().replace(/[\s-]/g, '');
  const body = compact.startsWith('VL') ? compact.slice(2) : compact;
  if (!/^[0-9A-HJKMNP-TV-Z]{16}$/.test(body)) return null;
  return `VL-${body.match(/.{4}/g)!.join('-')}`;
}

/** Expired is derived, never stored: a valid award whose `expiresAt` has passed. Revoked and superseded win. */
export function certificateDisplayStatus(
  status: StoredCertificateStatus,
  expiresAt: string | null,
  now: Date,
): CertificateStatus {
  if (status !== 'valid') return status;
  return expiresAt !== null && Date.parse(expiresAt) <= now.getTime() ? 'expired' : 'valid';
}

/**
 * D-017: the holder's name as the public page shows it — first initial, then the initial of the last name followed by
 * a fixed "***" (so the length is not revealed). "Demo User" → "D. U***"; "Asha" → "A***".
 */
export function maskHolderName(fullName: string) {
  const words = fullName.trim().split(/\s+/).filter(Boolean);
  // The first grapheme, not code point: combining marks and conjuncts (common in Indic names) stay whole.
  const segmenter = new Intl.Segmenter(undefined, { granularity: 'grapheme' });
  const initial = (word: string) =>
    segmenter.segment(word)[Symbol.iterator]().next().value!.segment.toUpperCase();
  if (words.length === 0) return '***';
  if (words.length === 1) return `${initial(words[0]!)}***`;
  return `${initial(words[0]!)}. ${initial(words.at(-1)!)}***`;
}

export const MyCertificateItem = z.object({
  awardId: z.string(),
  enrollmentId: z.string(),
  courseTitle: z.string(),
  courseVersion: z.number().int().positive(),
  status: CertificateStatus,
  issuedAt: IsoInstant,
  expiresAt: IsoInstant.nullable(),
  verificationId: VerificationId,
});
export type MyCertificateItem = z.infer<typeof MyCertificateItem>;

/** Newest first. The tenant timezone is for displaying dates. */
export const MyCertificates = cursorPage(MyCertificateItem).extend({ timeZone: z.string() });
export type MyCertificates = z.infer<typeof MyCertificates>;

export const CertificateDetail = z.object({
  generatedAt: IsoInstant,
  timeZone: z.string(),
  award: MyCertificateItem.extend({
    completedAt: IsoInstant,
    revokedAt: IsoInstant.nullable(),
    supersededAt: IsoInstant.nullable(),
    /**
     * The award that replaced this one, if superseded. Phase 4 returns it only when the replacement belongs to the same
     * (tenant, user) — otherwise null — backed by a composite FK and a same-user check (isolation review, 1.5.7).
     */
    replacedByAwardId: z.string().nullable(),
  }),
  /** The learner's own full name: printed on their certificate. */
  holderName: z.string(),
  issuerName: z.string(),
});
export type CertificateDetail = z.infer<typeof CertificateDetail>;

/** D-017: everything the public may see, as calendar dates in the issuer's timezone. Nothing else. */
export const CertificateVerification = z.strictObject({
  verificationId: VerificationId,
  status: CertificateStatus,
  courseTitle: z.string(),
  issuerName: z.string(),
  holderMaskedName: z.string(),
  issuedOn: IsoDate,
  expiresOn: IsoDate.nullable(),
  revokedOn: IsoDate.nullable(),
  checkedAt: IsoInstant,
});
export type CertificateVerification = z.infer<typeof CertificateVerification>;
