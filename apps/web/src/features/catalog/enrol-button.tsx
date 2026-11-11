'use client';

import { useFormStatus } from 'react-dom';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { getMessages } from '@/lib/i18n';
import { enrolInDemoCourse } from './actions';

// English only for now (D-028); becomes per-request when a second language is added.
const t = getMessages();

function Submit() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" size="lg" className="w-full" disabled={pending}>
      {pending ? <Loader2 aria-hidden="true" className="animate-spin" /> : null}
      {pending ? t.catalog.enrolling : t.catalog.enrol}
    </Button>
  );
}

/** Demo self-enrolment (D-110): a plain form, so it works before JavaScript loads. */
export function EnrolButton({ courseId }: { courseId: string }) {
  return (
    <form action={enrolInDemoCourse}>
      <input type="hidden" name="courseId" value={courseId} />
      <Submit />
    </form>
  );
}
