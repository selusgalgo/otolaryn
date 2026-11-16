import {
  BadRequestException,
  ConflictException,
  ServiceUnavailableException,
} from '@nestjs/common';
import type { TDocumentDefinitions } from 'pdfmake/interfaces';
import {
  CertificateUnavailableError,
  type PdfSignerService,
  type SigningCertificateInfo,
  type SigningStatus,
} from '../pdf/pdf-signer.service';
import type { SepaMandate } from './entities/sepa-mandate.entity';
import { isCreditorComplete, SepaService } from './sepa.service';

const creditor = {
  id: 1,
  name: 'Acreedor de Prueba',
  taxId: '12345678Z',
  address: 'Calle 1',
  postalCode: '41704',
  city: 'Sevilla',
  province: 'Sevilla',
  country: 'España',
  email: 'cobros@example.com',
  phone: '+34 600 000 000',
  website: null,
  sepaCreditorId: 'ES58ZZZ12345678Z',
  updatedAt: new Date('2026-01-01'),
};

const mandate = {
  reference: 'MED-0001-2026',
  clinicName: 'Clínica Ejemplo',
  planName: 'Plan',
  monthlyBase: 50,
  vatPercent: 21,
  irpfPercent: 15,
  firstChargeDate: '2026-12-01',
} as SepaMandate;

const RENDERED = Buffer.from('%PDF-1.3 rendered');
const SIGNED = Buffer.from('%PDF-1.7 signed');

// The row the migration seeds: it exists, but every field is empty.
const emptyCreditor = {
  ...creditor,
  name: '',
  taxId: '',
  address: '',
  postalCode: '',
  city: '',
  province: '',
  email: '',
  phone: '',
  sepaCreditorId: '',
};

function setup(
  signer: Partial<PdfSignerService>,
  options: { creditor?: typeof creditor; mandate?: Partial<SepaMandate> } = {},
) {
  const render = jest
    .fn<Promise<Buffer>, [TDocumentDefinitions]>()
    .mockResolvedValue(RENDERED);
  const service = new SepaService(
    {
      findOne: jest.fn().mockResolvedValue(options.creditor ?? creditor),
    } as never,
    {
      findOne: jest.fn().mockResolvedValue({ ...mandate, ...options.mandate }),
    } as never,
    {} as never,
    {} as never,
    { render },
    signer as PdfSignerService,
  );
  return { service, render };
}

// Every string the document definition prints, flattened.
function printedText(definition: TDocumentDefinitions): string {
  const out: string[] = [];
  const walk = (node: unknown): void => {
    if (typeof node === 'string') out.push(node);
    else if (Array.isArray(node)) node.forEach(walk);
    else if (node && typeof node === 'object')
      Object.values(node).forEach(walk);
  };
  walk(definition.content);
  return out.join('\n');
}

describe('SepaService.renderForMandate', () => {
  it('leaves the document unsigned (and says nothing about a signature) when no certificate is configured', async () => {
    const sign = jest.fn();
    const { service, render } = setup({
      isConfigured: () => Promise.resolve(false),
      sign,
    });

    const pdf = await service.renderForMandate(mandate);

    expect(pdf).toBe(RENDERED);
    expect(sign).not.toHaveBeenCalled();
    const [definition] = render.mock.calls[0];
    expect(printedText(definition)).not.toContain('firmado digitalmente');
  });

  it('signs the rendered PDF with the creditor’s certificate and says so on the page', async () => {
    const sign = jest.fn().mockResolvedValue(SIGNED);
    const { service, render } = setup({
      isConfigured: () => Promise.resolve(true),
      sign,
    });

    const pdf = await service.renderForMandate(mandate);

    expect(pdf).toBe(SIGNED);
    expect(sign).toHaveBeenCalledWith(
      RENDERED,
      expect.objectContaining({
        reason: expect.stringContaining('MED-0001-2026') as string,
        name: creditor.name,
        location: 'Sevilla',
        contactInfo: creditor.email,
      }),
    );
    const [definition] = render.mock.calls[0];
    expect(printedText(definition)).toContain(
      `firmado digitalmente por ${creditor.name}`,
    );
  });

  it('fails instead of issuing an unsigned PDF when the certificate stops working, without leaking why', async () => {
    const sign = jest
      .fn()
      .mockRejectedValue(
        new CertificateUnavailableError(
          'La contraseña del certificado no es correcta.',
        ),
      );
    const { service } = setup({
      isConfigured: () => Promise.resolve(true),
      sign,
    });

    const failure = service.renderForMandate(mandate);

    await expect(failure).rejects.toBeInstanceOf(ServiceUnavailableException);
    await expect(failure).rejects.not.toThrow(/contraseña/);
  });
});

