import { contrastRatio } from '@/lib/contrast';
import { CONTRAST_PAIRS, readColorTokens } from './tokens';

const tokens = readColorTokens();

describe('design tokens', () => {
  it('declares every colour as #rrggbb in tokens.css', () => {
    expect(Object.keys(tokens).length).toBeGreaterThanOrEqual(25);
  });

  it.each(CONTRAST_PAIRS)(
    '$foreground on $background meets $minimum:1 ($use)',
    ({ foreground, background, minimum }) => {
      const fg = tokens[foreground];
      const bg = tokens[background];
      expect(fg, `missing token --vl-color-${foreground}`).toBeDefined();
      expect(bg, `missing token --vl-color-${background}`).toBeDefined();
      expect(contrastRatio(fg!, bg!)).toBeGreaterThanOrEqual(minimum);
    },
  );

  it('documents why the primary colour is not used as the sidebar focus ring', () => {
    expect(contrastRatio(tokens['primary']!, tokens['sidebar']!)).toBeLessThan(3);
  });
});
