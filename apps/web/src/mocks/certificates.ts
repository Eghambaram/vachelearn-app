import type { StoredCertificateStatus } from '@vachelearn/contracts';
import { DEMO_TENANTS } from './demo-session';
import type { DemoEnrollment } from './enrollments';
import { DAY } from './time';

/*
 * Phase 1 demo certificate awards (slice 1.5.7). Awards belong to completed enrollments and are evidence: a reissue
 * supersedes an award, a revocation records when (and, internally, why) — nothing is rewritten. Verification ids look
 * like real ones (D-075) but are derived deterministically from the award id so tests and links are stable; the API
 * draws them from a CSPRNG. Replaced by the API in Phase 4.6.
 */

/** Every demo award lasts a year unless the plan says it never expires. */
const YEAR = 365 * DAY;

type Plan = {
  /** Never expires (no renewal cycle). */
  noExpiry?: boolean;
  /** Days after completion the award was revoked. */
  revokedAfterDays?: number;
  /** Days after completion it was reissued (the first award superseded by a second). */
  reissuedAfterDays?: number;
};

/** Certificate plans per enrollment, keyed by `${userId}:${row index}` in `mocks/enrollments.ts`. */
const PLANS: Record<string, Plan> = {
  // First Aid Essentials: reissued three days after completion (template correction) — first award superseded.
  'demo-user:6': { reissuedAfterDays: 3 },
  // Chemical Handling: valid, no expiry.
  'demo-user:8': { noExpiry: true },
  // Electrical Isolation: completed 400 days ago, one-year validity → expired.
  'demo-user:10': {},
  // Hot Work Permits: revoked 80 days after completion.
  'demo-user:11': { revokedAfterDays: 80 },
  // Another learner's certificate: publicly verifiable, never in Demo User's list.
  'demo-other-learner:1': {},
};

/** Revocation reasons are internal (D-017): kept here to prove they never reach the public page. */
export const DEMO_REVOCATION_REASON = 'Issued in error: assessment record corrected (demo reason)';

export type DemoAward = {
  id: string;
  tenantId: string;
  userId: string;
  enrollmentId: string;
  courseTitle: string;
  courseVersion: number;
  completedAt: string;
  issuedAt: string;
  expiresAt: string | null;
  status: StoredCertificateStatus;
  revokedAt: string | null;
  revokedReason: string | null;
  supersededAt: string | null;
  replacedByAwardId: string | null;
  verificationId: string;
};

const CROCKFORD = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';

/**
 * Stable, random-looking D-075 id from a string — INSECURE, demo only: a 32-bit hash anyone can recompute from an
 * award id. The API draws 80 bits from a CSPRNG (D-075); never reuse this outside fixtures.
 */
export function insecureDemoVerificationId(seed: string) {
  let h = 0x811c9dc5;
  for (const ch of seed) h = Math.imul(h ^ ch.charCodeAt(0), 0x01000193) >>> 0;
  let chars = '';
  for (let i = 0; i < 16; i++) {
    h ^= h << 13;
    h ^= h >>> 17;
    h ^= h << 5;
    h >>>= 0;
    chars += CROCKFORD[h % 32];
  }
  return `VL-${chars.match(/.{4}/g)!.join('-')}`;
}

const iso = (ms: number) => new Date(ms).toISOString();

/** Awards for one enrollment, oldest first. */
export function demoAwards(enrollment: DemoEnrollment): DemoAward[] {
  const plan = PLANS[`${enrollment.userId}:${enrollment.seed}`];
  if (!plan || enrollment.status !== 'completed' || !enrollment.completedAt) return [];
  const completed = Date.parse(enrollment.completedAt);
  const award = (n: number, issued: number): DemoAward => {
    const id = `${enrollment.id}-cert-${n}`;
    return {
      id,
      tenantId: enrollment.tenantId,
      userId: enrollment.userId,
      enrollmentId: enrollment.id,
      courseTitle: enrollment.courseTitle,
      courseVersion: enrollment.courseVersion,
      completedAt: enrollment.completedAt!,
      issuedAt: iso(issued),
      expiresAt: plan.noExpiry ? null : iso(completed + YEAR),
      status: 'valid',
      revokedAt: null,
      revokedReason: null,
      supersededAt: null,
      replacedByAwardId: null,
      verificationId: insecureDemoVerificationId(id),
    };
  };
  const first = award(1, completed + 60_000);
  if (plan.revokedAfterDays !== undefined) {
    return [
      {
        ...first,
        status: 'revoked',
        revokedAt: iso(completed + plan.revokedAfterDays * DAY),
        revokedReason: DEMO_REVOCATION_REASON,
      },
    ];
  }
  if (plan.reissuedAfterDays !== undefined) {
    const reissued = completed + plan.reissuedAfterDays * DAY;
    const second = award(2, reissued);
    return [
      { ...first, status: 'superseded', supersededAt: iso(reissued), replacedByAwardId: second.id },
      second,
    ];
  }
  return [first];
}

/** The award a learner holds now for an enrollment: the latest one neither superseded nor revoked. */
export function currentAward(enrollment: DemoEnrollment): DemoAward | null {
  return demoAwards(enrollment).findLast((a) => a.status === 'valid') ?? null;
}

export const issuerName = (tenantId: string) =>
  DEMO_TENANTS.find((t) => t.tenantId === tenantId)?.tenantName ?? 'Unknown issuer';

/** Display names of the demo learners (the session holds the signed-in user's own). */
export const DEMO_LEARNER_NAMES: Record<string, string> = {
  'demo-user': 'Demo User',
  'demo-other-learner': 'Other Learner',
};
