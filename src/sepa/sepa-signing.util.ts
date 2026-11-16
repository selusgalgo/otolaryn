import { createHash, randomBytes } from 'node:crypto';

// Pure helpers behind the clinic-facing signing link. No Nest, no DB.

export const SIGNING_LINK_DAYS = 14;
export const MAX_SIGNED_PDF_BYTES = 5 * 1024 * 1024;

// 32 random bytes → 43 url-safe chars. Only the SHA-256 of this is stored,
// so a database leak doesn't hand out working signing links. (Unlike the
// device-lock credential, which is argon2-hashed and compared against a
// known clinic: here the link is the *lookup key*, so the hash has to be
// deterministic — fine for 256 bits of randomness.)
const TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;

export function generateSigningToken(): string {
  return randomBytes(32).toString('base64url');
}

export function isWellFormedToken(token: string): boolean {
  return TOKEN_PATTERN.test(token);
}

export function sha256Hex(data: string | Buffer): string {
  return createHash('sha256').update(data).digest('hex');
}

export function signingLinkExpiry(from: Date = new Date()): Date {
  return new Date(from.getTime() + SIGNING_LINK_DAYS * 24 * 60 * 60 * 1000);
}

export function isPdf(file: Buffer): boolean {
  return file.subarray(0, 5).toString('latin1') === '%PDF-';
}

// A PAdES/PDF digital signature is a /Sig dictionary with a /ByteRange
// covering the signed bytes; both sit uncompressed in the file body, once per
// signature. This counts them. It proves signatures are *present*, not that
// they're valid or whose they are — verifying the certificate chain would
// need a dedicated library, so the superadmin still checks the signer in
// their PDF reader.
//
// It has to be a count, not a yes/no: the document we issue may already carry
// OUR signature, so "has a signature" would pass for someone uploading the
// issued file untouched. What shows the client signed is having more
// signatures than the file we gave them.
export function countSignatures(file: Buffer): number {
  const raw = file.toString('latin1');
  const byteRanges = (raw.match(/\/ByteRange/g) ?? []).length;
  const signatureDicts = (raw.match(/\/Type\s*\/Sig\b/g) ?? []).length;
  return Math.min(byteRanges, signatureDicts);
}

// Signers (AutoFirma, Acrobat) normally append the signature to the file
// they were given, so the signed file starts with the exact bytes we issued.
// When it doesn't, the signer re-saved the document — worth a second look.
export function startsWithIssued(signed: Buffer, issued: Buffer): boolean {
  return (
    signed.length >= issued.length &&
    signed.subarray(0, issued.length).equals(issued)
  );
}

// "  José  Pérez " ≈ "jose perez": for comparing a typed signature with the
// signer's name without punishing accents, case or stray spaces.
export function normalizeName(name: string): string {
  return name
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

// Sliding-window limiter, in memory: production runs a single backend
// process (see deploy notes), so there's nothing to share across instances.
// Public signing endpoints are unauthenticated, so they get a cap per
// client address; the map is swept as it grows so it can't leak.
export class RateLimiter {
  private readonly hits = new Map<string, number[]>();

  constructor(
    private readonly max: number,
    private readonly windowMs: number,
  ) {}

  /** True if this hit is allowed (and counts it). */
  allow(key: string, now: number = Date.now()): boolean {
    const recent = (this.hits.get(key) ?? []).filter(
      (t) => now - t < this.windowMs,
    );
    if (recent.length >= this.max) {
      this.hits.set(key, recent);
      return false;
    }
    recent.push(now);
    this.hits.set(key, recent);
    if (this.hits.size > 10_000) this.sweep(now);
    return true;
  }

  private sweep(now: number): void {
    for (const [key, times] of this.hits) {
      if (times.every((t) => now - t >= this.windowMs)) this.hits.delete(key);
    }
  }
}
