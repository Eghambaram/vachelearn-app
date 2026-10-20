import path from 'node:path';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [react()],
  // Same `@/*` alias as tsconfig.json, so tests import modules exactly like the app does.
  resolve: { alias: { '@': path.resolve(import.meta.dirname, 'src') } },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./vitest.setup.ts'],
    include: ['src/**/*.test.{ts,tsx}'],
    // The first test in each jsdom file pays a one-off cold import of Radix/lucide (2–3 s under parallel workers on
    // WSL; warm tests take ~100–150 ms). 15 s keeps that from flaking; it does not hide slow assertions.
    testTimeout: 15_000,
  },
});
