import { argon2, randomBytes, timingSafeEqual } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { promisify } from 'node:util';

/*
 * Passwords (D-051, Confirmed 2026-10-28): Argon2id via Node's built-in `crypto.argon2` (no native dependency), with
 * the OWASP baseline cost — 19 MiB, 2 passes, 1 lane — stored as a PHC string so the cost can rise later and old
 * hashes still verify. Policy: 12–128 characters, no composition rules, not in the bundled common-password list.
 */

const argon2Async = promisify(argon2);

export const PASSWORD_MIN = 12;
export const PASSWORD_MAX = 128;

const COST = { memory: 19_456, passes: 2, parallelism: 1 } as const;
const TAG_LENGTH = 32;
const SALT_LENGTH = 16;

async function derive(
  password: string,
  salt: Buffer,
  cost: { memory: number; passes: number; parallelism: number },
) {
  return argon2Async('argon2id', {
    message: Buffer.from(password.normalize('NFKC'), 'utf8'),
    nonce: salt,
    tagLength: TAG_LENGTH,
    ...cost,
  });
}

/** `$argon2id$v=19$m=19456,t=2,p=1$<salt>$<hash>` (base64 without padding, as the PHC format specifies). */
export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(SALT_LENGTH);
  const tag = await derive(password, salt, COST);
  const b64 = (b: Buffer) => b.toString('base64').replace(/=+$/, '');
  return `$argon2id$v=19$m=${COST.memory},t=${COST.passes},p=${COST.parallelism}$${b64(salt)}$${b64(tag)}`;
}

const PHC = /^\$argon2id\$v=19\$m=(\d+),t=(\d+),p=(\d+)\$([A-Za-z0-9+/]+)\$([A-Za-z0-9+/]+)$/;

/** True when `password` matches the stored PHC hash. A malformed hash is a mismatch, never an exception. */
export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const match = PHC.exec(stored);
  if (!match) return false;
  const [, m, t, p, salt, hash] = match;
  const expected = Buffer.from(hash!, 'base64');
  const actual = await derive(password, Buffer.from(salt!, 'base64'), {
    memory: Number(m),
    passes: Number(t),
    parallelism: Number(p),
  });
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

let dummy: Promise<string> | undefined;
/**
 * A hash of a random secret, verified when the email is unknown or the account cannot sign in, so every failed
 * sign-in costs one Argon2id verification — the same timing class as a wrong password (spec §5 AC).
 */
export function dummyHash() {
  dummy ??= hashPassword(randomBytes(32).toString('base64url'));
  return dummy;
}

let common: Set<string> | undefined;
function commonPasswords() {
  if (!common) {
    // `data/` sits at the package root: two levels up from src/auth, three from dist/src/auth.
    let dir = __dirname;
    while (!existsSync(join(dir, 'data', 'common-passwords.txt')) && dirname(dir) !== dir) {
      dir = dirname(dir);
    }
    const text = readFileSync(join(dir, 'data', 'common-passwords.txt'), 'utf8');
    common = new Set(text.split('\n').filter(Boolean));
  }
  return common;
}

export type PasswordProblem = 'too_short' | 'too_long' | 'too_common';

/**
 * The first policy rule a new password breaks, or null. Used when a password is set (2.3c), never at sign-in. Checks
 * the NFKC form — the one that is hashed — so a full-width `ｐａｓｓｗｏｒｄ…` is the common password it hashes as.
 */
export function passwordProblem(password: string): PasswordProblem | null {
  const normalized = password.normalize('NFKC');
  const length = [...normalized].length;
  if (length < PASSWORD_MIN) return 'too_short';
  if (length > PASSWORD_MAX) return 'too_long';
  if (commonPasswords().has(normalized.toLowerCase())) return 'too_common';
  return null;
}

/** Thrown when every hashing slot is busy and the wait queue is full (see `HashGate`). */
export class HashCapacityError extends Error {
  override name = 'HashCapacityError';
}

/**
 * Bounds concurrent Argon2id work (security review 2.3b): `crypto.argon2` runs on libuv's thread pool, shared with
 * DNS lookups, file and zlib work. At most `slots` hashes run at once and `queue` more may wait; beyond that the caller
 * is refused at once instead of slowing the whole API.
 */
export class HashGate {
  private running = 0;
  private readonly waiting: (() => void)[] = [];

  constructor(
    private readonly slots = 2,
    private readonly queue = 32,
  ) {}

  async run<T>(work: () => Promise<T>): Promise<T> {
    if (this.running >= this.slots) {
      if (this.waiting.length >= this.queue)
        throw new HashCapacityError('Password hashing is saturated');
      await new Promise<void>((resolve) => this.waiting.push(resolve));
    } else {
      this.running++;
    }
    try {
      return await work();
    } finally {
      const next = this.waiting.shift();
      // Hand the slot straight to the next waiter; otherwise free it.
      if (next) next();
      else this.running--;
    }
  }
}

/** The process-wide gate: every Argon2id hash or verification (sign-in, set and reset) shares its slots. */
export const hashGate = new HashGate();
