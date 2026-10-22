// Fails when a source file under apps/ or packages/ is ignored by git, so it can never be left out of a commit
// silently (a bare `build/` pattern once dropped a Next.js route from a pushed commit). Runs in `pnpm verify`.
import { execFileSync } from 'node:child_process';

const ignored = execFileSync(
  'git',
  ['ls-files', '--others', '--ignored', '--exclude-standard', '--', 'apps', 'packages'],
  { encoding: 'utf8' },
)
  .split('\n')
  .filter((file) => /\.(tsx?|mjs|css|json|md)$/.test(file))
  .filter((file) => !/(^|\/)(node_modules|\.next|test-results|playwright-report)\//.test(file))
  .filter((file) => !/(^|\/)next-env\.d\.ts$|\.tsbuildinfo$/.test(file));

if (ignored.length > 0) {
  console.error(
    'Source files are git-ignored and would be missing from commits:\n' + ignored.join('\n'),
  );
  process.exit(1);
}
console.log('check:ignored-source OK');
