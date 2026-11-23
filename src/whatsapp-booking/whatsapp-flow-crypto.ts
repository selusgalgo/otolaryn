import {
  constants,
  createCipheriv,
  createDecipheriv,
  createHash,
  createHmac,
  privateDecrypt,
  randomBytes,
  timingSafeEqual,
} from 'node:crypto';
import { isUUID } from 'class-validator';

export type FlowEnvelope = {
  encrypted_flow_data: string;
  encrypted_aes_key: string;
  initial_vector: string;
};

/** Decrypts a WhatsApp Flows request (RSA-OAEP-SHA256 key, AES-128-GCM body). */
export function decryptFlowRequest(body: FlowEnvelope, privateKeyPem: string) {
  const aesKey = privateDecrypt(
    { key: privateKeyPem, padding: constants.RSA_PKCS1_OAEP_PADDING, oaepHash: 'sha256' },
    Buffer.from(body.encrypted_aes_key, 'base64'),
  );
  if (aesKey.length !== 16) throw new Error('Clave de Flow no válida');
  const iv = Buffer.from(body.initial_vector, 'base64');
  if (iv.length < 12 || iv.length > 16) throw new Error('Vector de Flow no válido');
  const encrypted = Buffer.from(body.encrypted_flow_data, 'base64');
  if (encrypted.length < 17) throw new Error('Datos de Flow no válidos');
  const decipher = createDecipheriv('aes-128-gcm', aesKey, iv);
  decipher.setAuthTag(encrypted.subarray(-16));
  const plain = Buffer.concat([decipher.update(encrypted.subarray(0, -16)), decipher.final()]);
  return { data: JSON.parse(plain.toString('utf8')) as unknown, aesKey, iv };
}

/** The response is encrypted with the request key and the bit-flipped IV. */
export function encryptFlowResponse(response: unknown, aesKey: Buffer, iv: Buffer): string {
  const flipped = Buffer.from(iv.map((byte) => byte ^ 0xff));
  const cipher = createCipheriv('aes-128-gcm', aesKey, flipped);
  return Buffer.concat([
    cipher.update(JSON.stringify(response), 'utf8'),
    cipher.final(),
    cipher.getAuthTag(),
  ]).toString('base64');
}

export function validFlowSignature(raw: Buffer, header: unknown, appSecret: string): boolean {
  if (typeof header !== 'string' || !appSecret) return false;
  const expected = Buffer.from('sha256=' + createHmac('sha256', appSecret).update(raw).digest('hex'));
  const given = Buffer.from(header);
  return given.length === expected.length && timingSafeEqual(given, expected);
}

export type FlowTokenPayload = { tenantId: string; phone: string; phoneNumberId: string; expires: number };

const PURPOSE = 'mederi-whatsapp-flow-token:v1';
const TOKEN_TTL_MS = 60 * 60 * 1000;

function tokenKey(credentialKeyHex: string): Buffer {
  if (!/^[0-9a-f]{64}$/i.test(credentialKeyHex)) throw new Error('Clave de WhatsApp no válida');
  return createHmac('sha256', Buffer.from(credentialKeyHex, 'hex')).update(PURPOSE).digest();
}

/** Stateless token bound to clinic, sender and Meta phone, signed by the server. */
export function signFlowToken(
  credentialKeyHex: string,
  input: { tenantId: string; phone: string; phoneNumberId: string },
  now = Date.now(),
): string {
  const body = Buffer.from(
    JSON.stringify({ t: input.tenantId, p: input.phone, n: input.phoneNumberId, e: now + TOKEN_TTL_MS, r: randomBytes(8).toString('hex') }),
  ).toString('base64url');
  const mac = createHmac('sha256', tokenKey(credentialKeyHex)).update(body).digest('base64url');
  return `${body}.${mac}`;
}

export function verifyFlowToken(credentialKeyHex: string, token: unknown, now = Date.now()): FlowTokenPayload | null {
  if (typeof token !== 'string' || token.length > 600) return null;
  const parts = token.split('.');
  if (parts.length !== 2 || !parts.every((part) => /^[A-Za-z0-9_-]+$/.test(part))) return null;
  const expected = createHmac('sha256', tokenKey(credentialKeyHex)).update(parts[0]).digest();
  const given = Buffer.from(parts[1], 'base64url');
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null;
  try {
    const parsed = JSON.parse(Buffer.from(parts[0], 'base64url').toString('utf8')) as { t?: unknown; p?: unknown; n?: unknown; e?: unknown };
    if (typeof parsed.t !== 'string' || !isUUID(parsed.t) || typeof parsed.p !== 'string' || !/^\+[1-9]\d{7,14}$/.test(parsed.p)
      || typeof parsed.n !== 'string' || !/^\d{1,30}$/.test(parsed.n) || typeof parsed.e !== 'number' || parsed.e < now) return null;
    return { tenantId: parsed.t, phone: parsed.p, phoneNumberId: parsed.n, expires: parsed.e };
  } catch { return null; }
}

export function flowIdempotencyKey(token: string): string {
  return 'flow:' + createHash('sha256').update(token).digest('hex').slice(0, 48);
}
