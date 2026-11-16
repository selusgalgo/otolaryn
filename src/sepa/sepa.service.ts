import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, QueryFailedError, Repository } from 'typeorm';
import { Tenant } from '../iam/entities/tenant.entity';
import { mederiLogoDataUri } from '../pdf/mederi-brand';
import { PdfService } from '../pdf/pdf.service';
import {
  CertificateUnavailableError,
  PdfSignerService,
  type SigningCertificateInfo,
  type SigningStatus,
} from '../pdf/pdf-signer.service';
import { UpdateCreditorProfileDto } from './dto/update-creditor-profile.dto';
import { UpsertSepaMandateDto } from './dto/upsert-sepa-mandate.dto';
import { CreditorProfile } from './entities/creditor-profile.entity';
import { SepaMandate } from './entities/sepa-mandate.entity';
import { mandateReference } from './sepa-amounts.util';
import {
  buildSepaMandatePdf,
  type SepaSignatureStamp,
} from './sepa-mandate-pdf.util';
import {
  generateSigningToken,
  sha256Hex,
  signingLinkExpiry,
} from './sepa-signing.util';

// A .p12 is a few KB; this only stops someone sending something huge.
export const MAX_CERTIFICATE_BYTES = 256 * 1024;
const MAX_PASSPHRASE_LENGTH = 200;

const CREDITOR_ID = 1;
const UNIQUE_VIOLATION = '23505';

// The certificate's own status, plus whether it belongs to the creditor named
// in the mandates — a certificate for somebody else's NIF would sign orders as
// the wrong person.
export type CreditorCertificateStatus =
  | Exclude<SigningStatus, { usable: true }>
  | (Extract<SigningStatus, { usable: true }> & {
      matchesCreditorTaxId: boolean;
    });

export interface TenantSepaMandate {
  tenantName: string;
  // What the form pre-fills a brand-new mandate with — the clinic's own
  // profile (Configuración → Perfil de la clínica), when it has one.
  clinicDefaults: { clinicName: string; phone: string | null };
  mandate: SepaMandate | null;
}

// The certificate names its holder in the subject (CN "APELLIDOS NOMBRE - NIF
// 12345678Z", serialNumber "IDCES-12345678Z" on FNMT ones): it belongs to the
// creditor when their NIF appears there.
function certificateMatchesTaxId(
  certificate: SigningCertificateInfo,
  taxId: string,
): boolean {
  // An empty NIF is contained in every text — it must not count as a match.
  if (!taxId.trim()) return false;
  return `${certificate.subjectSerial ?? ''} ${certificate.subject}`
    .toUpperCase()
    .includes(taxId.toUpperCase());
}

// The year a mandate is created in, as Spain sees it — a mandate created
// at 00:30 on 1 January (Madrid) belongs to the new year, not UTC's old one.
function currentMadridYear(): number {
  return Number(
    new Intl.DateTimeFormat('en', {
      timeZone: 'Europe/Madrid',
      year: 'numeric',
    }).format(new Date()),
  );
}

// The creditor row is seeded empty (SepaMandates1736500000000: this repository
// is public, so the real details are never committed). It counts as set up once
// every field a mandate prints is filled in.
export function isCreditorComplete(creditor: CreditorProfile): boolean {
  return [
    creditor.name,
    creditor.taxId,
    creditor.address,
    creditor.postalCode,
    creditor.city,
    creditor.province,
    creditor.country,
    creditor.email,
    creditor.phone,
    creditor.sepaCreditorId,
  ].every((value) => value.trim() !== '');
}

@Injectable()
export class SepaService {
  private readonly logger = new Logger(SepaService.name);

  constructor(
    @InjectRepository(CreditorProfile)
    private readonly creditors: Repository<CreditorProfile>,
    @InjectRepository(SepaMandate)
    private readonly mandates: Repository<SepaMandate>,
    @InjectRepository(Tenant) private readonly tenants: Repository<Tenant>,
    private readonly dataSource: DataSource,
    private readonly pdf: PdfService,
    private readonly signer: PdfSignerService,
  ) {}

  async getCreditor(): Promise<CreditorProfile> {
    const creditor = await this.creditors.findOne({
      where: { id: CREDITOR_ID },
    });
    if (!creditor) {
      // Only possible if the seeded row was removed by hand — the
      // migration always creates it.
      throw new NotFoundException('Faltan los datos del acreedor');
    }
    return creditor;
  }

  // Nothing is issued in the name of an empty creditor. The message is for the
  // superadmin — this is only reachable from the panel (a signing link can't be
  // issued, and a certificate can't be installed, until it's set).
  private assertCreditorComplete(creditor: CreditorProfile): void {
    if (!isCreditorComplete(creditor)) {
      throw new ConflictException(
        'Faltan los datos del acreedor. Complétalos en Facturación → Acreedor SEPA.',
      );
    }
  }

