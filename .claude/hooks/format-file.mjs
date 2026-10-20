#!/usr/bin/env node
// PostToolUse hook for Edit/Write/MultiEdit.
// Formats the edited file with the repository's own Prettier, if Prettier is installed.
// Silent no-op before scaffolding (Phase 0) or for unsupported file types. Never blocks.

import { existsSync } from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

let raw = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', (chunk) => (raw += chunk));
process.stdin.on('end', () => {
  try {
    const input = JSON.parse(raw || '{}');
    const filePath = input?.tool_input?.file_path;
    if (!filePath) return process.exit(0);

    const supported = /\.(ts|tsx|js|jsx|mjs|cjs|json|css|scss|md|mdx|yml|yaml|html)$/i;
    if (!supported.test(filePath)) return process.exit(0);

    const projectDir = process.env.CLAUDE_PROJECT_DIR || input.cwd || process.cwd();
    const bin = process.platform === 'win32' ? 'prettier.cmd' : 'prettier';
    const prettier = path.join(projectDir, 'node_modules', '.bin', bin);
    if (!existsSync(prettier)) return process.exit(0);

    // Skip files Prettier should not touch (lockfiles, generated output, migrations SQL is not matched above).
    if (/(pnpm-lock\.yaml|\/dist\/|\/\.next\/|\/generated\/)/.test(filePath.replace(/\\/g, '/'))) {
      return process.exit(0);
    }

    spawnSync(prettier, ['--write', '--log-level', 'warn', filePath], {
      cwd: projectDir,
      stdio: 'ignore',
      timeout: 20000,
      shell: process.platform === 'win32',
    });
  } catch {
    // formatting is best-effort; never fail the tool call
  }
  process.exit(0);
});