describe('SepaService.getCertificateStatus', () => {
  const usable = (
    subject: string,
    subjectSerial: string | null,
  ): SigningStatus => ({
    configured: true,
    usable: true,
    source: 'upload',
    daysLeft: 300,
    expiringSoon: false,
    certificate: {
      subject,
      subjectSerial,
      issuer: 'AC FNMT Usuarios',
      serialNumber: '01',
      sha256Fingerprint: 'a'.repeat(64),
      validFrom: new Date('2026-01-01'),
      validTo: new Date('2030-01-01'),
    },
  });

  it('passes through "not configured" and "unusable" untouched', async () => {
    const off = setup({
      status: () => Promise.resolve({ configured: false }),
    });
    expect(await off.service.getCertificateStatus()).toEqual({
      configured: false,
    });

    const broken: SigningStatus = {
      configured: true,
      usable: false,
      error: 'caducó',
      source: 'upload',
    };
    const failing = setup({ status: () => Promise.resolve(broken) });
    expect(await failing.service.getCertificateStatus()).toEqual(broken);
  });

  it('confirms the certificate belongs to the creditor named on the mandates', async () => {
    const { service } = setup({
      status: () =>
        Promise.resolve(
          usable('PEREZ RUIZ ANA - NIF 12345678Z', 'IDCES-12345678Z'),
        ),
    });
    expect(await service.getCertificateStatus()).toMatchObject({
      usable: true,
      matchesCreditorTaxId: true,
    });
  });

  it('flags a certificate issued to somebody else', async () => {
    const { service } = setup({
      status: () =>
        Promise.resolve(
          usable('GOMEZ DIAZ LUIS - NIF X1234567L', 'IDCES-X1234567L'),
        ),
    });
    expect(await service.getCertificateStatus()).toMatchObject({
      usable: true,
      matchesCreditorTaxId: false,
    });
  });
});

describe('SepaService.installCertificate', () => {
  const certificate = (subject: string): SigningCertificateInfo => ({
    subject,
    subjectSerial: null,
    issuer: 'AC FNMT Usuarios',
    serialNumber: '01',
    sha256Fingerprint: 'b'.repeat(64),
    validFrom: new Date('2026-01-01'),
    validTo: new Date('2030-01-01'),
  });
  const file = { buffer: Buffer.from('p12-bytes') };

  // A signer whose install() runs the caller's veto like the real one does.
  function installer(info: SigningCertificateInfo) {
    const install = jest.fn(
      (
        _p12: Buffer,
        _passphrase: string,
        _by: string | null,
        validate?: (c: SigningCertificateInfo) => void,
      ) => {
        validate?.(info);
        return Promise.resolve(info);
      },
    );
    const status = jest.fn().mockResolvedValue({ configured: false });
    return { install, status, ...setup({ install, status }) };
  }

  it('asks for the file and for the passphrase', async () => {
    const { service, install } = installer(certificate('X - NIF 12345678Z'));
    await expect(
      service.installCertificate(undefined, 'clave', 'u1'),
    ).rejects.toThrow('Adjunta el archivo');
    await expect(
      service.installCertificate({ buffer: Buffer.alloc(0) }, 'clave', 'u1'),
    ).rejects.toThrow('Adjunta el archivo');
    await expect(
      service.installCertificate(file, undefined, 'u1'),
    ).rejects.toThrow('contraseña');
    await expect(
      service.installCertificate(file, 'x'.repeat(500), 'u1'),
    ).rejects.toThrow('demasiado larga');
    expect(install).not.toHaveBeenCalled();
  });

  it('installs a certificate issued to the creditor and reports the new status', async () => {
    const { service, install } = installer(
      certificate('PEREZ RUIZ ANA - NIF 12345678Z'),
    );
    const status = await service.installCertificate(file, 'clave', 'u1');
    expect(install).toHaveBeenCalledWith(
      file.buffer,
      'clave',
      'u1',
      expect.any(Function),
    );
    expect(status).toEqual({ configured: false });
  });

  it('refuses a certificate issued to somebody else, and says whose it is', async () => {
    const { service } = installer(
      certificate('GOMEZ DIAZ LUIS - NIF X1234567L'),
    );
    const failure = service.installCertificate(file, 'clave', 'u1');
    await expect(failure).rejects.toBeInstanceOf(BadRequestException);
    await expect(failure).rejects.toThrow('GOMEZ DIAZ LUIS');
    await expect(failure).rejects.toThrow('12345678Z');
  });

  it('hands the signer’s own explanation back to the person uploading', async () => {
    const install = jest
      .fn()
      .mockRejectedValue(
        new CertificateUnavailableError(
          'La contraseña del certificado no es correcta.',
        ),
      );
    const { service } = setup({ install, status: jest.fn() });
    const failure = service.installCertificate(file, 'mala', 'u1');
    await expect(failure).rejects.toBeInstanceOf(BadRequestException);
    await expect(failure).rejects.toThrow(
      'La contraseña del certificado no es correcta.',
    );
  });

  it('removes the uploaded certificate', async () => {
    const remove = jest.fn().mockResolvedValue(undefined);
    const status = jest.fn().mockResolvedValue({ configured: false });
    const { service } = setup({ remove, status });
    expect(await service.removeCertificate('u1')).toEqual({
      configured: false,
    });
    expect(remove).toHaveBeenCalledTimes(1);
  });
});

