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
  return listCourses(query, { demoState: session.demo ? parseDemoState(demoState) : 'ready' });
}
