#!/usr/bin/env node
// PreToolUse hook for Edit/Write/MultiEdit/Bash.
// Blocks writes to real environment/secret files, shell commands that touch them (cat, cp, >, source, ...),
// and content or commands that look like a live secret.
// Bash permission deny rules are prefix matches and easy to sidestep; this hook is the real guard.
// Exit 2 = block the tool call; stderr is shown to Claude as the reason. Exit 0 = allow.

import path from 'node:path';

let raw = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', (chunk) => (raw += chunk));
process.stdin.on('end', () => {
  let input;
  try {
    input = JSON.parse(raw || '{}');
  } catch {
    process.exit(0); // never break the session because of a malformed payload
  }

  const toolInput = input.tool_input ?? {};
  const filePath = String(toolInput.file_path ?? '');
  const base = path.basename(filePath);

  // 1) Real env / key files are off-limits. .env.example (and *.example) are allowed.
  const isEnvFile = /^\.env(\..+)?$/.test(base) && !/\.example$/.test(base) && !/\.sample$/.test(base);
  const isKeyFile = /\.(pem|key|p12|pfx)$/i.test(base);
  if (isEnvFile || isKeyFile) {
    console.error(
      `Blocked: ${base} may contain real secrets. Edit .env.example with placeholders instead, ` +
        'and ask the user to set real values themselves.',
    );
    process.exit(2);
  }

  // 1b) Shell commands that reference a real env or key file. `.env` must start a path segment, so
  // `process.env.X` and `.envrc` do not match; `.env.example` / `.env.sample` stay allowed.
  const command = String(toolInput.command ?? '');
  if (command) {
    const envRefs = command.match(/(?<![\w$.-])\.env(\.[\w.-]+)?(?![\w-])/g) ?? [];
    const realEnv = envRefs.find((ref) => !/\.(example|sample)$/.test(ref));
    const keyRef = command.match(/[\w./-]+\.(pem|key|p12|pfx)(?![\w-])/i)?.[0];
    if (realEnv || keyRef) {
      console.error(
        `Blocked: this command references ${realEnv ?? keyRef}, which may contain real secrets. ` +
          'Use .env.example for names and placeholders, and ask the user to manage real values themselves.',
      );
      process.exit(2);
    }
  }

  // 2) Content (or a shell command) that looks like a live credential.
  const content = [
    toolInput.content,
    toolInput.new_string,
    command,
    ...(toolInput.edits ?? []).map((e) => e?.new_string),
  ]
    .filter(Boolean)
    .join('\n');

  const patterns = [
    [/-----BEGIN (RSA |EC |OPENSSH )?PRIVATE KEY-----/, 'a private key'],
    [/\bAKIA[0-9A-Z]{16}\b/, 'an AWS access key ID'],
    [/\bsk_live_[0-9a-zA-Z]{16,}\b/, 'a live Stripe secret key'],
    [/\brzp_live_[0-9a-zA-Z]{10,}\b/, 'a live Razorpay key'],
    [/\bgh[pousr]_[0-9A-Za-z]{30,}\b/, 'a GitHub token'],
    [/\bxox[baprs]-[0-9A-Za-z-]{10,}\b/, 'a Slack token'],
    [/postgres(ql)?:\/\/[^:\s]+:(?!change-me|password|postgres|vachelearn|local)[^@\s]{12,}@(?!localhost|127\.0\.0\.1|postgres\b|db\b)/i, 'a non-local database URL with a password'],
  ];
  for (const [re, label] of patterns) {
    if (re.test(content)) {
      console.error(
        `Blocked: the content for ${base || 'this file'} appears to contain ${label}. ` +
          'Use an environment variable and a placeholder in .env.example instead.',
      );
      process.exit(2);
    }
  }

  process.exit(0);
});
