'use server';

import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { getCatalogCourse } from '@/lib/api/catalog';
import {
  addDemoEnrolment,
  DEMO_ENROLMENTS_COOKIE,
  readDemoEnrolments,
} from '@/lib/api/demo-enrolments';
import { catalogEnrollmentId } from '@/mocks/enrollments';

/**
 * Demo self-enrolment (D-110): only for a learner (`enrollment.self_enroll`) and a course in their tenant's catalog;
 * remembered in this browser, never on the server. Then opens the course. Phase 4 replaces it with the API.
 */
export async function enrolInDemoCourse(formData: FormData): Promise<void> {
  const courseId = formData.get('courseId');
  if (typeof courseId !== 'string') redirect('/learn/catalog');
  const course = await getCatalogCourse(courseId);
  if (!course.ok || !course.data.canSelfEnrol) redirect('/learn/catalog');
  if (course.data.enrollment) redirect(`/learn/courses/${course.data.enrollment.id}`);
  (await cookies()).set(
    DEMO_ENROLMENTS_COOKIE,
    addDemoEnrolment(await readDemoEnrolments(), courseId),
    {
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      path: '/',
    },
  );
  redirect(`/learn/courses/${catalogEnrollmentId(courseId)}?enrolled=1`);
}
