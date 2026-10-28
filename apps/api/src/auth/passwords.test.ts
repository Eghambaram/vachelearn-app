import {
  HashCapacityError,
  HashGate,
  hashPassword,
  passwordProblem,
  verifyPassword,
} from './passwords';
import { ipSubject } from './rate-limit.service';

describe('passwords (D-051)', () => {
  it('hashes with Argon2id in PHC format, a fresh salt each time, and verifies', async () => {
    const a = await hashPassword('correct horse battery staple');
    const b = await hashPassword('correct horse battery staple');
    expect(a).toMatch(/^\$argon2id\$v=19\$m=19456,t=2,p=1\$[A-Za-z0-9+/]{22}\$[A-Za-z0-9+/]{43}$/);
    expect(a).not.toBe(b);
    expect(await verifyPassword('correct horse battery staple', a)).toBe(true);
    expect(await verifyPassword('correct horse battery stapler', a)).toBe(false);
  });

  it('treats a malformed or foreign hash as a mismatch, never an exception', async () => {
    for (const stored of [
      '',
      'plain',
      '$2b$10$abcdefghijklmnopqrstuv',
      '$argon2id$v=19$m=1,t=1,p=1$$',
    ]) {
      expect(await verifyPassword('anything at all', stored)).toBe(false);
    }
  });

  it('normalises Unicode, so the same password typed differently still matches', async () => {
    const composed = 'café au lait du matin';
    const decomposed = 'café au lait du matin';
    expect(await verifyPassword(decomposed, await hashPassword(composed))).toBe(true);
  });

  it('policy: 12–128 characters, no composition rules, common passwords refused', () => {
    expect(passwordProblem('short pass')).toBe('too_short');
    expect(passwordProblem('x'.repeat(129))).toBe('too_long');
    expect(passwordProblem('qwertyuiopasdfghjkl')).toBe('too_common');
    expect(passwordProblem('QwertyUIOPasdfghjkl')).toBe('too_common');
    expect(passwordProblem('a long passphrase with spaces')).toBeNull();
    // Length counts characters, not UTF-16 units.
    expect(passwordProblem('🔐'.repeat(12))).toBeNull();
  });
});

describe('security review 2.3b fixes', () => {
  it('the policy checks the form that is hashed: full-width spellings of a common password are refused', () => {
    expect(passwordProblem('ｑｗｅｒｔｙｕｉｏｐａｓｄｆｇｈｊｋｌ')).toBe('too_common');
  });

  it('HashGate runs at most `slots` at once, queues up to `queue`, refuses the rest at once', async () => {
    const gate = new HashGate(1, 1);
    let release!: () => void;
    const first = gate.run(() => new Promise<void>((r) => (release = r)));
    const second = gate.run(async () => 'second');
    await expect(gate.run(async () => 'third')).rejects.toBeInstanceOf(HashCapacityError);
    release();
    await first;
    expect(await second).toBe('second');
    expect(await gate.run(async () => 'later')).toBe('later');
  });

  it('IP subjects: IPv4 as is, IPv4-mapped as IPv4, IPv6 by /64', () => {
    expect(ipSubject('203.0.113.7')).toBe('203.0.113.7');
    expect(ipSubject('::ffff:203.0.113.7')).toBe('203.0.113.7');
    expect(ipSubject('2001:db8:aa:1::5')).toBe('2001:db8:aa:1::/64');
    expect(ipSubject('2001:0db8:00aa:0001:ffff:1:2:3')).toBe('2001:db8:aa:1::/64');
    expect(ipSubject('2001:db8::1')).toBe('2001:db8:0:0::/64');
  });
});
