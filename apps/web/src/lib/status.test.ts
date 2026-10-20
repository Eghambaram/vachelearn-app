import { en } from '@/messages/en';
import { STATUS_VOCABULARY, statusTone, type StatusEntity } from './status';

const entries = (Object.keys(STATUS_VOCABULARY) as StatusEntity[]).flatMap((entity) =>
  Object.keys(STATUS_VOCABULARY[entity]).map((status) => [entity, status] as const),
);

describe('status vocabulary', () => {
  it('covers every entity in the UI spec', () => {
    expect(Object.keys(STATUS_VOCABULARY).sort()).toEqual([
      'attempt',
      'attendance',
      'certificate',
      'compliance',
      'course',
      'enrollment',
      'job',
      'order',
      'tenant',
    ]);
  });

  it.each(entries)('%s.%s has an English label', (entity, status) => {
    const labels = en.status[entity] as Record<string, string>;
    expect(labels[status]).toMatch(/^[A-Z]/);
  });

  it('has exactly the same keys in the tone map and the labels', () => {
    for (const entity of Object.keys(STATUS_VOCABULARY) as StatusEntity[]) {
      expect(Object.keys(en.status[entity]).sort()).toEqual(
        Object.keys(STATUS_VOCABULARY[entity]).sort(),
      );
    }
  });

  // Tones fixed by .claude/rules/web.md (Status language and colours).
  it.each([
    ['course', 'published', 'success'],
    ['tenant', 'active', 'success'],
    ['compliance', 'compliant', 'success'],
    ['enrollment', 'completed', 'success'],
    ['course', 'draft', 'neutral'],
    ['enrollment', 'not_started', 'neutral'],
    ['enrollment', 'in_progress', 'info'],
    ['compliance', 'due_soon', 'warning'],
    ['course', 'under_review', 'warning'],
    ['tenant', 'trial', 'warning'],
    ['enrollment', 'overdue', 'danger'],
    ['tenant', 'suspended', 'danger'],
    ['attempt', 'failed', 'danger'],
    ['certificate', 'revoked', 'danger'],
    ['course', 'archived', 'muted'],
    ['enrollment', 'cancelled', 'muted'],
  ] as const)('%s.%s is %s (web rule)', (entity, status, tone) => {
    expect(statusTone(entity, status as never)).toBe(tone);
  });
});
