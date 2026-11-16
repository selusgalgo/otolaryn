import {
  generateSigningToken,
  countSignatures,
  isPdf,
  isWellFormedToken,
  normalizeName,
  RateLimiter,
  sha256Hex,
  signingLinkExpiry,
  startsWithIssued,
} from './sepa-signing.util';

describe('signing token', () => {
  it('generates distinct, well-formed tokens', () => {
    const a = generateSigningToken();
    const b = generateSigningToken();
    expect(isWellFormedToken(a)).toBe(true);
    expect(a).not.toBe(b);
  });

  it.each(['', 'short', 'x'.repeat(44), `${'a'.repeat(42)}!`, '../etc/passwd'])(
    'rejects malformed token %j',
    (token) => {
      expect(isWellFormedToken(token)).toBe(false);
    },
  );

  it('hashes deterministically', () => {
    expect(sha256Hex('abc')).toBe(
      'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
    );
  });

  it('expires 14 days after issue', () => {
    const from = new Date('2026-12-01T10:00:00Z');
    expect(signingLinkExpiry(from).toISOString()).toBe(
      '2026-12-15T10:00:00.000Z',
    );
  });
});

describe('PDF checks', () => {
  const unsigned = Buffer.from('%PDF-1.7\n1 0 obj\n<<>>\nendobj\n%%EOF\n');
  const signed = Buffer.concat([
    unsigned,
    Buffer.from(
      '2 0 obj\n<< /Type /Sig /Filter /Adobe.PPKLite /ByteRange [0 100 200 50] >>\nendobj\n%%EOF\n',
    ),
  ]);

  it('recognises a PDF by its header', () => {
    expect(isPdf(unsigned)).toBe(true);
    expect(isPdf(Buffer.from('GIF89a'))).toBe(false);
  });

  it('counts the signatures in a file', () => {
    const second = Buffer.concat([
      signed,
      Buffer.from(
        '\n8 0 obj\n<< /Type /Sig /ByteRange [0 300 400 60] >>\nendobj\n%%EOF\n',
      ),
    ]);
    expect(countSignatures(unsigned)).toBe(0);
    expect(countSignatures(signed)).toBe(1);
    expect(countSignatures(second)).toBe(2);
  });

  it('does not mistake a signature field or lock for a signature', () => {
    const field = Buffer.from(
      '%PDF-1.7\n<< /FT /Sig /Type /Annot >>\n<< /Type /SigFieldLock >>\n',
    );
    expect(countSignatures(field)).toBe(0);
  });

  it('knows whether a signed file extends the issued one', () => {
    expect(startsWithIssued(signed, unsigned)).toBe(true);
    expect(startsWithIssued(unsigned, signed)).toBe(false);
    expect(startsWithIssued(signed, Buffer.from('%PDF-1.4 other'))).toBe(false);
  });
});

describe('normalizeName', () => {
  it('ignores case, accents and extra spaces', () => {
    expect(normalizeName('  José   PÉREZ ')).toBe(normalizeName('jose perez'));
  });

  it('still tells different names apart', () => {
    expect(normalizeName('Ana Pérez')).not.toBe(normalizeName('Ana Ruiz'));
  });
});

describe('RateLimiter', () => {
  it('blocks past the cap and recovers after the window', () => {
    const limiter = new RateLimiter(2, 1000);
    expect(limiter.allow('ip', 0)).toBe(true);
    expect(limiter.allow('ip', 100)).toBe(true);
    expect(limiter.allow('ip', 200)).toBe(false);
    expect(limiter.allow('other', 200)).toBe(true);
    expect(limiter.allow('ip', 1100)).toBe(true);
  });
});
