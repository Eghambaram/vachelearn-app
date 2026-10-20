import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';

const SRC = path.join(process.cwd(), 'src');
const ALLOWED = new Set([path.join(SRC, 'styles', 'tokens.css')]);

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return sourceFiles(full);
    if (!/\.(tsx?|css|mjs)$/.test(entry.name) || /\.test\.tsx?$/.test(entry.name)) return [];
    return ALLOWED.has(full) ? [] : [full];
  });
}

describe('colour discipline', () => {
  const files = sourceFiles(SRC);

  it('scans the source tree', () => {
    expect(files.length).toBeGreaterThan(5);
  });

  it.each(files.map((f) => [path.relative(SRC, f), f]))(
    '%s uses tokens, not raw colour values',
    (_name, file) => {
      const text = readFileSync(file, 'utf8');
      expect(text).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
      expect(text).not.toMatch(/\b(?:rgba?|hsla?|oklch|oklab|lab|lch)\(/);
    },
  );
});
