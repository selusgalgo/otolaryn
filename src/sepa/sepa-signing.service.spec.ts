import {
  BadRequestException,
  ConflictException,
  GoneException,
  NotFoundException,
} from '@nestjs/common';
import type { PdfSignerService } from '../pdf/pdf-signer.service';
import type { SepaMandate } from './entities/sepa-mandate.entity';
import { SepaSigningService } from './sepa-signing.service';
import { generateSigningToken, sha256Hex } from './sepa-signing.util';
import type { SepaService } from './sepa.service';

const ctx = { ip: '203.0.113.7', userAgent: 'jest' };

function mandate(overrides: Partial<SepaMandate> = {}): SepaMandate {
  return {
    id: 'm1',
    reference: 'MED-0001-2026',
    status: 'pendiente',
    clinicName: 'Clínica Ejemplo',
    planName: 'Plan',
    monthlyBase: 50,
    vatPercent: 21,
    irpfPercent: 15,
    firstChargeDate: '2026-12-01',
    signerName: 'Ana Pérez',
    issuedPdf: Buffer.from('%PDF-1.7 issued'),
    tokenExpiresAt: new Date(Date.now() + 60_000),
    ...overrides,
  } as SepaMandate;
}

// A just-enough stand-in for the query builder chains the service uses.
function setup(found: SepaMandate | null, affected = 1) {
  const executed: Record<string, unknown>[] = [];
  const qb: Record<string, jest.Mock> = {};
  qb.where = jest.fn().mockReturnValue(qb);
  qb.addSelect = jest.fn().mockReturnValue(qb);
  qb.getOne = jest.fn().mockResolvedValue(found);
  qb.update = jest.fn().mockReturnValue(qb);
  qb.set = jest.fn((values: Record<string, unknown>) => {
    executed.push(values);
    return qb;
  });
  qb.execute = jest.fn().mockResolvedValue({ affected });
  const repo = {
    createQueryBuilder: jest.fn().mockReturnValue(qb),
    findOneOrFail: jest.fn().mockResolvedValue(found),
    save: jest.fn((m: SepaMandate) => Promise.resolve(m)),
  };
  const sepa = {
    getCreditor: jest.fn().mockResolvedValue({
      name: 'Acreedor',
      taxId: '12345678Z',
      address: 'Calle 1',
      postalCode: '41001',
      city: 'Sevilla',
      province: 'Sevilla',
      email: 'a@b.es',
      phone: '600',
      website: null,
      sepaCreditorId: 'ES58ZZZ12345678Z',
    }),
    renderForMandate: jest
      .fn()
      .mockResolvedValue(Buffer.from('%PDF-1.7 final')),
  };
  const signer = {
    certificateInfo: jest.fn().mockResolvedValue({
      subject: 'ACREEDOR PRUEBA',
      serialNumber: '01ab',
      sha256Fingerprint: 'f'.repeat(64),
    }),
  };
  const service = new SepaSigningService(
    repo as never,
    sepa as unknown as SepaService,
    signer as unknown as PdfSignerService,
  );
  return { service, repo, sepa, signer, qb, executed };
}

