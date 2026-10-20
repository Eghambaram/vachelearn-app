import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';

const SRC = path.join(process.cwd(), 'src');

function files(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return files(full);
    return /\.(tsx?|css)$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name) ? [full] : [];
  });
}

const sources = files(SRC).map((file) => ({ file, text: readFileSync(file, 'utf8') }));

// Declared anywhere: `--x:` in CSS, `[--x:` Tailwind arbitrary properties, or `'--x':` / "--x": in inline styles.
const declared = new Set<string>();
for (const { text } of sources) {
  for (const m of text.matchAll(/(?:^|[\s;{[('"])(--[a-z0-9-]+)\s*['"]?\s*:/gm))
    declared.add(m[1]!);
}

// Provided at runtime by libraries or Tailwind itself.
const RUNTIME = /^--(?:radix-|accordion-|tw-|spacing$|normal-|border-radius$)/;

describe('CSS custom properties', () => {
  const used = sources.flatMap(({ file, text }) =>
    [...text.matchAll(/var\((--[a-z0-9-]+)|\((--[a-z0-9-]+)\)/g)].map((m) => ({
      file: path.relative(SRC, file),
      name: (m[1] ?? m[2])!,
    })),
  );

  it('finds variable references to check', () => {
    expect(used.length).toBeGreaterThan(20);
  });

  it('every var(--x) used in src is declared in src (no silently missing shadcn variables)', () => {
    // Names ending in '-' are template-string prefixes (e.g. `var(--vl-color-${name})` on /design).
    const missing = used.filter(
      ({ name }) => !name.endsWith('-') && !declared.has(name) && !RUNTIME.test(name),
    );
    expect(missing).toEqual([]);
  });
});
