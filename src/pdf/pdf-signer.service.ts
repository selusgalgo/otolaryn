import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { pdflibAddPlaceholder } from '@signpdf/placeholder-pdf-lib';
import { P12Signer } from '@signpdf/signer-p12';
import { SignPdf } from '@signpdf/signpdf';
import { createHash } from 'node:crypto';
import { readFileSync, statSync } from 'node:fs';
import * as forge from 'node-forge';
import { PDFDocument } from 'pdf-lib';
import { Repository } from 'typeorm';
import { SigningCertificate } from './entities/signing-certificate.entity';
import {
  decryptSecret,
  deriveSecretBoxKey,
  encryptSecret,
  SecretBoxError,
} from './secret-box.util';

// Signs the PDFs this platform issues with the owner's digital certificate
// (a PKCS#12 file, e.g. the FNMT autónomo certificate), so a document reaches
// its recipient already signed by us — and whatever they add (their own
// certificate signature) is appended after it, leaving ours valid.
//
// Where the certificate comes from, in order:
//   1. Uploaded from the superadmin panel (Facturación → Certificado digital):
//      the .p12 and its passphrase are stored in the database as ciphertext
//      (SecretBox, key derived from JWT_SECRET) — never in plaintext, never
//      returned by any endpoint.
//   2. CREDITOR_P12_PATH / CREDITOR_P12_PASSPHRASE in the server environment.
// Neither → the platform keeps issuing unsigned PDFs (development).
// Configured but broken (wrong passphrase, expired, unreadable) → signing
// FAILS rather than quietly sending a document the recipient has been told is
// signed.

export class CertificateUnavailableError extends Error {}

export type CertificateSource = 'upload' | 'env';

export interface SigningCertificateInfo {
  /** Common name, e.g. "PEREZ RUIZ ANA - NIF 12345678Z". */
  subject: string;
  /** subject serialNumber attribute, e.g. "IDCES-12345678Z" (FNMT). */
  subjectSerial: string | null;
  issuer: string;
  serialNumber: string;
  sha256Fingerprint: string;
  validFrom: Date;
  validTo: Date;
}

export type SigningStatus =
  | { configured: false }
  | {
      configured: true;
      usable: false;
      error: string;
      source: CertificateSource;
    }
  | {
      configured: true;
      usable: true;
      source: CertificateSource;
      certificate: SigningCertificateInfo;
      daysLeft: number;
      expiringSoon: boolean;
    };

export interface SignMeta {
  reason: string;
  name: string;
  location?: string;
  contactInfo?: string;
}

export const EXPIRY_WARNING_DAYS = 30;

// Room reserved in the PDF for the PKCS#7 blob: the signature plus the whole
// certificate chain (an FNMT chain is ~3 certificates, ~5 KB).
const SIGNATURE_LENGTH = 16384;
const DAY_MS = 24 * 60 * 60 * 1000;
const OID_SERIAL_NUMBER = '2.5.4.5';

// The single stored certificate, and what each ciphertext column is bound to.
const CERT_ROW_ID = 1;
const PURPOSE_P12 = 'signing-certificate:p12';
const PURPOSE_PASSPHRASE = 'signing-certificate:passphrase';

interface Material {
  key: string;
  p12: Buffer;
  passphrase: string;
}

interface LoadedCertificate extends Material {
  info: SigningCertificateInfo;
}

function attr(
  name: { getField(f: string | { type: string }): { value: unknown } | null },
  field: string | { type: string },
): string | null {
  const found = name.getField(field);
  return found && typeof found.value === 'string' ? found.value : null;
}

@Injectable()
export class PdfSignerService {
  private loaded: LoadedCertificate | null = null;

  constructor(
    private readonly config: ConfigService,
    @InjectRepository(SigningCertificate)
    private readonly store: Repository<SigningCertificate>,
  ) {}

  private uploadedRow(): Promise<SigningCertificate | null> {
    return this.store.findOne({ where: { id: CERT_ROW_ID } });
  }

  private envSettings() {
    return {
      path: (this.config.get<string>('CREDITOR_P12_PATH') ?? '').trim(),
      passphrase: this.config.get<string>('CREDITOR_P12_PASSPHRASE') ?? '',
    };
  }

  private secretKey(): Buffer {
    return deriveSecretBoxKey(this.config.getOrThrow<string>('JWT_SECRET'));
  }

  async isConfigured(): Promise<boolean> {
    return (
      Boolean(await this.uploadedRow()) || Boolean(this.envSettings().path)
    );
  }