  async updateCreditor(
    dto: UpdateCreditorProfileDto,
  ): Promise<CreditorProfile> {
    const creditor = await this.getCreditor();
    Object.assign(creditor, dto);
    return this.creditors.save(creditor);
  }

  private async findTenant(id: string): Promise<Tenant> {
    const tenant = await this.tenants.findOne({ where: { id } });
    if (!tenant) {
      throw new NotFoundException('Clínica no encontrada');
    }
    return tenant;
  }

  async getMandate(tenantId: string): Promise<TenantSepaMandate> {
    const tenant = await this.findTenant(tenantId);
    const mandate = await this.mandates.findOne({ where: { tenantId } });
    return {
      tenantName: tenant.name,
      clinicDefaults: { clinicName: tenant.name, phone: tenant.phone },
      mandate,
    };
  }

  async upsertMandate(
    tenantId: string,
    dto: UpsertSepaMandateDto,
  ): Promise<SepaMandate> {
    await this.findTenant(tenantId);
    const existing = await this.mandates.findOne({ where: { tenantId } });
    if (existing) {
      if (existing.status === 'firmada') {
        throw new ConflictException(
          'La orden ya está firmada y no se puede modificar. Cancélala primero si hay que rehacerla.',
        );
      }
      Object.assign(existing, dto);
      // Whatever the client saw (and may have started signing) no longer
      // matches the data, so they have to review and confirm it again.
      existing.issuedPdf = null;
      existing.issuedAt = null;
      if (existing.status === 'cancelada') {
        // Editing a cancelled order reopens it as a fresh one. The signature
        // it carried is superseded, so it's dropped here — cancelling alone
        // keeps it (see cancelMandate).
        existing.status = 'pendiente';
        existing.cancelledAt = null;
        existing.signedPdf = null;
        existing.signedAt = null;
        existing.signatureMethod = null;
        existing.signatureEvidence = null;
      }
      await this.mandates.save(existing);
      return this.reload(existing.id);
    }

    const [{ nextval }] = await this.dataSource.query<{ nextval: string }[]>(
      `SELECT nextval('iam.sepa_mandate_number_seq')`,
    );
    const number = Number(nextval);
    try {
      const created = await this.mandates.save(
        this.mandates.create({
          ...dto,
          tenantId,
          number,
          reference: mandateReference(number, currentMadridYear()),
        }),
      );
      return await this.reload(created.id);
    } catch (err) {
      // Two simultaneous "create" saves for the same clinic: tenant_id is
      // unique, so the second one lands here instead of a duplicate.
      if (
        err instanceof QueryFailedError &&
        (err.driverError as { code?: string }).code === UNIQUE_VIOLATION
      ) {
        throw new ConflictException(
          'Esta clínica ya tiene una orden SEPA; recarga la página.',
        );
      }
      throw err;
    }
  }

  // What save() returns carries select:false columns (token hash, PDF bytes)
  // as null/undefined placeholders; reloading hands back exactly what a plain
  // read does, so no response can ever hint at them.
  private reload(id: string): Promise<SepaMandate> {
    return this.mandates.findOneOrFail({ where: { id } });
  }

  private async requireMandate(tenantId: string): Promise<SepaMandate> {
    const mandate = await this.mandates.findOne({ where: { tenantId } });
    if (!mandate) {
      throw new NotFoundException('Esta clínica no tiene orden SEPA todavía');
    }
    return mandate;
  }

  // Only the SHA-256 of the token is stored; the token itself exists once,
  // in this return value, which is why the panel shows the link at that
  // moment. Issuing another one replaces (and so revokes) the previous link.
  async issueSigningLink(
    tenantId: string,
  ): Promise<{ token: string; expiresAt: Date }> {
    const mandate = await this.requireMandate(tenantId);
    this.assertCreditorComplete(await this.getCreditor());
    if (mandate.status === 'firmada') {
      throw new ConflictException('La orden ya está firmada.');
    }
    if (mandate.status === 'cancelada') {
      throw new ConflictException(
        'La orden está cancelada: edítala para reabrirla antes de pedir la firma.',
      );
    }
    const token = generateSigningToken();
    const expiresAt = signingLinkExpiry();
    await this.mandates.update(
      { id: mandate.id },
      { tokenHash: sha256Hex(token), tokenExpiresAt: expiresAt },
    );
    return { token, expiresAt };
  }

  // The signed document and its evidence stay: SEPA requires the creditor to
  // keep them for 14 months after the last debit, cancelled or not.
  async cancelMandate(tenantId: string): Promise<SepaMandate> {
    const mandate = await this.requireMandate(tenantId);
    if (mandate.status === 'cancelada') return mandate;
    mandate.status = 'cancelada';
    mandate.cancelledAt = new Date();
    mandate.tokenHash = null;
    mandate.tokenExpiresAt = null;
    await this.mandates.save(mandate);
    return this.reload(mandate.id);
  }

