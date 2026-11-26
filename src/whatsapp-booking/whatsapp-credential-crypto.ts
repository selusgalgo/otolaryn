import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import { isUUID } from 'class-validator';

// Token ciphertext is bound to its tenant: copying it to another clinic fails
// authentication. Keys are supplied by the deployment, never by the browser.
export class WhatsappCredentialCrypto {
  private readonly key: Buffer;

  constructor(encodedKey: string) {
    if (!/^[0-9a-f]{64}$/i.test(encodedKey)) {
      throw new Error('La clave de cifrado de WhatsApp debe tener 32 bytes');
    }
    this.key = Buffer.from(encodedKey, 'hex');
  }

  encrypt(tenantId: string, token: string): string {
    this.validateTenant(tenantId);
    if (!token || Buffer.byteLength(token, 'utf8') > 8192)
      throw new Error('Credencial inválida');
    const nonce = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', this.key, nonce);
    cipher.setAAD(Buffer.from(`mederi-whatsapp:v1:${tenantId.toLowerCase()}`));
    const ciphertext = Buffer.concat([
      cipher.update(token, 'utf8'),
      cipher.final(),
    ]);
    return [
      'v1',
      nonce.toString('base64url'),
      cipher.getAuthTag().toString('base64url'),
      ciphertext.toString('base64url'),
    ].join('.');
  }

  decrypt(tenantId: string, payload: string): string {
    this.validateTenant(tenantId);
    const parts = payload.split('.');
    if (
      parts.length !== 4 ||
      parts[0] !== 'v1' ||
      !parts.slice(1).every((part) => /^[A-Za-z0-9_-]+$/.test(part))
    )
      throw new Error('Credencial cifrada inválida');
    const nonce = Buffer.from(parts[1], 'base64url');
    const tag = Buffer.from(parts[2], 'base64url');
    const data = Buffer.from(parts[3], 'base64url');
    if (
      nonce.length !== 12 ||
      tag.length !== 16 ||
      !data.length ||
      data.length > 8192
    )
      throw new Error('Credencial cifrada inválida');
    const decipher = createDecipheriv('aes-256-gcm', this.key, nonce);
    decipher.setAAD(
      Buffer.from(`mederi-whatsapp:v1:${tenantId.toLowerCase()}`),
    );
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(data), decipher.final()]).toString(
      'utf8',
    );
  }

  private validateTenant(tenantId: string) {
    if (!isUUID(tenantId)) throw new Error('Clínica inválida');
  }
}
