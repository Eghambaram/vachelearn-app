'use client';

import { useApiAction } from '@/lib/use-api-action';
import { peopleErrorMessage } from './messages';

export type { ActionFailure } from '@/lib/use-api-action';

/** A change to a member from the user detail page, with the people screens' error copy. */
export const useMemberAction = () => useApiAction(peopleErrorMessage);
