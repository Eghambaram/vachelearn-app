import type { ReactNode } from 'react';
import { LessonFocus } from '@/features/learn/player/lesson-focus';

/** Stays mounted while the learner moves between lessons of one enrollment (focus management on lesson change). */
export default function EnrollmentLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <LessonFocus />
      {children}
    </>
  );
}
