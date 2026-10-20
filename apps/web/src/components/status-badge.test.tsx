import { render, screen } from '@testing-library/react';
import { STATUS_VOCABULARY, type StatusEntity } from '@/lib/status';
import { en } from '@/messages/en';
import { StatusBadge } from './status-badge';

const all = (Object.keys(STATUS_VOCABULARY) as StatusEntity[]).flatMap((entity) =>
  Object.entries(STATUS_VOCABULARY[entity]).map(
    ([status, tone]) => [entity, status, tone] as const,
  ),
);

describe('StatusBadge', () => {
  it.each(all)('%s.%s renders its exact label with tone %s and an icon', (entity, status, tone) => {
    const { container } = render(<StatusBadge entity={entity} status={status as never} />);
    const label = (en.status[entity] as Record<string, string>)[status]!;
    const badge = screen.getByText(label);
    expect(badge).toHaveAttribute('data-tone', tone);
    // Icon is decorative: the text is the accessible status (never colour alone).
    expect(container.querySelector('svg')).toHaveAttribute('aria-hidden', 'true');
  });

  it('accepts a translated label', () => {
    render(<StatusBadge entity="enrollment" status="overdue" label="अतिदेय" />);
    expect(screen.getByText('अतिदेय')).toHaveAttribute('data-tone', 'danger');
  });

  it('rejects statuses outside the vocabulary at compile time', () => {
    // @ts-expect-error — 'shipped' is not a course status
    const element = <StatusBadge entity="course" status="shipped" />;
    expect(element).toBeTruthy();
  });
});
