'use client';

import * as React from 'react';
import { usePathname } from 'next/navigation';

/**
 * Moves focus to the lesson heading when the learner changes lesson (next/previous or the lesson tree), so keyboard
 * and screen-reader users land on the new lesson instead of the top of the page and the 25-link tree. Lives in the
 * enrollment layout, which stays mounted across lessons; the first page load keeps the browser's default focus.
 */
export function LessonFocus() {
  const pathname = usePathname();
  const first = React.useRef(true);
  React.useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    requestAnimationFrame(() => document.getElementById('lesson-heading')?.focus());
  }, [pathname]);
  return null;
}
