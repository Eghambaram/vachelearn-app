import type { DynamicModule } from '@nestjs/common';
import type { IncomingMessage } from 'node:http';
import { LoggerModule } from 'nestjs-pino';
import type { DestinationStream, LoggerOptions } from 'pino';
import type { AppConfig } from '../config/env';
import { clientRequestIdOf, requestIdOf } from '../common/request-id';

/*
 * Structured JSON logs (pino) with the request ID on every line. Secrets never reach a log (CLAUDE.md):
 * - request headers are logged from an allowlist only (never Authorization, Cookie, Referer, API keys, signatures);
 * - credential-like fields are redacted at any of the first three levels;
 * - request bodies are never logged, and URLs are logged without their query string;
 * - errors are reduced to type, code, message and stack, with connection-string credentials scrubbed — never the
 *   error's other properties or `cause` (driver errors carry row values in `detail`).
 * Successful readiness probes are not logged (they run every few seconds).
 */

const SECRET_FIELDS = [
  'password',
  'pass',
  'auth',
  'authorization',
  'cookie',
  'newPassword',
  'currentPassword',
  'token',
  'accessToken',
  'refreshToken',
  'inviteToken',
  'resetToken',
  'secret',
  'signedUrl',
  'answers',
];

export const REDACT_PATHS = [
  ...SECRET_FIELDS,
  ...SECRET_FIELDS.map((f) => `*.${f}`),
  ...SECRET_FIELDS.map((f) => `*.*.${f}`),
];

/** The only request headers that reach a log line. */
const LOGGED_HEADERS = ['user-agent', 'content-type', 'content-length', 'origin'];

const QUIET_PATHS = new Set(['/health', '/ready']);

/** Removes credentials from connection strings and key=value secrets inside free text. */
export function scrubText(text: string) {
  return text
    .replace(/([a-z][a-z0-9+.-]*:\/\/)[^@\s/]+@/gi, '$1[REDACTED]@')
    .replace(/\b(password|passwd|pwd|secret|token)=([^\s&;]+)/gi, '$1=[REDACTED]');
}

/**
 * Everything `scrubText` removes, plus whatever could be a link, an address or a token in an error message (security
 * review 2.3a): http(s) links and scheme-less verify/reset/invite paths, email addresses, `key: value` / JSON secrets,
 * and any opaque run of 20+ token characters (a 128-bit base64url token is 22). Used for every logged error message
 * and for `jobs.last_error`; it over-redacts on purpose.
 */
export function scrubSecrets(text: string) {
  return scrubText(text)
    .replace(
      /\b(password|passwd|pwd|pass|secret|token|otp|api[_-]?key|sig|signature)(["']?\s*[:=]\s*["']?)[^\s"'&;,}]+/gi,
      '$1$2[REDACTED]',
    )
    .replace(/\bhttps?:\/\/\S+/gi, '[URL]')
    .replace(/\S*\/(verify|reset|invite|accept)\b\S*/gi, '[URL]')
    .replace(/[^\s<>()[\]"',;:/@]+@[^\s<>()[\]"',;:/@]+/g, '[EMAIL]')
    .replace(/[A-Za-z0-9_\-+/=]{20,}/g, '[REDACTED]');
}

/** An error name is a class name; anything else (a name carrying data) is reduced to `Error`. */
export function safeErrorName(name: unknown) {
  return typeof name === 'string' && /^[A-Za-z][A-Za-z0-9_]{0,39}$/.test(name) ? name : 'Error';
}

type ErrorLike = { name?: unknown; message?: unknown; stack?: unknown; code?: unknown };

export function serializeError(err: unknown) {
  if (!err || typeof err !== 'object') return { message: scrubSecrets(String(err)).slice(0, 500) };
  const e = err as ErrorLike;
  return {
    type: safeErrorName(e.name),
    ...(typeof e.code === 'string' || typeof e.code === 'number' ? { code: e.code } : {}),
    message: scrubSecrets(String(e.message ?? '')).slice(0, 500),
    // Frames only: the stack's first line repeats the message unscrubbed.
    ...(typeof e.stack === 'string'
      ? {
          stack: e.stack
            .split('\n')
            .filter((line) => /^\s+at /.test(line))
            .join('\n'),
        }
      : {}),
  };
}

export function pinoOptions(config: AppConfig): LoggerOptions {
  return {
    level: config.LOG_LEVEL,
    redact: { paths: REDACT_PATHS, censor: '[REDACTED]' },
    serializers: { err: serializeError },
  };
}

export function loggingModule(config: AppConfig, stream?: DestinationStream): DynamicModule {
  return LoggerModule.forRoot({
    pinoHttp: [
      {
        ...pinoOptions(config),
        genReqId: (req: IncomingMessage) => requestIdOf(req),
        customProps: (req: IncomingMessage) => {
          const clientRequestId = clientRequestIdOf(req);
          return clientRequestId ? { clientRequestId } : {};
        },
        autoLogging: { ignore: (req: IncomingMessage) => QUIET_PATHS.has(req.url ?? '') },
        serializers: {
          err: serializeError,
          req: (req: {
            id?: string;
            method?: string;
            url?: string;
            headers?: Record<string, unknown>;
          }) => ({
            id: req.id,
            method: req.method,
            url: req.url?.split('?')[0],
            headers: Object.fromEntries(
              LOGGED_HEADERS.filter((h) => req.headers?.[h] !== undefined).map((h) => [
                h,
                req.headers?.[h],
              ]),
            ),
          }),
          res: (res: { statusCode?: number }) => ({ statusCode: res.statusCode }),
        },
      },
      ...(stream ? [stream] : []),
    ] as never,
  });
}
