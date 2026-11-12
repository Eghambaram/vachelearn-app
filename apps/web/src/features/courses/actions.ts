'use server';

import { parseDemoState } from '@/lib/api/client';
import { listCourses } from '@/lib/api/courses';
import { getSession } from '@/lib/api/session';

/**
 * Course list requests from the browser. A server action is a public endpoint: it re-validates everything through
 * `listCourses`, which takes the tenant from the session and checks `course.read`. Phase 2 forwards to the API.
 */
export async function listCoursesAction(query: unknown, demoState: unknown) {
  const session = await getSession();
  // A real session without demo content has no courses yet (D-097): the action is a public endpoint, so it says so
  // itself rather than relying on the page (exit-gate security review).
  if (!session.demo && !session.demoContent) {
    return {
      ok: false as const,
      status: 404,
      error: { code: 'NOT_FOUND', message: 'Not found', requestId: 'req_demo_0404' },
    };
  }
  return listCourses(query, { demoState: session.demo ? parseDemoState(demoState) : 'ready' });
}