describe('SepaService — nothing is issued for an empty creditor', () => {
  it('refuses to render a document', async () => {
    const sign = jest.fn();
    const { service, render } = setup(
      { isConfigured: () => Promise.resolve(true), sign },
      { creditor: emptyCreditor },
    );
    const failure = service.renderForMandate(mandate);
    await expect(failure).rejects.toBeInstanceOf(ConflictException);
    await expect(failure).rejects.toThrow('Faltan los datos del acreedor');
    expect(render).not.toHaveBeenCalled();
    expect(sign).not.toHaveBeenCalled();
  });

  it('refuses to issue a signing link', async () => {
    const { service } = setup({}, { creditor: emptyCreditor });
    await expect(service.issueSigningLink('t1')).rejects.toThrow(
      'Faltan los datos del acreedor',
    );
  });

  it('refuses to install a certificate before the creditor is known', async () => {
    const install = jest.fn();
    const { service } = setup({ install }, { creditor: emptyCreditor });
    await expect(
      service.installCertificate({ buffer: Buffer.from('p12') }, 'clave', 'u1'),
    ).rejects.toThrow('Faltan los datos del acreedor');
    expect(install).not.toHaveBeenCalled();
  });

  it('a creditor with a single field missing still counts as incomplete', () => {
    expect(isCreditorComplete(creditor)).toBe(true);
    expect(isCreditorComplete({ ...creditor, phone: '  ' })).toBe(false);
    expect(isCreditorComplete({ ...creditor, sepaCreditorId: '' })).toBe(false);
    expect(isCreditorComplete(emptyCreditor)).toBe(false);
  });

  it('an empty NIF never "matches" a certificate', async () => {
    const { service } = setup(
      {
        status: () =>
          Promise.resolve({
            configured: true,
            usable: true,
            source: 'upload',
            daysLeft: 300,
            expiringSoon: false,
            certificate: {
              subject: 'PEREZ RUIZ ANA - NIF 12345678Z',
              subjectSerial: 'IDCES-12345678Z',
              issuer: 'AC',
              serialNumber: '01',
              sha256Fingerprint: 'a'.repeat(64),
              validFrom: new Date('2026-01-01'),
              validTo: new Date('2030-01-01'),
            },
          }),
      },
      { creditor: emptyCreditor },
    );
    expect(await service.getCertificateStatus()).toMatchObject({
      matchesCreditorTaxId: false,
    });
  });
});