  /** Current data rendered as PDF — a preview until the order is signed. */
  async renderMandatePdf(
    tenantId: string,
  ): Promise<{ buffer: Buffer; reference: string }> {
    const mandate = await this.requireMandate(tenantId);
    return {
      buffer: await this.renderForMandate(mandate),
      reference: mandate.reference,
    };
  }

  async getSignedPdf(
    tenantId: string,
  ): Promise<{ buffer: Buffer; reference: string }> {
    const mandate = await this.mandates
      .createQueryBuilder('m')
      .addSelect('m.signedPdf')
      .where('m.tenantId = :tenantId', { tenantId })
      .getOne();
    if (!mandate?.signedPdf) {
      throw new NotFoundException('Esta orden todavía no está firmada');
    }
    return { buffer: mandate.signedPdf, reference: mandate.reference };
  }

  async getCertificateStatus(): Promise<CreditorCertificateStatus> {
    const status = await this.signer.status();
    if (!status.configured || !status.usable) return status;
    const creditor = await this.getCreditor();
    return {
      ...status,
      matchesCreditorTaxId: certificateMatchesTaxId(
        status.certificate,
        creditor.taxId,
      ),
    };
  }

  // Installs the certificate uploaded from the panel — only if EVERYTHING is
  // right: readable, correct passphrase, in date, able to sign, and issued to
  // the creditor named on the mandates. A certificate for a different NIF
  // would put somebody else's signature on every order.
  async installCertificate(
    file: { buffer: Buffer } | undefined,
    passphrase: string | undefined,
    uploadedBy: string,
  ): Promise<CreditorCertificateStatus> {
    if (!file || file.buffer.length === 0) {
      throw new BadRequestException(
        'Adjunta el archivo del certificado (.p12).',
      );
    }
    if (!passphrase) {
      throw new BadRequestException('Escribe la contraseña del certificado.');
    }
    if (passphrase.length > MAX_PASSPHRASE_LENGTH) {
      throw new BadRequestException('La contraseña es demasiado larga.');
    }

    const creditor = await this.getCreditor();
    this.assertCreditorComplete(creditor);
    try {
      const info = await this.signer.install(
        file.buffer,
        passphrase,
        uploadedBy,
        (certificate) => {
          if (!certificateMatchesTaxId(certificate, creditor.taxId)) {
            throw new CertificateUnavailableError(
              `Este certificado es de «${certificate.subject}» y no corresponde al NIF del acreedor (${creditor.taxId}). Si tu NIF ha cambiado, actualiza antes los datos del acreedor.`,
            );
          }
        },
      );
      // Who and what — never the file or the passphrase.
      this.logger.log(
        `Certificado digital instalado por ${uploadedBy}: ${info.subject} (huella ${info.sha256Fingerprint.slice(0, 16)})`,
      );
    } catch (err) {
      // Their messages are written for whoever is uploading (wrong
      // passphrase, expired...), so they go back as they are.
      if (err instanceof CertificateUnavailableError) {
        throw new BadRequestException(err.message);
      }
      throw err;
    }
    return this.getCertificateStatus();
  }

  async removeCertificate(
    removedBy: string,
  ): Promise<CreditorCertificateStatus> {
    await this.signer.remove();
    this.logger.log(`Certificado digital quitado por ${removedBy}`);
    return this.getCertificateStatus();
  }

  // Shared with the public signing service, which renders the document the
  // client reviews (and, for a web signature, the final one with its stamp).
  // When a certificate is configured every document leaves signed by it; if
  // that fails the render FAILS — never an unsigned PDF that says it's signed.
  async renderForMandate(
    mandate: SepaMandate,
    signature?: SepaSignatureStamp,
  ): Promise<Buffer> {
    const creditor = await this.getCreditor();
    this.assertCreditorComplete(creditor);
    const sealed = await this.signer.isConfigured();
    const pdf = await this.pdf.render(
      buildSepaMandatePdf({
        creditor,
        mandate,
        logo: mederiLogoDataUri(),
        signature,
        sealedByCreditor: sealed,
        sealedAt: sealed ? new Date() : undefined,
      }),
    );
    if (!sealed) return pdf;

    try {
      return await this.signer.sign(pdf, {
        reason: `Orden de domiciliación SEPA ${mandate.reference}`,
        name: creditor.name,
        location: creditor.city,
        contactInfo: creditor.email,
      });
    } catch (err) {
      // The cause (expired, wrong passphrase...) is for the superadmin — it
      // shows on Facturación — not for whoever is on the signing page.
      this.logger.error(
        `No se pudo firmar la orden ${mandate.reference}: ${err instanceof Error ? err.message : String(err)}`,
      );
      throw new ServiceUnavailableException(
        'No se puede generar el documento firmado en este momento. Inténtalo de nuevo más tarde.',
      );
    }
  }
}