  // The raw certificate and passphrase to use right now, or null if there are
  // none. An upload wins over the environment.
  private async material(): Promise<Material | null> {
    const row = await this.uploadedRow();
    if (row) {
      try {
        const key = this.secretKey();
        return {
          key: `upload:${createHash('sha256').update(row.p12Encrypted).digest('hex')}`,
          p12: decryptSecret(row.p12Encrypted, key, PURPOSE_P12),
          passphrase: decryptSecret(
            row.passphraseEncrypted,
            key,
            PURPOSE_PASSPHRASE,
          ).toString('utf8'),
        };
      } catch (err) {
        if (err instanceof SecretBoxError) {
          throw new CertificateUnavailableError(
            'No se puede descifrar el certificado guardado (¿ha cambiado la clave secreta del servidor?). Vuelve a subirlo.',
          );
        }
        throw err;
      }
    }

    // Re-reads the file when it changes on disk, so renewing the certificate
    // is just replacing the file — no restart (the passphrase is env: changing
    // that one does need a restart).
    const { path, passphrase } = this.envSettings();
    if (!path) return null;
    let p12: Buffer;
    let stamp: string;
    try {
      const stat = statSync(path);
      stamp = `${stat.mtimeMs}:${stat.size}`;
      p12 = readFileSync(path);
    } catch {
      throw new CertificateUnavailableError(
        `No se puede leer el archivo del certificado (${path}). Comprueba que existe y que el usuario del servicio puede leerlo.`,
      );
    }
    return {
      key: `env:${path}:${stamp}:${createHash('sha256').update(passphrase).digest('hex')}`,
      p12,
      passphrase,
    };
  }

  private async load(): Promise<LoadedCertificate> {
    const material = await this.material();
    if (!material) {
      throw new CertificateUnavailableError(
        'No hay ningún certificado configurado.',
      );
    }
    if (this.loaded?.key === material.key) return this.loaded;
    this.loaded = await this.verify(material);
    return this.loaded;
  }

  // Parses the certificate and proves it can actually sign before it's
  // reported usable: a file that parses can still fail at signing time
  // (unsupported algorithm...).
  private async verify(material: Material): Promise<LoadedCertificate> {
    const info = this.parse(material.p12, material.passphrase);
    const loaded = { ...material, info };
    await this.signWith(loaded, await this.tinyPdf(), {
      reason: 'Prueba de firma',
      name: info.subject,
    }).catch((err: unknown) => {
      throw new CertificateUnavailableError(
        `El certificado se lee pero no puede firmar: ${err instanceof Error ? err.message : String(err)}`,
      );
    });
    return loaded;
  }

  /**
   * Full check of a certificate that is NOT installed yet (passphrase,
   * validity, and a real test signature). Throws CertificateUnavailableError
   * with a message meant for the person uploading it.
   */
  async inspect(
    p12: Buffer,
    passphrase: string,
  ): Promise<SigningCertificateInfo> {
    const { info } = await this.verify({ key: 'inspect', p12, passphrase });
    this.assertWithinValidity(info);
    return info;
  }

  /**
   * Installs an uploaded certificate, replacing any previous one. Everything
   * is verified first, and `validate` can still veto it (e.g. wrong NIF) —
   * nothing is stored unless every check passes.
   */
  async install(
    p12: Buffer,
    passphrase: string,
    uploadedBy: string | null,
    validate?: (info: SigningCertificateInfo) => void,
  ): Promise<SigningCertificateInfo> {
    const info = await this.inspect(p12, passphrase);
    validate?.(info);
    const key = this.secretKey();
    await this.store.save(
      this.store.create({
        id: CERT_ROW_ID,
        p12Encrypted: encryptSecret(p12, key, PURPOSE_P12),
        passphraseEncrypted: encryptSecret(
          Buffer.from(passphrase, 'utf8'),
          key,
          PURPOSE_PASSPHRASE,
        ),
        uploadedAt: new Date(),
        uploadedBy,
      }),
    );
    this.loaded = null;
    return info;
  }

  /** Removes an uploaded certificate (one set in the environment stays). */
  async remove(): Promise<void> {
    await this.store.delete({ id: CERT_ROW_ID });
    this.loaded = null;
  }

