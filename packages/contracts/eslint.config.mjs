import { defineConfig, globalIgnores } from 'eslint/config';
import tseslint from 'typescript-eslint';

// dist/ is the generated CommonJS build for apps/api (`pnpm build`), never edited by hand.
export default defineConfig([...tseslint.configs.recommended, globalIgnores(['dist/**'])]);
