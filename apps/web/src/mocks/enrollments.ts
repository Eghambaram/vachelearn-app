import type { EnrollmentLifecycle } from '@vachelearn/contracts';
import { DAY, zonedDate, zonedMidnight } from './time';

/*
 * Phase 1 demo enrollments (learner workspace). Deterministic for a tenant and `now`; titles are the demo course
 * titles. The fixture deliberately also holds another learner's enrollments so the "own records only" rule is tested,
 * not assumed. Replaced by the API in Phase 4 (enrollments, progress, certificates).
 */

export type DemoEnrollment = {
  id: string;
  tenantId: string;
  userId: string;
  courseTitle: string;
  courseVersion: number;
  status: EnrollmentLifecycle;
  dueOn: string | null;
  progressPercent: number;
  nextLessonTitle: string | null;
  lastActivityAt: string | null;
  completedAt: string | null;
  certificate: { awardId: string; issuedAt: string } | null;
};

type Row = [
  title: string,
  status: EnrollmentLifecycle,
  dueInDays: number | null,
  progress: number,
  nextLesson: string | null,
  activeDaysAgo: number | null,
  certificate: boolean,
];

/** [title, status, due in N days (negative = past), progress %, next lesson, last activity N days ago, certificate] */
const MINE: Row[] = [
  ['Fire Safety Refresher (Demo)', 'in_progress', 3, 60, 'Lesson 2.1 (Demo)', 0.2, false],
  ['Forklift Operation Basics (Demo)', 'in_progress', -2, 30, 'Lesson 1.3 (Demo)', 4, false],
  ['Hazard Identification (Demo)', 'in_progress', 12, 75, 'Lesson 4.2 (Demo)', 1, false],
  ['PPE and Equipment (Demo)', 'not_started', 9, 0, null, null, false],
  ['Machine Guarding (Demo)', 'not_started', -6, 0, null, null, false],
  ['Lockout / Tagout (Demo)', 'not_started', null, 0, null, null, false],
  ['First Aid Essentials (Demo)', 'completed', null, 100, null, 6, true],
  ['Working at Height (Demo)', 'completed', null, 100, null, 18, false],
  ['Chemical Handling (Demo)', 'completed', null, 100, null, 33, true],
  ['Confined Space Entry (Demo)', 'cancelled', 5, 10, null, 40, false],
];

/** Another learner in the same tenant: must never appear on Demo User's dashboard. */
const SOMEONE_ELSE: Row[] = [
  ['Electrical Safety (Demo)', 'in_progress', 1, 90, 'Lesson 3.1 (Demo)', 0.1, false],
  ['Crane Signalling (Demo)', 'completed', null, 100, null, 2, true],
];

function build(tenantId: string, userId: string, rows: Row[], now: number): DemoEnrollment[] {
  const today = zonedMidnight(zonedDate(now));
  return rows.map(
    ([courseTitle, status, dueIn, progressPercent, nextLessonTitle, activeAgo, cert], i) => {
      const lastActivityAt =
        activeAgo === null ? null : new Date(now - activeAgo * DAY).toISOString();
      const completedAt = status === 'completed' ? lastActivityAt : null;
      return {
        id: `${tenantId}-${userId}-enr-${String(i + 1).padStart(2, '0')}`,
        tenantId,
        userId,
        courseTitle,
        courseVersion: 1 + (i % 3),
        status,
        dueOn: dueIn === null ? null : zonedDate(today + dueIn * DAY),
        progressPercent,
        nextLessonTitle,
        lastActivityAt,
        completedAt,
        certificate:
          cert && completedAt
            ? {
                awardId: `${tenantId}-${userId}-cert-${i + 1}`,
                issuedAt: new Date(Date.parse(completedAt) + 60_000).toISOString(),
              }
            : null,
      };
    },
  );
}

/** Every demo enrollment in a tenant (all learners). Callers must filter to the session user. */
export function demoEnrollments(tenantId: string, now: Date): DemoEnrollment[] {
  const t = now.getTime();
  return [
    ...build(tenantId, 'demo-user', MINE, t),
    ...build(tenantId, 'demo-other-learner', SOMEONE_ELSE, t),
  ];
}
