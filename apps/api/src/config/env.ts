import { randomBytes } from 'node:crypto';
import { z } from 'zod';

/*
 * Runtime configuration, validated once at boot (fail fast: a missing or malformed variable stops the process with its
 * name — never its value). Every variable is listed with a placeholder in the repo's `.env.example`. Nothing fails
 * open: NODE_ENV has no default, development-only features need an explicit development environment, and production
 * requires an https web origin.
 */

const Origin = z
  .url()
  .refine(
    (v) => new URL(v).origin === v,
    'must be a bare origin like https://app.example.com (no path or slash)',
  );

const EnvSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production'], {
      error: 'must be development, test or production',
    }),
    API_PORT: z.coerce.number().int().min(1).max(65_535).default(4000),
    /** PostgreSQL connection string (D-005). */
    DATABASE_URL: z
      .string({ error: 'is required' })
      .min(1, 'is required')
      .refine((v) => /^postgres(ql)?:\/\//.test(v), 'must be a postgresql:// URL'),
    LOG_LEVEL: z
      .enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent'])
      .default('info'),
    /** The web app's origin: the only origin allowed to call the API from a browser (CORS). */
    WEB_ORIGIN: Origin.optional(),
    /** OpenAPI at /api/docs: on by default in development only; never in production. */
    ENABLE_API_DOCS: z.enum(['true', 'false']).optional(),
    /** Signs list cursors (HMAC). Required in production; elsewhere a random key per process is used. */
    CURSOR_SECRET: z.string().min(32, 'must be at least 32 characters').optional(),
    /** Runs queued jobs in this process (D-040). Default: on, except in tests (they run jobs explicitly). */
    JOBS_WORKER: z.enum(['true', 'false']).optional(),
    /** `console` logs recipient and subject only (never the body); `smtp` sends (Mailpit locally). D-082. */
    EMAIL_PROVIDER: z.enum(['console', 'smtp']).default('console'),
    EMAIL_FROM: z.string().min(3).max(200).optional(),
    SMTP_HOST: z.string().min(1).optional(),
    SMTP_PORT: z.coerce.number().int().min(1).max(65_535).optional(),
    /** TLS from the first byte (port 465). Otherwise STARTTLS is used when the server offers it. */
    SMTP_SECURE: z.enum(['true', 'false']).default('false'),
    SMTP_USER: z.string().min(1).optional(),
    SMTP_PASSWORD: z.string().min(1).optional(),
  })
  .superRefine((env, ctx) => {
    if (env.EMAIL_PROVIDER === 'smtp' && (!env.SMTP_HOST || !env.SMTP_PORT)) {
      ctx.addIssue({
        code: 'custom',
        path: [env.SMTP_HOST ? 'SMTP_PORT' : 'SMTP_HOST'],
        message: 'is required when EMAIL_PROVIDER is smtp',
      });
    }
    if (!env.SMTP_USER !== !env.SMTP_PASSWORD) {
      ctx.addIssue({
        code: 'custom',
        path: ['SMTP_PASSWORD'],
        message: 'SMTP_USER and SMTP_PASSWORD must be set together',
      });
    }
    if (env.NODE_ENV === 'production') {
      if (!env.WEB_ORIGIN)
        ctx.addIssue({
          code: 'custom',
          path: ['WEB_ORIGIN'],
          message: 'is required in production',
        });
      else if (!env.WEB_ORIGIN.startsWith('https://')) {
        ctx.addIssue({
          code: 'custom',
          path: ['WEB_ORIGIN'],
          message: 'must be https in production',
        });
      }
      if (!env.CURSOR_SECRET) {
        ctx.addIssue({
          code: 'custom',
          path: ['CURSOR_SECRET'],
          message: 'is required in production',
        });
      } else if (/^replace-with|change-me/.test(env.CURSOR_SECRET)) {
        ctx.addIssue({
          code: 'custom',
          path: ['CURSOR_SECRET'],
          message: 'is still the .env.example placeholder',
        });
      }
      if (env.EMAIL_PROVIDER === 'console') {
        ctx.addIssue({
          code: 'custom',
          path: ['EMAIL_PROVIDER'],
          message: 'must be smtp in production (console would drop every email)',
        });
      }
      if (!env.EMAIL_FROM) {
        ctx.addIssue({
          code: 'custom',
          path: ['EMAIL_FROM'],
          message: 'is required in production',
        });
      } else if (/(\.invalid|@example\.[a-z]+)>?\s*$/i.test(env.EMAIL_FROM)) {
        ctx.addIssue({
          code: 'custom',
          path: ['EMAIL_FROM'],
          message: 'is still a placeholder address',
        });
      }
      if (env.ENABLE_API_DOCS === 'true') {
        ctx.addIssue({
          code: 'custom',
          path: ['ENABLE_API_DOCS'],
          message: 'cannot be enabled in production',
        });
      }
    }
  })
  .transform((env) => ({
    NODE_ENV: env.NODE_ENV,
    API_PORT: env.API_PORT,
    DATABASE_URL: env.DATABASE_URL,
    LOG_LEVEL: env.LOG_LEVEL,
    WEB_ORIGIN: env.WEB_ORIGIN ?? 'http://localhost:3000',
    apiDocs: env.ENABLE_API_DOCS ? env.ENABLE_API_DOCS === 'true' : env.NODE_ENV === 'development',
    // Outside production a per-process key is fine: cursors simply stop working across a restart.
    cursorSecret: env.CURSOR_SECRET ?? randomBytes(32).toString('base64url'),
    jobsWorker: env.JOBS_WORKER ? env.JOBS_WORKER === 'true' : env.NODE_ENV !== 'test',
    email: {
      provider: env.EMAIL_PROVIDER,
      from: env.EMAIL_FROM ?? 'VacheLearn (Demo) <no-reply@vachelearn.invalid>',
      smtp:
        env.EMAIL_PROVIDER === 'smtp'
          ? {
              host: env.SMTP_HOST!,
              port: env.SMTP_PORT!,
              secure: env.SMTP_SECURE === 'true',
              // Production never sends in clear text: without implicit TLS, STARTTLS is mandatory, so a network
              // attacker who strips the server's STARTTLS offer gets a failed send, not the password or a reset
              // link (security review 2.3a). Locally Mailpit has no TLS.
              requireTLS: env.NODE_ENV === 'production' && env.SMTP_SECURE !== 'true',
              auth: env.SMTP_USER ? { user: env.SMTP_USER, pass: env.SMTP_PASSWORD! } : undefined,
            }
          : null,
    },
  }));

export type AppConfig = Readonly<z.output<typeof EnvSchema>>;

export class ConfigError extends Error {
  override name = 'ConfigError';
}

/** Parses the environment; throws `ConfigError` naming every invalid variable (values are never echoed). */
export function loadConfig(env: Record<string, string | undefined> = process.env): AppConfig {
  // `NAME=` in an env file (as `.env.example` ships optional settings) means "not set", not an empty value.
  const parsed = EnvSchema.safeParse(
    Object.fromEntries(Object.entries(env).filter(([, value]) => value !== '')),
  );
  if (parsed.success) return Object.freeze(parsed.data);
  const problems = parsed.error.issues.map((issue) => `${issue.path.join('.')} ${issue.message}`);
  throw new ConfigError(`Invalid configuration: ${problems.join('; ')}`);
}

/** Injection token for the validated configuration. */
export const APP_CONFIG = Symbol('APP_CONFIG');
