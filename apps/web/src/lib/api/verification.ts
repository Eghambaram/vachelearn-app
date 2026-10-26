import {
  CertificateVerification,
  certificateDisplayStatus,
  maskHolderName,
  normalizeVerificationId,
  type CertificateVerification as CertificateVerificationData,
} from '@vachelearn/contracts';
import { calendarDateIn } from '@/lib/format';
import { DEMO_LEARNER_NAMES, demoAwards, issuerName } from '@/mocks/certificates';
import { DEMO_TENANTS } from '@/mocks/demo-session';
import { demoEnrollments } from '@/mocks/enrollments';
import { DEMO_TENANT_ZONE } from '@/mocks/tenant-dashboard';
import { demoError, type ApiResult, type DemoState } from './client';

/*
 * Public certificate verification: GET /api/v1/public/certificates/:verificationId (no session, rate-limited in
 * Phase 4). The verification id is the only key and is globally unique (D-075), so the lookup spans tenants by design
 * and returns only what D-017 allows — the strict contract refuses anything more. A malformed id and an unknown id
 * get the same 404, so the endpoint never says whether an id once existed.
 */

const NOT_FOUND: ApiResult<never> = {
  ok: false,
  status: 404,
  error: { code: 'NOT_FOUND', message: 'Not found', requestId: 'req_demo_0404' },
};

export async function verifyCertificate(
  input: string,
  { demoState = 'ready', now = new Date() }: { demoState?: DemoState; now?: Date } = {},
): Promise<ApiResult<CertificateVerificationData>> {
  if (demoState === 'error') return demoError(500);
  const verificationId = normalizeVerificationId(input);
  if (!verificationId) return NOT_FOUND;
  const award = DEMO_TENANTS.flatMap((t) => demoEnrollments(t.tenantId, now))
    .flatMap((e) => demoAwards(e))
    .find((a) => a.verificationId === verificationId);
  if (!award) return NOT_FOUND;
  const day = (instant: string | null) =>
    instant ? calendarDateIn(instant, DEMO_TENANT_ZONE) : null;
  return {
    ok: true,
    data: CertificateVerification.parse({
      verificationId,
      status: certificateDisplayStatus(award.status, award.expiresAt, now),
      courseTitle: award.courseTitle,
      issuerName: issuerName(award.tenantId),
      holderMaskedName: maskHolderName(DEMO_LEARNER_NAMES[award.userId] ?? ''),
      issuedOn: day(award.issuedAt),
      expiresOn: day(award.expiresAt),
      // D-017: the date only — the reason stays internal.
      revokedOn: day(award.revokedAt),
      checkedAt: now.toISOString(),
    }),
  };
}
