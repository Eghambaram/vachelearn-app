import {
  courseProgress,
  resumeLesson,
  type EnrollmentLifecycle,
  type PlayerModule,
} from '@vachelearn/contracts';
import { demoOutline } from './course-player';
import { DAY, zonedDate, zonedMidnight } from './time';

/*
 * Phase 1 demo enrollments (learner workspace). Deterministic for a tenant and `now`; titles are the demo course
 * titles. The fixture deliberately also holds another learner's enrollments so the "own records only" rule is tested,
 * not assumed. Progress and the next lesson are derived from the course outline (`demoOutline`), exactly as the
 * server derives them from lesson progress, so the dashboard and the player agree. Replaced by the API in Phase 4.
 */

export type DemoEnrollment = {
  id: string;
  tenantId: string;
  userId: string;
  courseTitle: string;
  courseVersion: number;
  /** Seeds the demo outline and lesson content. */
  seed: number;
  status: EnrollmentLifecycle;
  dueOn: string | null;
  progressPercent: number;
  nextLessonTitle: string | null;
  /** The pinned version's modules with this enrollment's lesson progress. */
  modules: PlayerModule[];
  lastActivityAt: string | null;
  completedAt: string | null;
};

type Row = [
  title: string,
  status: EnrollmentLifecycle,
  dueInDays: number | null,
  progress: number,
  activeDaysAgo: number | null,
];

/**
 * [title, status, due in N days (negative = past), progress %, last activity N days ago]. Certificates live in
 * `certificates.ts`.
 */
const MINE: Row[] = [
  ['Fire Safety Refresher (Demo)', 'in_progress', 3, 60, 0.2],
  ['Forklift Operation Basics (Demo)', 'in_progress', -2, 30, 4],
  ['Hazard Identification (Demo)', 'in_progress', 12, 75, 1],
  ['PPE and Equipment (Demo)', 'not_started', 9, 0, null],
  ['Machine Guarding (Demo)', 'not_started', -6, 0, null],
  ['Lockout / Tagout (Demo)', 'not_started', null, 0, null],
  ['First Aid Essentials (Demo)', 'completed', null, 100, 6],
  ['Working at Height (Demo)', 'completed', null, 100, 18],
  ['Chemical Handling (Demo)', 'completed', null, 100, 33],
  ['Confined Space Entry (Demo)', 'cancelled', 5, 10, 40],
  // Older completions, outside the dashboard's recent three: an expired and a revoked certificate (slice 1.5.7).
  ['Electrical Isolation (Demo)', 'completed', null, 100, 400],
  ['Hot Work Permits (Demo)', 'completed', null, 100, 90],
];

/** Another learner in the same tenant: must never appear on Demo User's dashboard. */
const SOMEONE_ELSE: Row[] = [
  ['Electrical Safety (Demo)', 'in_progress', 1, 90, 0.1],
  ['Crane Signalling (Demo)', 'completed', null, 100, 2],
];

function build(tenantId: string, userId: string, rows: Row[], now: number): DemoEnrollment[] {
  const today = zonedMidnight(zonedDate(now));
  return rows.map(([courseTitle, status, dueIn, targetPercent, activeAgo], i) => {
    const lastActivityAt =
      activeAgo === null ? null : new Date(now - activeAgo * DAY).toISOString();
    const completedAt = status === 'completed' ? lastActivityAt : null;
    const courseVersion = 1 + (i % 3);
    const slug = courseTitle
      .replace(/ \(Demo\)$/, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-');
    const modules = demoOutline({
      courseKey: `${tenantId}-${slug}-v${courseVersion}`,
      seed: i,
      status,
      targetPercent,
    });
    return {
      id: `${tenantId}-${userId}-enr-${String(i + 1).padStart(2, '0')}`,
      tenantId,
      userId,
      courseTitle,
      courseVersion,
      seed: i,
      status,
      dueOn: dueIn === null ? null : zonedDate(today + dueIn * DAY),
      progressPercent: courseProgress(modules.flatMap((m) => m.lessons)).percent,
      nextLessonTitle: status === 'in_progress' ? resumeLesson(modules).title : null,
      modules,
      lastActivityAt,
      completedAt,
    };
  });
}

/** Every demo enrollment in a tenant (all learners). Callers must filter to the session user. */
export function demoEnrollments(tenantId: string, now: Date): DemoEnrollment[] {
  const t = now.getTime();
  return [
    ...build(tenantId, 'demo-user', MINE, t),
    ...build(tenantId, 'demo-other-learner', SOMEONE_ELSE, t),
  ];
}
