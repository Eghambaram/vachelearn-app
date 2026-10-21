import {
  AssessmentSummary,
  CourseDraft,
  type AssessmentSummary as AssessmentSummaryData,
  type CourseDraft as CourseDraftData,
} from '@vachelearn/contracts';
import { demoCourses } from '@/mocks/courses';
import { demoAssessments, demoDraftFor, emptyDraft } from '@/mocks/course-draft';
import { demoError, type ApiResult, type DemoState } from './client';
import { getSession } from './session';

/*
 * GET /api/v1/courses/:id/draft (Phase 3) — the editable draft of one course, for `course.update`. Tenant from the
 * session: a course id from another tenant is "not found" (404), never "forbidden", so its existence does not leak.
 * Phase 1 serves demo drafts; edits stay in the page (D-067).
 */

export type BuilderData = {
  draft: CourseDraftData;
  assessments: AssessmentSummaryData[];
  archived: boolean;
};

function notFound(): ApiResult<never> {
  return {
    ok: false,
    status: 404,
    error: { code: 'NOT_FOUND', message: 'Not found', requestId: 'req_demo_0404' },
  };
}

export async function getCourseDraft(
  courseId: string,
  { demoState = 'ready', now = new Date() }: { demoState?: DemoState; now?: Date } = {},
): Promise<ApiResult<BuilderData>> {
  const session = await getSession();
  const tenantId = session.activeTenantId;
  if (demoState === 'forbidden' || !tenantId) return demoError(403);
  const canEdit = session.permissions.includes(
    courseId === 'new' ? 'course.create' : 'course.update',
  );
  if (!canEdit) return demoError(403);
  if (demoState === 'error') return demoError(500);

  const assessments = demoAssessments(tenantId).map((a) => AssessmentSummary.parse(a));
  if (courseId === 'new') {
    return {
      ok: true,
      data: { draft: CourseDraft.parse(emptyDraft()), assessments, archived: false },
    };
  }
  const course = demoCourses(tenantId, now).find((c) => c.id === courseId);
  if (!course) return notFound();
  return {
    ok: true,
    data: {
      draft: CourseDraft.parse(demoDraftFor(course, tenantId)),
      assessments,
      archived: course.status === 'archived',
    },
  };
}
