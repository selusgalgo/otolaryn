import { createCipheriv, generateKeyPairSync, publicEncrypt, constants, createDecipheriv, createHmac, randomBytes } from 'node:crypto';
import { decryptFlowRequest, encryptFlowResponse, signFlowToken, validFlowSignature, verifyFlowToken } from './whatsapp-flow-crypto';

const credentialKey = 'a'.repeat(64);
const tenantId = '3f8f2c4e-0c1d-4b7e-9a55-1b2c3d4e5f60';

describe('whatsapp flow crypto', () => {
  it('decrypts a Meta-style request and encrypts the answer with the flipped IV', () => {
    const { publicKey, privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
    const aesKey = randomBytes(16);
    const iv = randomBytes(16);
    const cipher = createCipheriv('aes-128-gcm', aesKey, iv);
    const body = Buffer.concat([cipher.update(JSON.stringify({ action: 'ping' })), cipher.final(), cipher.getAuthTag()]);
    const request = {
      encrypted_flow_data: body.toString('base64'),
      encrypted_aes_key: publicEncrypt({ key: publicKey, padding: constants.RSA_PKCS1_OAEP_PADDING, oaepHash: 'sha256' }, aesKey).toString('base64'),
      initial_vector: iv.toString('base64'),
    };
    const decrypted = decryptFlowRequest(request, privateKey.export({ type: 'pkcs8', format: 'pem' }).toString());
    expect(decrypted.data).toEqual({ action: 'ping' });
    const answer = Buffer.from(encryptFlowResponse({ data: { status: 'active' } }, decrypted.aesKey, decrypted.iv), 'base64');
    const decipher = createDecipheriv('aes-128-gcm', aesKey, Buffer.from(iv.map((b) => b ^ 0xff)));
    decipher.setAuthTag(answer.subarray(-16));
    expect(JSON.parse(Buffer.concat([decipher.update(answer.subarray(0, -16)), decipher.final()]).toString())).toEqual({ data: { status: 'active' } });
  });

  it('accepts only the exact HMAC signature', () => {
    const raw = Buffer.from('{"a":1}');
    const good = 'sha256=' + createHmac('sha256', 'secret').update(raw).digest('hex');
    expect(validFlowSignature(raw, good, 'secret')).toBe(true);
    expect(validFlowSignature(raw, good, 'other')).toBe(false);
    expect(validFlowSignature(raw, undefined, 'secret')).toBe(false);
  });

  it('binds the token to clinic and sender, and rejects tampering or expiry', () => {
    const token = signFlowToken(credentialKey, { tenantId, phone: '+34600000000', phoneNumberId: '123' }, 1_000);
    expect(verifyFlowToken(credentialKey, token, 2_000)).toMatchObject({ tenantId, phone: '+34600000000', phoneNumberId: '123' });
    expect(verifyFlowToken(credentialKey, token, 1_000 + 61 * 60 * 1000)).toBeNull();
    expect(verifyFlowToken('b'.repeat(64), token, 2_000)).toBeNull();
    const [body, mac] = token.split('.');
    const forged = Buffer.from(JSON.stringify({ t: tenantId, p: '+34611111111', n: '123', e: 9e15 })).toString('base64url');
    expect(verifyFlowToken(credentialKey, `${forged}.${mac}`, 2_000)).toBeNull();
    expect(verifyFlowToken(credentialKey, `${body}x.${mac}`, 2_000)).toBeNull();
    expect(verifyFlowToken(credentialKey, 42, 2_000)).toBeNull();
  });
});
