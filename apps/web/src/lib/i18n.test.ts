import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { en } from '@/messages/en';
import { getMessages, LOCALES } from './i18n';

const SRC = path.join(process.cwd(), 'src');

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return sourceFiles(full);
    return /\.tsx?$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name) ? [full] : [];
  });
}

describe('i18n helper (D-028)', () => {
  it('serves English, the only launch language', () => {
    expect(LOCALES).toEqual(['en']);
    expect(getMessages()).toBe(en);
  });

  it('is the only way UI code reaches a message catalogue', () => {
    const offenders = sourceFiles(SRC)
      .filter((file) => !file.endsWith(path.join('lib', 'i18n.ts')))
      .filter((file) => /from '@\/messages\//.test(readFileSync(file, 'utf8')))
      .map((file) => path.relative(SRC, file));
    expect(offenders).toEqual([]);
  });
});
