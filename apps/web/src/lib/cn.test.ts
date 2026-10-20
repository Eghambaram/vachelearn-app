import { cn } from './cn';

describe('cn', () => {
  it('joins truthy class names with single spaces', () => {
    expect(cn('a', 'b')).toBe('a b');
  });

  it('skips false, null, undefined and empty strings', () => {
    expect(cn('a', false, null, undefined, '', 'b')).toBe('a b');
  });
});
