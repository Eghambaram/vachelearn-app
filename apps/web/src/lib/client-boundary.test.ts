import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';

/*
 * Server-only data must never reach the browser bundle: demo fixtures hold answer keys (mocks/attempts.ts, D-023) and
 * other learners' records, and `lib/api` reads them. A 'use client' module may import `lib/api` for types only (bar its
 * pure helpers), and never imports `mocks/` (tenant-isolation review, slice 1.5.6).
 */
const SRC = path.join(process.cwd(), 'src');

function clientFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return clientFiles(full);
    if (!/\.tsx?$/.test(entry.name) || /\.test\.tsx?$/.test(entry.name)) return [];
    return /^\s*['"]use client['"]/.test(readFileSync(full, 'utf8')) ? [full] : [];
  });
}

describe("'use client' modules stay clear of server-only data", () => {
  const files = clientFiles(SRC);

  it('finds the client modules it guards', () => {
    expect(files.length).toBeGreaterThan(10);
  });

  it('never import demo fixtures', () => {
    const offenders = files
      .filter((file) => /from ['"]@\/mocks\//.test(readFileSync(file, 'utf8')))
      .map((file) => path.relative(SRC, file));
    expect(offenders).toEqual([]);
  });

  it('import lib/api for types only, except its pure helpers', () => {
    // session-types and client hold types, constants and pure functions; auth is the browser's fetch client for
    // /api/v1/auth (it reads no fixtures — checked below); every other lib/api module reads fixtures.
    const PURE = /@\/lib\/api\/(session-types|client|auth)['"]/;
    const offenders = files
      .filter((file) =>
        readFileSync(file, 'utf8')
          .split('\n')
          .some(
            (line) => /^import\s+(?!type\b).*from ['"]@\/lib\/api\//.test(line) && !PURE.test(line),
          ),
      )
      .map((file) => path.relative(SRC, file));
    expect(offenders).toEqual([]);
  });

  it('the browser auth client reads no fixtures and no server-only module', () => {
    const source = readFileSync(path.join(SRC, 'lib/api/auth.ts'), 'utf8');
    const imports = [...source.matchAll(/from ['"]([^'"]+)['"]/g)].map((m) => m[1]);
    expect(imports.sort()).toEqual(['./client', '@vachelearn/contracts']);
  });
});
