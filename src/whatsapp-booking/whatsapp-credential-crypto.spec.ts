import { WhatsappCredentialCrypto } from './whatsapp-credential-crypto';

describe('WhatsappCredentialCrypto', () => {
  const tenant = '2ad1bd62-a965-4b25-860f-120e50a30493';
  const other = 'f35ae750-eb8f-4e73-b7e4-d22888a38a02';
  const crypto = new WhatsappCredentialCrypto('ab'.repeat(32));

  it('cifra de forma aleatoria y permite recuperar solo con la clínica y clave correctas', () => {
    const sealed = crypto.encrypt(tenant, 'token-ficticio');
    expect(sealed).not.toContain('token-ficticio');
    expect(crypto.encrypt(tenant, 'token-ficticio')).not.toBe(sealed);
    expect(crypto.decrypt(tenant, sealed)).toBe('token-ficticio');
    expect(() => crypto.decrypt(other, sealed)).toThrow();
    expect(() => new WhatsappCredentialCrypto('cd'.repeat(32)).decrypt(tenant, sealed)).toThrow();
  });

  it('rechaza claves, formatos y datos alterados', () => {
    expect(() => new WhatsappCredentialCrypto('clave')).toThrow();
    expect(() => crypto.decrypt(tenant, 'v1.invalido')).toThrow();
    const parts = crypto.encrypt(tenant, 'token-ficticio').split('.');
    const data = Buffer.from(parts[3], 'base64url');
    data[0] ^= 1;
    parts[3] = data.toString('base64url');
    expect(() => crypto.decrypt(tenant, parts.join('.'))).toThrow();
  });
});
