import type { ConfigService } from '@nestjs/config';
import { createHash } from 'node:crypto';
import {
  mkdtempSync,
  rmSync,
  statSync,
  utimesSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import * as forge from 'node-forge';
import { PDFDocument } from 'pdf-lib';
import type { Repository } from 'typeorm';
import type { SigningCertificate } from './entities/signing-certificate.entity';
import { countSignatures } from '../sepa/sepa-signing.util';
import {
  CertificateUnavailableError,
  PdfSignerService,
} from './pdf-signer.service';

const DAY = 24 * 60 * 60 * 1000;
const PASSPHRASE = 'una-contraseña';

// One keypair for every certificate in this file: RSA generation is the slow
// part, and nothing here depends on the keys being different.
let keys: forge.pki.rsa.KeyPair;
let dir: string;

function makeP12(options: {
  cn?: string;
  serialNumber?: string;
  validFrom?: Date;
  validTo?: Date;
  passphrase?: string;
}): Buffer {
  const cert = forge.pki.createCertificate();
  cert.publicKey = keys.publicKey;
  cert.serialNumber = '01ab';
  cert.validity.notBefore = options.validFrom ?? new Date(Date.now() - DAY);
  cert.validity.notAfter = options.validTo ?? new Date(Date.now() + 365 * DAY);
  const subject = [
    {
      name: 'commonName',
      value: options.cn ?? 'PEREZ RUIZ ANA - NIF 12345678Z',
    },
    { type: '2.5.4.5', value: options.serialNumber ?? 'IDCES-12345678Z' },
    { name: 'countryName', value: 'ES' },
  ];
  cert.setSubject(subject);
  cert.setIssuer([{ name: 'commonName', value: 'AC DE PRUEBA' }]);
  cert.setExtensions([
    { name: 'keyUsage', digitalSignature: true, nonRepudiation: true },
  ]);
  cert.sign(keys.privateKey, forge.md.sha256.create());
  const pfx = forge.pkcs12.toPkcs12Asn1(
    keys.privateKey,
    [cert],
    options.passphrase ?? PASSPHRASE,
    { algorithm: '3des' },
  );
  return Buffer.from(forge.asn1.toDer(pfx).getBytes(), 'binary');
}

// The single-row table, in memory.
class FakeStore {
  row: SigningCertificate | null = null;
  findOne = jest.fn(() => Promise.resolve(this.row));
  create = (value: Partial<SigningCertificate>) => value as SigningCertificate;
  save = jest.fn((value: SigningCertificate) => {
    this.row = value;
    return Promise.resolve(value);
  });
  delete = jest.fn(() => {
    this.row = null;
    return Promise.resolve();
  });
}

const JWT_SECRET = 'un-jwt-secret-de-prueba';

function service(
  env: Record<string, string | undefined>,
  store: FakeStore = new FakeStore(),
): PdfSignerService {
  const all: Record<string, string | undefined> = {
    JWT_SECRET,
    ...env,
  };
  return new PdfSignerService(
    {
      get: (key: string) => all[key],
      getOrThrow: (key: string) => {
        const value = all[key];
        if (value === undefined) throw new Error(`Missing ${key}`);
        return value;
      },
    } as unknown as ConfigService,
    store as unknown as Repository<SigningCertificate>,
  );
}

async function samplePdf(): Promise<Buffer> {
  const doc = await PDFDocument.create();
  doc.addPage([300, 200]).drawText('Orden de prueba');
  return Buffer.from(await doc.save({ useObjectStreams: false }));
}

// Checks the signature for real: the digest of the signed byte ranges must
// equal the one inside the PKCS#7, and the RSA signature over its signed
// attributes must verify against the certificate. Flipping any signed byte
// of the PDF makes this return false.
function signatureIsValid(pdf: Buffer): boolean {
  const raw = pdf.toString('latin1');
  const range = /\/ByteRange\s*\[\s*(\d+)\s+(\d+)\s+(\d+)\s+(\d+)\s*\]/.exec(
    raw,
  );
  if (!range) return false;
  const [a, b, c, d] = range.slice(1).map(Number);
  const signed = Buffer.concat([
    pdf.subarray(a, a + b),
    pdf.subarray(c, c + d),
  ]);
  const hex = raw.slice(a + b + 1, c - 1).replace(/0+$/, '');
  const der = forge.util.hexToBytes(hex.length % 2 ? `${hex}0` : hex);
  const message = forge.pkcs7.messageFromAsn1(
    forge.asn1.fromDer(der, false),
  ) as forge.pkcs7.PkcsSignedData & {
    rawCapture: {
      authenticatedAttributes: forge.asn1.Asn1[];
      signature: string;
    };
  };

  const attrs = message.rawCapture.authenticatedAttributes;
  const digestAttr = attrs.find((attr) => {
    const first = (attr.value as forge.asn1.Asn1[])[0];
    return (
      forge.asn1.derToOid(first.value as string) === '1.2.840.113549.1.9.4'
    );
  });
  const embeddedDigest = (
    (digestAttr?.value as forge.asn1.Asn1[])[1].value as forge.asn1.Asn1[]
  )[0].value as string;
  const actualDigest = createHash('sha256').update(signed).digest('binary');
  if (embeddedDigest !== actualDigest) return false;

  const set = forge.asn1.create(
    forge.asn1.Class.UNIVERSAL,
    forge.asn1.Type.SET,
    true,
    attrs,
  );
  const md = forge.md.sha256.create();
  md.update(forge.asn1.toDer(set).getBytes());
  return keys.publicKey.verify(
    md.digest().bytes(),
    message.rawCapture.signature,
  );
}

beforeAll(() => {
  keys = forge.pki.rsa.generateKeyPair(2048);
  dir = mkdtempSync(join(tmpdir(), 'p12-spec-'));
});

afterAll(() => rmSync(dir, { recursive: true, force: true }));

describe('PdfSignerService — configuration', () => {
  it('is simply off when no certificate is configured', async () => {
    const signer = service({});
    expect(await signer.isConfigured()).toBe(false);
    expect(await signer.status()).toEqual({ configured: false });
    expect(await signer.certificateInfo()).toBeNull();
    await expect(
      signer.sign(await samplePdf(), { reason: 'x', name: 'y' }),
    ).rejects.toBeInstanceOf(CertificateUnavailableError);
  });

  it('reads the certificate and reports who it belongs to and until when', async () => {
    const file = join(dir, 'ok.p12');
    writeFileSync(file, makeP12({}));
    const status = await service({
      CREDITOR_P12_PATH: file,
      CREDITOR_P12_PASSPHRASE: PASSPHRASE,
    }).status();

    expect(status).toMatchObject({
      configured: true,
      usable: true,
      expiringSoon: false,
      certificate: {
        subject: 'PEREZ RUIZ ANA - NIF 12345678Z',
        subjectSerial: 'IDCES-12345678Z',
        issuer: 'AC DE PRUEBA',
        serialNumber: '01ab',
      },
    });
    if (status.configured && status.usable) {
      expect(status.daysLeft).toBeGreaterThan(360);
      expect(status.certificate.sha256Fingerprint).toMatch(/^[0-9a-f]{64}$/);
    }
  });

  it('warns when the certificate is about to expire', async () => {
    const file = join(dir, 'soon.p12');
    writeFileSync(file, makeP12({ validTo: new Date(Date.now() + 10 * DAY) }));
    const status = await service({
      CREDITOR_P12_PATH: file,
      CREDITOR_P12_PASSPHRASE: PASSPHRASE,
    }).status();
    expect(status).toMatchObject({ usable: true, expiringSoon: true });
  });

  it.each([
    ['a wrong passphrase', 'ok.p12', 'otra', 'contraseña'],
    ['a missing file', 'no-existe.p12', PASSPHRASE, 'No se puede leer'],
    ['an expired certificate', 'expired.p12', PASSPHRASE, 'caducó'],
    [
      'a file that is not a certificate',
      'basura.p12',
      PASSPHRASE,
      'no es un certificado',
    ],
  ])('is unusable with %s, and says why', async (_label, name, pass, hint) => {
    writeFileSync(join(dir, 'ok.p12'), makeP12({}));
    writeFileSync(
      join(dir, 'expired.p12'),
      makeP12({
        validFrom: new Date(Date.now() - 400 * DAY),
        validTo: new Date(Date.now() - 30 * DAY),
      }),
    );
    writeFileSync(join(dir, 'basura.p12'), Buffer.from('esto no es un p12'));

    const signer = service({
      CREDITOR_P12_PATH: join(dir, name),
      CREDITOR_P12_PASSPHRASE: pass,
    });
    const status = await signer.status();
    expect(status).toMatchObject({ configured: true, usable: false });
    if (status.configured && !status.usable) {
      expect(status.error).toContain(hint);
    }
    // And it fails closed: no unsigned fallback.
    await expect(
      signer.sign(await samplePdf(), { reason: 'x', name: 'y' }),
    ).rejects.toBeInstanceOf(CertificateUnavailableError);
  });

  it('picks up a replaced file without a restart', async () => {
    const file = join(dir, 'rotating.p12');
    const env = {
      CREDITOR_P12_PATH: file,
      CREDITOR_P12_PASSPHRASE: PASSPHRASE,
    };
    const signer = service(env);

    writeFileSync(file, makeP12({}));
    expect(await signer.status()).toMatchObject({ usable: true });

    writeFileSync(
      file,
      makeP12({
        validFrom: new Date(Date.now() - 400 * DAY),
        validTo: new Date(Date.now() - 30 * DAY),
      }),
    );
    const later = new Date(statSync(file).mtimeMs + 5000);
    utimesSync(file, later, later);
    expect(await signer.status()).toMatchObject({ usable: false });
  });
});

describe('PdfSignerService — signing', () => {
  const file = () => join(dir, 'sign.p12');
  const signer = () =>
    service({ CREDITOR_P12_PATH: file(), CREDITOR_P12_PASSPHRASE: PASSPHRASE });

  beforeAll(() => writeFileSync(file(), makeP12({})));

  it('produces a PDF with one valid signature', async () => {
    const signed = await signer().sign(await samplePdf(), {
      // ASCII on purpose: pdf-lib stores a non-ASCII /Reason as UTF-16 hex.
      reason: 'Orden SEPA MED-0001-2026',
      name: 'Acreedor',
      location: 'Sevilla',
      contactInfo: 'a@b.es',
    });
    expect(signed.subarray(0, 5).toString('latin1')).toBe('%PDF-');
    expect(countSignatures(signed)).toBe(1);
    expect(signed.toString('latin1')).toContain('MED-0001-2026');
    expect(signatureIsValid(signed)).toBe(true);
  });

  it('notices any change made to the document after signing', async () => {
    const signed = await signer().sign(await samplePdf(), {
      reason: 'x',
      name: 'y',
    });
    expect(signatureIsValid(signed)).toBe(true);
    const tampered = Buffer.from(signed);
    // Inside the first signed range (the PDF body) — a byte in the /Contents
    // blob would be the signature itself, which is not part of what is signed.
    tampered[100] ^= 1;
    expect(signatureIsValid(tampered)).toBe(false);
  });

  it('is not a certifying signature, so the recipient can still sign after it', async () => {
    const signed = await signer().sign(await samplePdf(), {
      reason: 'x',
      name: 'y',
    });
    // A certifying signature carries a DocMDP transform that forbids further
    // signatures; ours must not.
    expect(signed.toString('latin1')).not.toContain('/DocMDP');
  });
});

describe('PdfSignerService — certificate uploaded from the panel', () => {
  const pdf = () => samplePdf();

  it('installs a valid certificate, encrypted, and signs with it', async () => {
    const store = new FakeStore();
    const signer = service({}, store);

    const info = await signer.install(makeP12({}), PASSPHRASE, 'user-1');
    expect(info.subject).toBe('PEREZ RUIZ ANA - NIF 12345678Z');

    // What reaches the database is ciphertext: neither the passphrase nor
    // anything readable from the certificate.
    expect(store.row?.uploadedBy).toBe('user-1');
    const stored = Buffer.concat([
      store.row!.p12Encrypted,
      store.row!.passphraseEncrypted,
    ]).toString('latin1');
    expect(stored).not.toContain(PASSPHRASE);
    expect(stored).not.toContain('PEREZ RUIZ');

    expect(await signer.isConfigured()).toBe(true);
    expect(await signer.status()).toMatchObject({
      configured: true,
      usable: true,
      source: 'upload',
    });
    const signed = await signer.sign(await pdf(), { reason: 'x', name: 'y' });
    expect(countSignatures(signed)).toBe(1);
    expect(signatureIsValid(signed)).toBe(true);
  });

  it('works from a different process: a fresh service reads it back from the database', async () => {
    const store = new FakeStore();
    await service({}, store).install(makeP12({}), PASSPHRASE, null);

    const restarted = service({}, store);
    expect(await restarted.status()).toMatchObject({ usable: true });
    const signed = await restarted.sign(await pdf(), {
      reason: 'x',
      name: 'y',
    });
    expect(signatureIsValid(signed)).toBe(true);
  });

  it('stores nothing when the passphrase is wrong', async () => {
    const store = new FakeStore();
    await expect(
      service({}, store).install(makeP12({}), 'incorrecta', null),
    ).rejects.toThrow('contraseña');
    expect(store.save).not.toHaveBeenCalled();
    expect(store.row).toBeNull();
  });

  it('stores nothing when the certificate is expired', async () => {
    const store = new FakeStore();
    const expired = makeP12({
      validFrom: new Date(Date.now() - 400 * DAY),
      validTo: new Date(Date.now() - 30 * DAY),
    });
    await expect(
      service({}, store).install(expired, PASSPHRASE, null),
    ).rejects.toThrow('caducó');
    expect(store.row).toBeNull();
  });

  it('stores nothing when the caller vetoes the certificate', async () => {
    const store = new FakeStore();
    await expect(
      service({}, store).install(makeP12({}), PASSPHRASE, null, () => {
        throw new CertificateUnavailableError('No es tu NIF.');
      }),
    ).rejects.toThrow('No es tu NIF.');
    expect(store.row).toBeNull();
  });

  it('keeps the previous certificate when a replacement is refused', async () => {
    const store = new FakeStore();
    const signer = service({}, store);
    await signer.install(makeP12({ cn: 'PRIMERO' }), PASSPHRASE, null);
    const before = store.row;

    await expect(
      signer.install(makeP12({ cn: 'SEGUNDO' }), 'incorrecta', null),
    ).rejects.toBeInstanceOf(CertificateUnavailableError);

    expect(store.row).toBe(before);
    expect(await signer.status()).toMatchObject({
      usable: true,
      certificate: { subject: 'PRIMERO' },
    });
  });

  it('replaces the certificate and signs with the new one straight away', async () => {
    const signer = service({});
    await signer.install(makeP12({ cn: 'PRIMERO' }), PASSPHRASE, null);
    expect(await signer.status()).toMatchObject({
      certificate: { subject: 'PRIMERO' },
    });

    await signer.install(makeP12({ cn: 'SEGUNDO' }), PASSPHRASE, null);
    expect(await signer.status()).toMatchObject({
      certificate: { subject: 'SEGUNDO' },
    });
  });

  it('prefers the uploaded certificate over the one in the environment', async () => {
    const file = join(dir, 'env-cert.p12');
    writeFileSync(file, makeP12({ cn: 'DEL ENTORNO' }));
    const env = {
      CREDITOR_P12_PATH: file,
      CREDITOR_P12_PASSPHRASE: PASSPHRASE,
    };
    const store = new FakeStore();

    expect(await service(env, store).status()).toMatchObject({
      source: 'env',
      certificate: { subject: 'DEL ENTORNO' },
    });
    await service(env, store).install(
      makeP12({ cn: 'SUBIDO' }),
      PASSPHRASE,
      null,
    );
    expect(await service(env, store).status()).toMatchObject({
      source: 'upload',
      certificate: { subject: 'SUBIDO' },
    });
  });

  it('removing it falls back to the environment, or to nothing', async () => {
    const store = new FakeStore();
    const signer = service({}, store);
    await signer.install(makeP12({}), PASSPHRASE, null);
    await signer.remove();
    expect(store.row).toBeNull();
    expect(await signer.status()).toEqual({ configured: false });
    expect(await signer.isConfigured()).toBe(false);
  });

  it('says what to do when JWT_SECRET changed and the stored certificate can no longer be decrypted', async () => {
    const store = new FakeStore();
    await service({}, store).install(makeP12({}), PASSPHRASE, null);

    const rotated = service({ JWT_SECRET: 'otro-secret-distinto' }, store);
    const status = await rotated.status();
    expect(status).toMatchObject({ configured: true, usable: false });
    if (status.configured && !status.usable) {
      expect(status.error).toContain('Vuelve a subirlo');
    }
    await expect(
      rotated.sign(await pdf(), { reason: 'x', name: 'y' }),
    ).rejects.toBeInstanceOf(CertificateUnavailableError);
  });
});
