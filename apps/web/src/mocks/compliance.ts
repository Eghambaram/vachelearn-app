import { complianceStatus, type ComplianceStatus } from '@vachelearn/contracts';
import { DEMO_BRANCHES, demoBranchId } from './demo-session';
import { DAY, zonedDate, zonedMidnight } from './time';

/*
 * Phase 1 demo compliance data (slice 1.5.8): 30 learners per tenant across three branches — every fifth also works at
 * a second branch (D-026) — and four training requirements. Each learner × requirement gets deterministic evidence
 * (completion, validity, progress) relative to `now`; the status is then computed with the shared D-018 rule, exactly
 * as the API will compute it. Replaced by the compliance module in Phase 5.
 */

export type DemoLearner = {
  id: string;
  name: string;
  /** Primary branch first (D-026). */
  branchIds: string[];
};

type Requirement = {
  key: string;
  courseTitle: string;
  /** Branch keys the requirement applies to; null = everyone in the tenant. */
  appliesTo: readonly string[] | null;
  /** Due date for learners who have not complied, in days from today; null = no due date. */
  dueInDays: number | null;
  /** How long a completion stays valid, in days; null = never expires. */
  validForDays: number | null;
};

const REQUIREMENTS: readonly Requirement[] = [
  {
    key: 'fire',
    courseTitle: 'Fire Safety Refresher (Demo)',
    appliesTo: null,
    dueInDays: 20,
    validForDays: 365,
  },
  {
    key: 'forklift',
    courseTitle: 'Forklift Operation Basics (Demo)',
    appliesTo: ['a1', 'a2'],
    dueInDays: -5,
    validForDays: null,
  },
  {
    key: 'firstaid',
    courseTitle: 'First Aid Essentials (Demo)',
    appliesTo: null,
    dueInDays: 60,
    validForDays: 365,
  },
  {
    key: 'loto',
    courseTitle: 'Lockout / Tagout (Demo)',
    appliesTo: ['a1'],
    dueInDays: null,
    validForDays: null,
  },
];

const LEARNER_COUNT = 30;

export function demoLearners(tenantId: string): DemoLearner[] {
  return Array.from({ length: LEARNER_COUNT }, (_, i) => {
    const primary = DEMO_BRANCHES[i % DEMO_BRANCHES.length]!.key;
    const extra = i % 5 === 4 ? DEMO_BRANCHES[(i + 1) % DEMO_BRANCHES.length]!.key : null;
    return {
      id: `${tenantId}-learner-${String(i + 1).padStart(2, '0')}`,
      name: `Demo Learner ${String(i + 1).padStart(2, '0')}`,
      branchIds: [primary, ...(extra ? [extra] : [])].map((key) => demoBranchId(tenantId, key)),
    };
  });
}

/** Requirement courses with their audience: branch ids, or null for the whole tenant. */
export const demoRequirementCourses = (tenantId: string) =>
  REQUIREMENTS.map((r) => ({
    id: `${tenantId}-req-${r.key}`,
    name: r.courseTitle,
    audienceBranchIds: r.appliesTo?.map((key) => demoBranchId(tenantId, key)) ?? null,
  }));

export type DemoComplianceRecord = {
  id: string;
  learner: DemoLearner;
  courseId: string;
  courseTitle: string;
  status: ComplianceStatus;
  dueOn: string | null;
  completedOn: string | null;
  validThrough: string | null;
  progressPercent: number;
};

/**
 * Evidence pattern per learner × requirement (0–9): completed recently, completed long ago (validity ending soon or
 * already over for expiring requirements), in progress, or not started.
 */
function evidence(pattern: number, requirement: Requirement) {
  if (pattern <= 3) return { completedDaysAgo: 30 + pattern * 20, progress: 100 };
  if (pattern === 4) return { completedDaysAgo: 350, progress: 100 }; // validity ends within 30 days
  if (pattern === 5)
    return { completedDaysAgo: requirement.validForDays ? 400 : 200, progress: 100 }; // expired
  if (pattern <= 7) return { completedDaysAgo: null, progress: 20 + pattern * 5 };
  return { completedDaysAgo: null, progress: 0 };
}

export function demoComplianceRecords(tenantId: string, now: Date): DemoComplianceRecord[] {
  const today = zonedDate(now.getTime());
  const midnight = zonedMidnight(today);
  const day = (offset: number) => zonedDate(midnight + offset * DAY);
  return demoLearners(tenantId).flatMap((learner, i) =>
    REQUIREMENTS.map((requirement, r) => {
      // Applicability uses all of the learner's branches, including ones outside a viewer's scope (D-026 note).
      const applicable =
        requirement.appliesTo === null ||
        learner.branchIds.some((id) =>
          requirement.appliesTo!.some((key) => id === demoBranchId(tenantId, key)),
        );
      const { completedDaysAgo, progress } = evidence((i * 7 + r * 3) % 10, requirement);
      const completed = applicable && completedDaysAgo !== null;
      const completedOn = completed ? day(-completedDaysAgo!) : null;
      const validThrough =
        completed && requirement.validForDays !== null
          ? day(-completedDaysAgo! + requirement.validForDays)
          : null;
      const dueOn =
        applicable && !completed && requirement.dueInDays !== null
          ? day(requirement.dueInDays)
          : null;
      return {
        id: `${learner.id}:${requirement.key}`,
        learner,
        courseId: `${tenantId}-req-${requirement.key}`,
        courseTitle: requirement.courseTitle,
        status: complianceStatus({ applicable, completed, validThrough, dueOn }, today),
        dueOn,
        completedOn,
        validThrough,
        progressPercent: applicable ? progress : 0,
      };
    }),
  );
}