describe('SepaSigningService — link resolution', () => {
  it('rejects a malformed token without touching the database', async () => {
    const { service, repo } = setup(null);
    await expect(service.getView('nope')).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(repo.createQueryBuilder).not.toHaveBeenCalled();
  });

  it('looks the mandate up by the SHA-256 of the token', async () => {
    const token = generateSigningToken();
    const { service, qb } = setup(mandate());
    await service.getView(token);
    expect(qb.where).toHaveBeenCalledWith('m.tokenHash = :hash', {
      hash: sha256Hex(token),
    });
  });

  it('treats an unknown token and a cancelled order alike', async () => {
    const token = generateSigningToken();
    await expect(setup(null).service.getView(token)).rejects.toBeInstanceOf(
      NotFoundException,
    );
    await expect(
      setup(mandate({ status: 'cancelada' })).service.getView(token),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('says so when the link has expired', async () => {
    const expired = mandate({ tokenExpiresAt: new Date(Date.now() - 1000) });
    await expect(
      setup(expired).service.getView(generateSigningToken()),
    ).rejects.toBeInstanceOf(GoneException);
  });

  it('only reports readyToSign once a document has been issued', async () => {
    const token = generateSigningToken();
    const ready = await setup(mandate()).service.getView(token);
    const notReady = await setup(mandate({ issuedPdf: null })).service.getView(
      token,
    );
    expect(ready.readyToSign).toBe(true);
    expect(notReady.readyToSign).toBe(false);
  });
});

describe('SepaSigningService — web signature', () => {
  const token = generateSigningToken();

  it('refuses a name that is not the signer’s', async () => {
    const { service } = setup(mandate());
    await expect(
      service.signWeb(token, 'Otra Persona', ctx),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('refuses to sign before the client has saved their data', async () => {
    const { service } = setup(mandate({ issuedPdf: null }));
    await expect(
      service.signWeb(token, 'Ana Pérez', ctx),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('refuses a second signature', async () => {
    const { service } = setup(mandate({ status: 'firmada' }));
    await expect(
      service.signWeb(token, 'Ana Pérez', ctx),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('accepts the name ignoring case and accents, and stores the evidence', async () => {
    const { service, sepa, executed } = setup(mandate());
    await service.signWeb(token, '  ana PEREZ ', ctx);
    expect(sepa.renderForMandate).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ signerName: 'Ana Pérez', ip: ctx.ip }),
    );
    const stored = executed[0];
    expect(stored.status).toBe('firmada');
    expect(stored.signatureMethod).toBe('web');
    expect(stored.signatureEvidence).toEqual(
      expect.objectContaining({
        method: 'web',
        ip: ctx.ip,
        typedName: 'ana PEREZ',
        issuedPdfSha256: sha256Hex(Buffer.from('%PDF-1.7 issued')),
        signedPdfSha256: sha256Hex(Buffer.from('%PDF-1.7 final')),
      }),
    );
  });

  it('loses a signing race cleanly', async () => {
    const { service } = setup(mandate(), 0);
    await expect(
      service.signWeb(token, 'Ana Pérez', ctx),
    ).rejects.toBeInstanceOf(ConflictException);
  });
});

describe('SepaSigningService — certificate signature', () => {
  const token = generateSigningToken();
  const issued = Buffer.from('%PDF-1.7 issued');
  const signed = Buffer.concat([
    issued,
    Buffer.from('\n<< /Type /Sig /ByteRange [0 10 20 5] >>\n%%EOF'),
  ]);
  const upload = (buffer: Buffer) => ({ buffer, originalname: 'firmada.pdf' });

  it('requires a file', async () => {
    const { service } = setup(mandate());
    await expect(
      service.signWithCertificate(token, undefined, ctx),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects something that is not a PDF', async () => {
    const { service } = setup(mandate());
    await expect(
      service.signWithCertificate(token, upload(Buffer.from('GIF89a')), ctx),
    ).rejects.toThrow('no es un PDF');
  });

  it('rejects a PDF with no digital signature', async () => {
    const { service } = setup(mandate());
    await expect(
      service.signWithCertificate(token, upload(issued), ctx),
    ).rejects.toThrow('No encuentro tu firma digital');
  });

  it('stores a signed upload and notes that it extends the issued PDF', async () => {
    const { service, executed } = setup(mandate());
    await service.signWithCertificate(token, upload(signed), ctx);
    const stored = executed[0];
    expect(stored.signatureMethod).toBe('certificate');
    expect(stored.signedPdf).toBe(signed);
    expect(stored.signatureEvidence).toEqual(
      expect.objectContaining({
        method: 'certificate',
        fileName: 'firmada.pdf',
        extendsIssuedPdf: true,
        signedPdfSha256: sha256Hex(signed),
      }),
    );
  });

  it('flags a signed file that was re-saved instead of extended', async () => {
    const resaved = Buffer.from(
      '%PDF-1.4 other\n<< /Type /Sig /ByteRange [0 1 2 3] >>',
    );
    const { service, executed } = setup(mandate());
    await service.signWithCertificate(token, upload(resaved), ctx);
    expect(executed[0].signatureEvidence).toEqual(
      expect.objectContaining({ extendsIssuedPdf: false }),
    );
  });

  it('rejects the issued file uploaded untouched when it already carries our signature', async () => {
    const sealed = Buffer.from(
      '%PDF-1.7 sealed\n<< /Type /Sig /ByteRange [0 1 2 3] >>',
    );
    const { service } = setup(mandate({ issuedPdf: sealed }));
    await expect(
      service.signWithCertificate(token, upload(sealed), ctx),
    ).rejects.toThrow('No encuentro tu firma digital');
  });

  it('accepts a file with the client signature added after ours, and records our seal', async () => {
    const sealed = Buffer.from(
      '%PDF-1.7 sealed\n<< /Type /Sig /ByteRange [0 1 2 3] >>',
    );
    const both = Buffer.concat([
      sealed,
      Buffer.from('\n<< /Type /Sig /ByteRange [0 9 8 7] >>'),
    ]);
    const { service, executed } = setup(mandate({ issuedPdf: sealed }));
    await service.signWithCertificate(token, upload(both), ctx);
    expect(executed[0].signatureEvidence).toEqual(
      expect.objectContaining({
        extendsIssuedPdf: true,
        creditorSeal: expect.objectContaining({
          subject: 'ACREEDOR PRUEBA',
          serialNumber: '01ab',
        }) as unknown,
      }),
    );
  });
});
