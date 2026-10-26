import {
  CertificateVerification,
  certificateDisplayStatus,
  maskHolderName,
  normalizeVerificationId,
} from './certificates';

describe('normalizeVerificationId (D-075)', () => {
  it('accepts any case, spacing and dashes, with or without the prefix', () => {
    const canonical = 'VL-7K3M-Q9TR-2XWB-HN4P';
    expect(normalizeVerificationId(canonical)).toBe(canonical);
    expect(normalizeVerificationId('vl-7k3m-q9tr-2xwb-hn4p')).toBe(canonical);
    expect(normalizeVerificationId(' 7K3M Q9TR 2XWB HN4P ')).toBe(canonical);
    expect(normalizeVerificationId('VL7K3MQ9TR2XWBHN4P')).toBe(canonical);
  });

  it('rejects ambiguous letters, wrong lengths and anything else', () => {
    expect(normalizeVerificationId('VL-7K3M-Q9TR-2XWB-HN4I')).toBeNull(); // I is not Crockford
    expect(normalizeVerificationId('VL-7K3M-Q9TR-2XWB')).toBeNull();
    expect(normalizeVerificationId('../../etc/passwd')).toBeNull();
    expect(normalizeVerificationId('')).toBeNull();
    expect(normalizeVerificationId(['VL-7K3M-Q9TR-2XWB-HN4P'])).toBeNull();
    expect(normalizeVerificationId(undefined)).toBeNull();
    expect(normalizeVerificationId('VL-7K3M-Q9TR-2XWB-HN4P'.repeat(10))).toBeNull();
  });
});

describe('certificateDisplayStatus (expired is derived)', () => {
  const now = new Date('2026-10-22T09:30:00.000Z');
  it('a valid award expires at its expiry instant; revoked and superseded win', () => {
    expect(certificateDisplayStatus('valid', null, now)).toBe('valid');
    expect(certificateDisplayStatus('valid', '2026-10-22T09:30:00.001Z', now)).toBe('valid');
    expect(certificateDisplayStatus('valid', '2026-10-22T09:30:00.000Z', now)).toBe('expired');
    expect(certificateDisplayStatus('revoked', '2025-01-01T00:00:00.000Z', now)).toBe('revoked');
    expect(certificateDisplayStatus('superseded', null, now)).toBe('superseded');
  });
});

describe('maskHolderName (D-017)', () => {
  it('shows initials only, with a fixed mask that hides the length', () => {
    expect(maskHolderName('Demo User')).toBe('D. U***');
    expect(maskHolderName('  asha   rani  kumar ')).toBe('A. K***');
    expect(maskHolderName('Asha')).toBe('A***');
    expect(maskHolderName('Élodie Ørsted')).toBe('É. Ø***');
    expect(maskHolderName('')).toBe('***');
    // First grapheme, not code point: "क्ष" (a conjunct) and "é" written with a combining accent stay whole.
    expect(maskHolderName('क्षमा शर्मा')).toBe('क्ष. श***');
    expect(maskHolderName('e\u0301lodie')).toBe('E\u0301***');
  });
});

describe('CertificateVerification (public, strict)', () => {
  const base = {
    verificationId: 'VL-7K3M-Q9TR-2XWB-HN4P',
    status: 'valid',
    courseTitle: 'C',
    issuerName: 'I',
    holderMaskedName: 'D. U***',
    issuedOn: '2026-10-16',
    expiresOn: null,
    revokedOn: null,
    checkedAt: '2026-10-22T09:30:00.000Z',
  };
  it('parses the D-017 fields and refuses anything more', () => {
    expect(CertificateVerification.safeParse(base).success).toBe(true);
    expect(CertificateVerification.safeParse({ ...base, holderName: 'Demo User' }).success).toBe(
      false,
    );
    expect(CertificateVerification.safeParse({ ...base, revokedReason: 'x' }).success).toBe(false);
  });
});