  private parse(p12: Buffer, passphrase: string): SigningCertificateInfo {
    let bundle: forge.pkcs12.Pkcs12Pfx;
    try {
      const asn1 = forge.asn1.fromDer(
        forge.util.createBuffer(p12.toString('binary')),
      );
      bundle = forge.pkcs12.pkcs12FromAsn1(asn1, false, passphrase);
    } catch (err) {
      const message = err instanceof Error ? err.message : '';
      if (/password|MAC could not be verified/i.test(message)) {
        throw new CertificateUnavailableError(
          'La contraseña del certificado no es correcta.',
        );
      }
      if (/unsupported|mac algorithm|pbkdf2|pbes2/i.test(message)) {
        throw new CertificateUnavailableError(
          'El formato del .p12 no es compatible (cifrado moderno de OpenSSL 3). Expórtalo de nuevo con la opción -legacy o desde el gestor de certificados del navegador.',
        );
      }
      throw new CertificateUnavailableError(
        'El archivo no es un certificado .p12 válido.',
      );
    }

    const keyBags =
      bundle.getBags({ bagType: forge.pki.oids.pkcs8ShroudedKeyBag })[
        forge.pki.oids.pkcs8ShroudedKeyBag
      ] ?? [];
    const privateKey = keyBags[0]?.key;
    if (!privateKey?.n || !privateKey.e) {
      throw new CertificateUnavailableError(
        'El .p12 no contiene una clave privada RSA protegida con contraseña.',
      );
    }

    // The leaf is the certificate whose public key matches the private one
    // (the file also carries the intermediate and root CAs).
    const certBags =
      bundle.getBags({ bagType: forge.pki.oids.certBag })[
        forge.pki.oids.certBag
      ] ?? [];
    const leaf = certBags
      .map((bag) => bag.cert)
      .find((cert) => {
        const publicKey = cert?.publicKey as
          forge.pki.rsa.PublicKey | undefined;
        return (
          publicKey?.n &&
          publicKey.e &&
          privateKey.n.compareTo(publicKey.n) === 0 &&
          privateKey.e.compareTo(publicKey.e) === 0
        );
      });
    if (!leaf) {
      throw new CertificateUnavailableError(
        'El .p12 no contiene el certificado que corresponde a su clave privada.',
      );
    }

    const keyUsage = leaf.getExtension('keyUsage') as {
      digitalSignature?: boolean;
      nonRepudiation?: boolean;
    } | null;
    if (keyUsage && !keyUsage.digitalSignature && !keyUsage.nonRepudiation) {
      throw new CertificateUnavailableError(
        'Este certificado no está habilitado para firmar documentos.',
      );
    }

    const der = forge.asn1.toDer(forge.pki.certificateToAsn1(leaf)).getBytes();
    return {
      subject: attr(leaf.subject, 'CN') ?? 'Sin nombre',
      subjectSerial: attr(leaf.subject, { type: OID_SERIAL_NUMBER }),
      issuer: attr(leaf.issuer, 'CN') ?? 'Desconocido',
      serialNumber: leaf.serialNumber,
      sha256Fingerprint: createHash('sha256')
        .update(Buffer.from(der, 'binary'))
        .digest('hex'),
      validFrom: leaf.validity.notBefore,
      validTo: leaf.validity.notAfter,
    };
  }

  // Not cached with the certificate: validity depends on today's date.
  private assertWithinValidity(info: SigningCertificateInfo): void {
    const now = new Date();
    if (info.validTo < now) {
      throw new CertificateUnavailableError(
        `El certificado caducó el ${info.validTo.toLocaleDateString('es-ES')}. Instala el renovado.`,
      );
    }
    if (info.validFrom > now) {
      throw new CertificateUnavailableError(
        `El certificado aún no es válido (desde el ${info.validFrom.toLocaleDateString('es-ES')}).`,
      );
    }
  }

  async status(): Promise<SigningStatus> {
    const uploaded = Boolean(await this.uploadedRow());
    if (!uploaded && !this.envSettings().path) return { configured: false };
    const source: CertificateSource = uploaded ? 'upload' : 'env';
    try {
      const { info } = await this.load();
      this.assertWithinValidity(info);
      const daysLeft = Math.floor(
        (info.validTo.getTime() - Date.now()) / DAY_MS,
      );
      return {
        configured: true,
        usable: true,
        source,
        certificate: info,
        daysLeft,
        expiringSoon: daysLeft <= EXPIRY_WARNING_DAYS,
      };
    } catch (err) {
      if (err instanceof CertificateUnavailableError) {
        return { configured: true, usable: false, error: err.message, source };
      }
      throw err;
    }
  }

  /** The certificate that seals documents, or null when none is configured. */
  async certificateInfo(): Promise<SigningCertificateInfo | null> {
    if (!(await this.isConfigured())) return null;
    const { info } = await this.load();
    this.assertWithinValidity(info);
    return info;
  }

  private async tinyPdf(): Promise<Buffer> {
    const doc = await PDFDocument.create();
    doc.addPage([200, 100]);
    return Buffer.from(await doc.save({ useObjectStreams: false }));
  }

  // PDF in, same PDF out with an approval signature appended. Deliberately
  // NOT a certifying signature (no DocMDP): the recipient has to be able to
  // add theirs afterwards.
  private async signWith(
    cert: Pick<LoadedCertificate, 'p12' | 'passphrase'>,
    pdf: Buffer,
    meta: SignMeta,
  ): Promise<Buffer> {
    const pdfDoc = await PDFDocument.load(pdf, { updateMetadata: false });
    pdflibAddPlaceholder({
      pdfDoc,
      reason: meta.reason,
      contactInfo: meta.contactInfo ?? '',
      name: meta.name,
      location: meta.location ?? '',
      signatureLength: SIGNATURE_LENGTH,
    });
    // signpdf locates the placeholder in a classic (non-compressed) layout.
    const withPlaceholder = Buffer.from(
      await pdfDoc.save({ useObjectStreams: false }),
    );
    const signer = new P12Signer(cert.p12, { passphrase: cert.passphrase });
    return new SignPdf().sign(withPlaceholder, signer);
  }

  async sign(pdf: Buffer, meta: SignMeta): Promise<Buffer> {
    const cert = await this.load();
    this.assertWithinValidity(cert.info);
    return this.signWith(cert, pdf, meta);
  }
}
