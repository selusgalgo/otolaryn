import {
  BadRequestException,
  ConflictException,
  GoneException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { SepaDebtorDto } from './dto/sepa-debtor.dto';
import { CreditorProfile } from './entities/creditor-profile.entity';
import {
  SepaMandate,
  SepaSignatureEvidence,
} from './entities/sepa-mandate.entity';
import { PdfSignerService } from '../pdf/pdf-signer.service';
import { computeSepaAmounts } from './sepa-amounts.util';
import {
  countSignatures,
  isPdf,
  isWellFormedToken,
  normalizeName,
  sha256Hex,
  startsWithIssued,
} from './sepa-signing.util';
import { SepaService } from './sepa.service';

export interface ClientContext {
  ip: string | null;
  userAgent: string | null;
}

// What the signing page gets to see: the order's terms, the creditor, and
// the debtor's own data (so the form can be pre-filled). Never the token
// hash, the PDFs' bytes, or other clinics' anything.
export interface PublicSepaView {
  status: 'pendiente' | 'firmada';
  reference: string;
  clinicName: string;
  planName: string;
  firstChargeDate: string;
  amounts: {
    baseCents: number;
    vatCents: number;
    irpfCents: number;
    totalCents: number;
  };
  vatPercent: number;
  irpfPercent: number;
  creditor: {
    name: string;
    taxId: string;
    address: string;
    postalCode: string;
    city: string;
    province: string;
    email: string;
    phone: string;
    website: string | null;
    sepaCreditorId: string;
  };
  debtor: {
    holderName: string | null;
    holderTaxId: string | null;
    signerName: string | null;
    signerPosition: string | null;
    address: string | null;
    postalCode: string | null;
    city: string | null;
    province: string | null;
    country: string | null;
    email: string | null;
    phone: string | null;
    iban: string | null;
    bic: string | null;
  };
  // The client has saved their data and reviewed the generated document —
  // signing is only possible from here on.
  readyToSign: boolean;
  // When the document under review was generated — changes every time the
  // client re-saves their data, so the page can reload the PDF viewer.
  issuedAt: string | null;
  signedAt: string | null;
  signatureMethod: 'web' | 'certificate' | null;
  expiresAt: string | null;
}

const MAX_USER_AGENT = 300;

@Injectable()
export class SepaSigningService {
  constructor(
    @InjectRepository(SepaMandate)
    private readonly mandates: Repository<SepaMandate>,
    private readonly sepa: SepaService,
    private readonly signer: PdfSignerService,
  ) {}

  // Which certificate sealed the document the client signed, for the proof.
  private async creditorSeal(): Promise<SepaSignatureEvidence['creditorSeal']> {
    const info = await this.signer.certificateInfo().catch(() => null);
    return info
      ? {
          subject: info.subject,
          serialNumber: info.serialNumber,
          sha256Fingerprint: info.sha256Fingerprint,
        }
      : null;
  }

  // The token is the credential: unknown, malformed or expired all end the
  // same way for the caller, except "expired", which says so (the client's
  // fix is different: ask for a new link).
  private async findByToken(
    token: string,
    extraSelect: ('issuedPdf' | 'signedPdf')[] = [],
  ): Promise<SepaMandate> {
    if (!isWellFormedToken(token)) {
      throw new NotFoundException('Enlace no válido');
    }
    const query = this.mandates
      .createQueryBuilder('m')
      .where('m.tokenHash = :hash', { hash: sha256Hex(token) });
    for (const column of extraSelect) query.addSelect(`m.${column}`);
    const mandate = await query.getOne();
    if (!mandate || mandate.status === 'cancelada') {
      throw new NotFoundException('Enlace no válido');
    }
    if (mandate.tokenExpiresAt && mandate.tokenExpiresAt < new Date()) {
      throw new GoneException(
        'Este enlace ha caducado. Pide uno nuevo a quien te lo envió.',
      );
    }
    return mandate;
  }

  async getView(token: string): Promise<PublicSepaView> {
    const mandate = await this.findByToken(token, ['issuedPdf']);
    return this.toView(mandate);
  }

  private async toView(mandate: SepaMandate): Promise<PublicSepaView> {
    const creditor: CreditorProfile = await this.sepa.getCreditor();
    return {
      status: mandate.status === 'firmada' ? 'firmada' : 'pendiente',
      reference: mandate.reference,
      clinicName: mandate.clinicName,
      planName: mandate.planName,
      firstChargeDate: mandate.firstChargeDate,
      amounts: computeSepaAmounts(
        mandate.monthlyBase,
        mandate.vatPercent,
        mandate.irpfPercent,
      ),
      vatPercent: mandate.vatPercent,
      irpfPercent: mandate.irpfPercent,
      creditor: {
        name: creditor.name,
        taxId: creditor.taxId,
        address: creditor.address,
        postalCode: creditor.postalCode,
        city: creditor.city,
        province: creditor.province,
        email: creditor.email,
        phone: creditor.phone,
        website: creditor.website,
        sepaCreditorId: creditor.sepaCreditorId,
      },
      debtor: {
        holderName: mandate.holderName,
        holderTaxId: mandate.holderTaxId,
        signerName: mandate.signerName,
        signerPosition: mandate.signerPosition,
        address: mandate.address,
        postalCode: mandate.postalCode,
        city: mandate.city,
        province: mandate.province,
        country: mandate.country,
        email: mandate.email,
        phone: mandate.phone,
        iban: mandate.iban,
        bic: mandate.bic,
      },
      readyToSign: mandate.issuedPdf != null,
      issuedAt: mandate.issuedAt?.toISOString() ?? null,
      signedAt: mandate.signedAt?.toISOString() ?? null,
      signatureMethod: mandate.signatureMethod,
      expiresAt: mandate.tokenExpiresAt?.toISOString() ?? null,
    };
  }

  // Saving the debtor data is also what generates the document the client
  // then reviews and signs: those exact bytes are kept (issuedPdf) so the
  // signature, or the signed upload, can be tied back to them.
  async saveDebtor(token: string, dto: SepaDebtorDto): Promise<PublicSepaView> {
    const mandate = await this.findByToken(token);
    if (mandate.status !== 'pendiente') {
      throw new ConflictException('Esta orden ya está firmada.');
    }
    Object.assign(mandate, dto);
    mandate.issuedPdf = await this.sepa.renderForMandate(mandate);
    mandate.issuedAt = new Date();
    const saved = await this.mandates.save(mandate);
    return this.toView(saved);
  }

  /** The signed document once signed; otherwise the one issued to review. */
  async getPdf(token: string): Promise<{ buffer: Buffer; reference: string }> {
    const mandate = await this.findByToken(token, ['issuedPdf', 'signedPdf']);
    const buffer =
      mandate.status === 'firmada' ? mandate.signedPdf : mandate.issuedPdf;
    if (!buffer) {
      throw new ConflictException(
        'Guarda primero tus datos para generar el documento.',
      );
    }
    return { buffer, reference: mandate.reference };
  }

  private requireSignable(mandate: SepaMandate): Buffer {
    if (mandate.status !== 'pendiente') {
      throw new ConflictException('Esta orden ya está firmada.');
    }
    if (!mandate.issuedPdf) {
      throw new ConflictException(
        'Guarda primero tus datos y revisa el documento antes de firmar.',
      );
    }
    return mandate.issuedPdf;
  }

  // The conditional update (status still 'pendiente') is what makes signing
  // happen once even if two requests race: only one affects a row.
  private async storeSignature(
    mandate: SepaMandate,
    signedPdf: Buffer,
    evidence: SepaSignatureEvidence,
  ): Promise<PublicSepaView> {
    const result = await this.mandates
      .createQueryBuilder()
      .update(SepaMandate)
      .set({
        status: 'firmada',
        signedPdf,
        signedAt: new Date(evidence.signedAt),
        signatureMethod: evidence.method,
        signatureEvidence: evidence,
      })
      .where('id = :id AND status = :status', {
        id: mandate.id,
        status: 'pendiente',
      })
      .execute();
    if (!result.affected) {
      throw new ConflictException('Esta orden ya está firmada.');
    }
    // The link stays valid until it expires so the client can come back and
    // download their copy; the view is built from the stored row, not the token.
    const signed = await this.mandates.findOneOrFail({
      where: { id: mandate.id },
    });
    return this.toView(signed);
  }

  async signWeb(
    token: string,
    typedName: string,
    ctx: ClientContext,
  ): Promise<PublicSepaView> {
    const mandate = await this.findByToken(token, ['issuedPdf']);
    const issued = this.requireSignable(mandate);
    if (
      !mandate.signerName ||
      normalizeName(typedName) !== normalizeName(mandate.signerName)
    ) {
      throw new BadRequestException(
        'Escribe tu nombre completo exactamente como aparece en «Firmante» del documento.',
      );
    }
    const signedAt = new Date();
    const issuedSha = sha256Hex(issued);
    const signedPdf = await this.sepa.renderForMandate(mandate, {
      signerName: mandate.signerName,
      signedAt,
      ip: ctx.ip,
      verificationCode: issuedSha.slice(0, 16),
    });
    return this.storeSignature(mandate, signedPdf, {
      method: 'web',
      signedAt: signedAt.toISOString(),
      ip: ctx.ip,
      userAgent: ctx.userAgent?.slice(0, MAX_USER_AGENT) ?? null,
      issuedPdfSha256: issuedSha,
      signedPdfSha256: sha256Hex(signedPdf),
      creditorSeal: await this.creditorSeal(),
      typedName: typedName.trim(),
    });
  }

  async signWithCertificate(
    token: string,
    file: { buffer: Buffer; originalname: string } | undefined,
    ctx: ClientContext,
  ): Promise<PublicSepaView> {
    const mandate = await this.findByToken(token, ['issuedPdf']);
    const issued = this.requireSignable(mandate);
    if (!file || file.buffer.length === 0) {
      throw new BadRequestException('Adjunta el PDF firmado.');
    }
    if (!isPdf(file.buffer)) {
      throw new BadRequestException('El archivo no es un PDF.');
    }
    // The issued document may already carry our signature; the client's is
    // there only if the file has more signatures than the one we gave them.
    if (countSignatures(file.buffer) <= countSignatures(issued)) {
      throw new BadRequestException(
        'No encuentro tu firma digital en el PDF. Fírmalo con tu certificado (p. ej. con AutoFirma), sin modificar nada más, y vuelve a subirlo.',
      );
    }
    return this.storeSignature(mandate, file.buffer, {
      method: 'certificate',
      signedAt: new Date().toISOString(),
      ip: ctx.ip,
      userAgent: ctx.userAgent?.slice(0, MAX_USER_AGENT) ?? null,
      issuedPdfSha256: sha256Hex(issued),
      signedPdfSha256: sha256Hex(file.buffer),
      creditorSeal: await this.creditorSeal(),
      fileName: file.originalname.slice(0, 200),
      extendsIssuedPdf: startsWithIssued(file.buffer, issued),
    });
  }
}
