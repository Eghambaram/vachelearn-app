// The package is `"type": "module"` (its TypeScript source is ESM for apps/web and the tests), but `dist/` holds the
// CommonJS build for apps/api. A nested package.json tells Node — and TypeScript — that dist/*.js is CommonJS.
import { writeFileSync } from 'node:fs';

writeFileSync(new URL('../dist/package.json', import.meta.url), '{ "type": "commonjs" }\n');
