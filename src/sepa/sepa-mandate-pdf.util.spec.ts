import { mederiLogoDataUri } from '../pdf/mederi-brand';
import { PdfService } from '../pdf/pdf.service';
import {
  buildSepaMandatePdf,
  formatLongDate,
  type SepaMandatePdfInput,
} from './sepa-mandate-pdf.util';

const input: SepaMandatePdfInput = {
  logo: mederiLogoDataUri(),
  creditor: {
    name: 'Acreedor de Prueba',
    taxId: '12345678Z',
    address: 'Calle Falsa, 1',
    postalCode: '41001',
    city: 'Sevilla',
    province: 'Sevilla',
    country: 'España',
    email: 'cobros@example.com',
    phone: '600 000 000',
    website: 'www.example.com',
    sepaCreditorId: 'ES58ZZZ12345678Z',
  },
  mandate: {
    reference: 'MED-0001-2026',
    holderName: 'Clínica Ejemplo S.L.',
    holderTaxId: 'B12345674',
    clinicName: 'Clínica Ejemplo',
    signerName: 'Ana Pérez',
    signerPosition: 'Administradora',
    address: 'Avenida Ejemplo, 2',
    postalCode: '41002',
    city: 'Sevilla',
    province: 'Sevilla',
    country: 'España',
    email: 'clinica@example.com',
    phone: null,
    iban: 'ES9121000418450200051332',
    bic: null,
    planName: 'Plan de prueba',
    monthlyBase: 49.9,
    vatPercent: 21,
    irpfPercent: 15,
    firstChargeDate: '2026-12-01',
  },
};

// Every text string the document definition contains, flattened.
function allText(node: unknown): string[] {
  if (typeof node === 'string') return [node];
  if (Array.isArray(node)) return node.flatMap(allText);
  if (node && typeof node === 'object') {
    return Object.values(node).flatMap(allText);
  }
  return [];
}

describe('formatLongDate', () => {
  it('formats a date column value in long Spanish form', () => {
    expect(formatLongDate('2026-12-01')).toBe('1 de diciembre de 2026');
  });
});

describe('buildSepaMandatePdf', () => {
  it('prints the reference, creditor id and the debit total', () => {
    const text = allText(buildSepaMandatePdf(input).content).join('\n');
    expect(text).toContain('MED-0001-2026');
    expect(text).toContain('ES58ZZZ12345678Z');
    // 49,90 + 10,48 − 7,49
    expect(text.replace(/\s/g, ' ')).toContain('52,89 €');
  });

  it('leaves out the IRPF line when there is no withholding', () => {
    const doc = buildSepaMandatePdf({
      ...input,
      mandate: { ...input.mandate, irpfPercent: 0 },
    });
    expect(allText(doc.content).join('\n')).not.toContain('Retención IRPF');
  });

  it('renders a two-page PDF (mandate + data protection) in Inter', async () => {
    const buffer = await new PdfService().render(buildSepaMandatePdf(input));
    const raw = buffer.toString('latin1');
    expect(raw.startsWith('%PDF')).toBe(true);
    expect(raw.match(/\/Type \/Page\b/g)).toHaveLength(2);
    expect(raw).toContain('Inter');
  });

  it('prints the web-signature stamp inside the signature box', () => {
    const doc = buildSepaMandatePdf({
      ...input,
      signature: {
        signerName: 'Ana Pérez',
        signedAt: new Date('2026-12-02T09:30:00Z'),
        ip: '203.0.113.7',
        verificationCode: 'abcdef0123456789',
      },
    });
    const text = allText(doc.content).join('\n');
    expect(text).toContain('Firmado electrónicamente');
    expect(text).toContain('203.0.113.7');
    expect(text).toContain('abcdef0123456789');
    expect(text).toContain('2 de diciembre de 2026');
  });

  it('renders a mandate whose debtor data is still empty', async () => {
    const empty = {
      ...input.mandate,
      holderName: null,
      holderTaxId: null,
      signerName: null,
      signerPosition: null,
      address: null,
      postalCode: null,
      city: null,
      province: null,
      country: null,
      email: null,
      phone: null,
      iban: null,
    };
    const buffer = await new PdfService().render(
      buildSepaMandatePdf({ ...input, mandate: empty }),
    );
    expect(buffer.toString('latin1').startsWith('%PDF')).toBe(true);
  });

  it('shows a visible creditor signature box, with the issue date, only when sealed', () => {
    const plain = allText(buildSepaMandatePdf(input).content).join('\n');
    expect(plain).not.toContain('FIRMA DEL ACREEDOR');

    const sealed = allText(
      buildSepaMandatePdf({
        ...input,
        sealedByCreditor: true,
        sealedAt: new Date('2026-12-02T09:30:00Z'),
      }).content,
    ).join('\n');
    expect(sealed).toContain('FIRMA DEL ACREEDOR');
    expect(sealed).toContain('Firmado digitalmente por Acreedor de Prueba');
    expect(sealed).toContain('NIF 12345678Z · 2 de diciembre de 2026');
  });

  it('keeps the sealed document on two pages', async () => {
    const buffer = await new PdfService().render(
      buildSepaMandatePdf({
        ...input,
        sealedByCreditor: true,
        sealedAt: new Date(),
      }),
    );
    expect(buffer.toString('latin1').match(/\/Type \/Page\b/g)).toHaveLength(2);
  });
});
