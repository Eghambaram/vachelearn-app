import { readFileSync } from 'node:fs';
import path from 'node:path';

/** Path of the token file, relative to the web app root (the cwd of `next` and `vitest`). */
export const TOKENS_CSS_PATH = path.join('src', 'styles', 'tokens.css');

/** Parses `--vl-color-<name>: #rrggbb;` declarations from tokens.css. Server/test only (reads the file system). */
export function readColorTokens(cwd: string = process.cwd()): Record<string, string> {
  const css = readFileSync(path.join(cwd, TOKENS_CSS_PATH), 'utf8');
  const tokens: Record<string, string> = {};
  for (const match of css.matchAll(/--vl-color-([a-z0-9-]+):\s*(#[0-9a-fA-F]{6})\s*;/g)) {
    const [, name, value] = match;
    if (name && value) tokens[name] = value.toLowerCase();
  }
  return tokens;
}

export type ContrastPair = {
  foreground: string;
  background: string;
  /** 4.5 for normal text; 3 for large text, icons, focus indicators and control boundaries. */
  minimum: 4.5 | 3;
  use: string;
};

/** Every colour pairing the UI is allowed to use. tokens.contrast.test.ts enforces each minimum. */
export const CONTRAST_PAIRS: readonly ContrastPair[] = [
  { foreground: 'text', background: 'bg', minimum: 4.5, use: 'Body text on app background' },
  { foreground: 'text', background: 'surface', minimum: 4.5, use: 'Body text on cards' },
  {
    foreground: 'text',
    background: 'surface-subtle',
    minimum: 4.5,
    use: 'Text on secondary buttons / hover rows',
  },
  { foreground: 'text', background: 'border', minimum: 4.5, use: 'Secondary button text on hover' },
  {
    foreground: 'text-muted',
    background: 'bg',
    minimum: 4.5,
    use: 'Secondary text on app background',
  },
  { foreground: 'text-muted', background: 'surface', minimum: 4.5, use: 'Secondary text on cards' },
  {
    foreground: 'text-muted',
    background: 'surface-subtle',
    minimum: 4.5,
    use: 'Muted text on muted surfaces',
  },
  { foreground: 'primary', background: 'bg', minimum: 4.5, use: 'Links on app background' },
  { foreground: 'primary', background: 'surface', minimum: 4.5, use: 'Links on cards' },
  { foreground: 'on-primary', background: 'primary', minimum: 4.5, use: 'Primary button text' },
  {
    foreground: 'on-primary',
    background: 'primary-hover',
    minimum: 4.5,
    use: 'Primary button text on hover',
  },
  {
    foreground: 'on-accent',
    background: 'accent',
    minimum: 4.5,
    use: 'Dark text on amber highlight',
  },
  {
    foreground: 'brand',
    background: 'surface',
    minimum: 3,
    use: 'Brand green: large text and icons only',
  },
  {
    foreground: 'border-input',
    background: 'surface',
    minimum: 3,
    use: 'Form control boundary on cards',
  },
  {
    foreground: 'border-input',
    background: 'bg',
    minimum: 3,
    use: 'Form control boundary on app background',
  },
  { foreground: 'primary', background: 'surface', minimum: 3, use: 'Focus ring on cards' },
  { foreground: 'primary', background: 'bg', minimum: 3, use: 'Focus ring on app background' },
  { foreground: 'on-sidebar', background: 'sidebar', minimum: 4.5, use: 'Sidebar text' },
  {
    foreground: 'on-sidebar-muted',
    background: 'sidebar',
    minimum: 4.5,
    use: 'Sidebar secondary text',
  },
  {
    foreground: 'on-sidebar',
    background: 'sidebar-active',
    minimum: 4.5,
    use: 'Active sidebar item text',
  },
  {
    foreground: 'focus-ring-inverse',
    background: 'sidebar',
    minimum: 3,
    use: 'Focus ring in the sidebar',
  },
  {
    foreground: 'focus-ring-inverse',
    background: 'sidebar-active',
    minimum: 3,
    use: 'Focus ring on active sidebar item',
  },
  {
    foreground: 'neutral-700',
    background: 'surface-subtle',
    minimum: 4.5,
    use: 'Neutral status badge',
  },
  {
    foreground: 'success-700',
    background: 'success-50',
    minimum: 4.5,
    use: 'Success status badge',
  },
  {
    foreground: 'warning-700',
    background: 'warning-50',
    minimum: 4.5,
    use: 'Warning status badge',
  },
  {
    foreground: 'danger-700',
    background: 'danger-50',
    minimum: 4.5,
    use: 'Danger status badge / destructive button',
  },
  { foreground: 'info-700', background: 'info-50', minimum: 4.5, use: 'Info status badge' },
  {
    foreground: 'success-700',
    background: 'surface',
    minimum: 4.5,
    use: 'Success message text on cards',
  },
  {
    foreground: 'warning-700',
    background: 'surface',
    minimum: 4.5,
    use: 'Warning message text on cards',
  },
  {
    foreground: 'danger-700',
    background: 'surface',
    minimum: 4.5,
    use: 'Error message text on cards',
  },
  {
    foreground: 'info-700',
    background: 'surface',
    minimum: 4.5,
    use: 'Info message text on cards',
  },
  {
    foreground: 'on-primary',
    background: 'danger-700',
    minimum: 4.5,
    use: 'Destructive button text on hover',
  },
];
