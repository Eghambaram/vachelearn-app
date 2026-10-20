import { cn } from './utils';

describe('cn', () => {
  it('joins truthy class names and skips falsy ones', () => {
    expect(cn('a', false, null, undefined, '', 'b')).toBe('a b');
  });

  it('lets a later Tailwind utility override a conflicting earlier one', () => {
    expect(cn('px-2 text-sm', 'px-4')).toBe('text-sm px-4');
  });
});
