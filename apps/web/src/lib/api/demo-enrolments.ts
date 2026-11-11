import { cookies } from 'next/headers';

/*
 * Demo enrolments from the catalog (D-110): course ids in an httpOnly cookie, so the demo can show a new enrolment in
 * My learning and the player. Never sent to the API and never trusted for anything but choosing sample data; Phase 4
 * replaces it with POST /api/v1/me/enrollments.
 */

export const DEMO_ENROLMENTS_COOKIE = 'vl_demo_enrolments';
const MAX = 20;
const COURSE_ID = /^[a-z0-9-]{1,64}$/;

export function parseDemoEnrolments(raw: string | undefined): string[] {
  if (!raw) return [];
  return [...new Set(raw.split(',').filter((id) => COURSE_ID.test(id)))].slice(0, MAX);
}

/** The demo enrolments in this browser; empty outside a request (tests, build). */
export async function readDemoEnrolments(): Promise<string[]> {
  try {
    return parseDemoEnrolments((await cookies()).get(DEMO_ENROLMENTS_COOKIE)?.value);
  } catch {
    return [];
  }
}

export function addDemoEnrolment(current: readonly string[], courseId: string): string {
  return [...new Set([...current, courseId])].slice(-MAX).join(',');
}
