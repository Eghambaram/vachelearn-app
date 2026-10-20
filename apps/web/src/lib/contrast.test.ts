import { contrastRatio, relativeLuminance } from './contrast';

describe('contrast', () => {
  it('gives the WCAG extremes', () => {
    expect(contrastRatio('#000000', '#ffffff')).toBeCloseTo(21, 5);
    expect(contrastRatio('#777777', '#777777')).toBeCloseTo(1, 5);
  });

  it('is symmetric and case-insensitive', () => {
    expect(contrastRatio('#0F6E56', '#ffffff')).toBeCloseTo(
      contrastRatio('#FFFFFF', '#0f6e56'),
      10,
    );
  });

  it('matches a known reference value (#767676 on white is the classic 4.54:1)', () => {
    expect(contrastRatio('#767676', '#ffffff')).toBeCloseTo(4.54, 2);
  });

  it('rejects anything that is not #rrggbb', () => {
    expect(() => relativeLuminance('red')).toThrow();
    expect(() => relativeLuminance('#fff')).toThrow();
  });
});
