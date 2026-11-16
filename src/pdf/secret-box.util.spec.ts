import {
  decryptSecret,
  deriveSecretBoxKey,
  encryptSecret,
  SecretBoxError,
} from './secret-box.util';

const key = deriveSecretBoxKey('un-jwt-secret-de-prueba');

describe('SecretBox', () => {
  it('round-trips a secret', () => {
    const plain = Buffer.from('clave-del-certificado', 'utf8');
    const stored = encryptSecret(plain, key, 'passphrase');
    expect(decryptSecret(stored, key, 'passphrase').equals(plain)).toBe(true);
  });

  it('never stores the plaintext', () => {
    const stored = encryptSecret(
      Buffer.from('clave-del-certificado'),
      key,
      'x',
    );
    expect(stored.toString('latin1')).not.toContain('clave-del-certificado');
  });

  it('encrypts the same value differently each time', () => {
    const plain = Buffer.from('igual');
    expect(
      encryptSecret(plain, key, 'x').equals(encryptSecret(plain, key, 'x')),
    ).toBe(false);
  });

  it('refuses the wrong key — i.e. after JWT_SECRET is rotated', () => {
    const stored = encryptSecret(Buffer.from('secreto'), key, 'x');
    const other = deriveSecretBoxKey('otro-secret');
    expect(() => decryptSecret(stored, other, 'x')).toThrow(SecretBoxError);
  });

  it('refuses a tampered ciphertext', () => {
    const stored = Buffer.from(encryptSecret(Buffer.from('secreto'), key, 'x'));
    stored[stored.length - 1] ^= 1;
    expect(() => decryptSecret(stored, key, 'x')).toThrow(SecretBoxError);
  });

  it('refuses a ciphertext replayed for a different purpose', () => {
    const stored = encryptSecret(Buffer.from('secreto'), key, 'p12');
    expect(() => decryptSecret(stored, key, 'passphrase')).toThrow(
      SecretBoxError,
    );
  });

  it('refuses a truncated value', () => {
    expect(() => decryptSecret(Buffer.alloc(10), key, 'x')).toThrow(
      SecretBoxError,
    );
  });

  it('derives a stable 32-byte key per secret', () => {
    expect(key).toHaveLength(32);
    expect(deriveSecretBoxKey('un-jwt-secret-de-prueba').equals(key)).toBe(
      true,
    );
    expect(deriveSecretBoxKey('distinto').equals(key)).toBe(false);
  });
});
