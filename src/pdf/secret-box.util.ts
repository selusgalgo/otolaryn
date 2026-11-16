import {
  createCipheriv,
  createDecipheriv,
  hkdfSync,
  randomBytes,
} from 'node:crypto';

// Encrypts small secrets (the certificate and its passphrase) before they go
// into the database. AES-256-GCM: confidentiality plus tamper detection, so a
// modified or wrong-key ciphertext is refused instead of decoding to garbage.
//
// Layout of what is stored: iv (12 bytes) | auth tag (16) | ciphertext.
// `purpose` is bound in as associated data, so a ciphertext produced for one
// column can't be replayed as another's.

const IV_LENGTH = 12;
const TAG_LENGTH = 16;

export class SecretBoxError extends Error {}

// A 32-byte key derived from the backend's JWT_SECRET. HKDF with a fixed
// label keeps it separate from the JWT's own use of the secret. No new
// configuration to forget — the cost is that rotating JWT_SECRET makes
// anything encrypted with it undecryptable, which the callers surface.
export function deriveSecretBoxKey(secret: string): Buffer {
  return Buffer.from(
    hkdfSync(
      'sha256',
      Buffer.from(secret, 'utf8'),
      Buffer.from('mederi-secret-box', 'utf8'),
      Buffer.from('signing-certificate-v1', 'utf8'),
      32,
    ),
  );
}

export function encryptSecret(
  plain: Buffer,
  key: Buffer,
  purpose: string,
): Buffer {
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  cipher.setAAD(Buffer.from(purpose, 'utf8'));
  const encrypted = Buffer.concat([cipher.update(plain), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), encrypted]);
}

export function decryptSecret(
  stored: Buffer,
  key: Buffer,
  purpose: string,
): Buffer {
  if (stored.length < IV_LENGTH + TAG_LENGTH) {
    throw new SecretBoxError('El dato cifrado está incompleto.');
  }
  const iv = stored.subarray(0, IV_LENGTH);
  const tag = stored.subarray(IV_LENGTH, IV_LENGTH + TAG_LENGTH);
  const encrypted = stored.subarray(IV_LENGTH + TAG_LENGTH);
  try {
    const decipher = createDecipheriv('aes-256-gcm', key, iv);
    decipher.setAAD(Buffer.from(purpose, 'utf8'));
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(encrypted), decipher.final()]);
  } catch {
    throw new SecretBoxError(
      'No se puede descifrar el dato guardado (clave distinta o dato alterado).',
    );
  }
}
