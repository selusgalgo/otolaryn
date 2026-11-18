import type {
  Content,
  CustomTableLayout,
  TableCell,
  TDocumentDefinitions,
} from 'pdfmake/interfaces';
import { MEDERI_COLORS as C } from '../pdf/mederi-brand';
import { INTER_FONT } from '../pdf/pdf.service';
import {
  computeSepaAmounts,
  formatCents,
  formatPercent,
} from './sepa-amounts.util';

// The SEPA CORE direct-debit mandate Mederi's creditor sends each clinic
// owner to sign (electronically, with a digital certificate). Page 1 is the
// mandate itself; page 2 the data-protection notice. Layout follows the
// usual Spanish bank form (creditor block, debtor block, IBAN in boxes,
// payment type, authorisation text, signature) in Mederi's colours and
// typeface. Pure: everything it prints comes in through SepaMandatePdfInput.

export interface SepaCreditorData {
  name: string;
  taxId: string;
  address: string;
  postalCode: string;
  city: string;
  province: string;
  country: string;
  email: string;
  phone: string;
  website: string | null;
  sepaCreditorId: string;
}

export interface SepaMandateData {
  reference: string;
  // Debtor data is filled in by the clinic through the signing link, so a
  // mandate the superadmin has just created prints these as empty boxes.
  holderName: string | null;
  holderTaxId: string | null;
  clinicName: string;
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
  planName: string;
  monthlyBase: number;
  vatPercent: number;
  irpfPercent: number;
  firstChargeDate: string; // YYYY-MM-DD
}

// Printed in the signature box when the client signed on the web (simple
// electronic signature). A certificate signature is applied by the signer's
// own tool inside the (empty) box, so it never goes through here.
export interface SepaSignatureStamp {
  signerName: string;
  signedAt: Date;
  ip: string | null;
  // First 16 hex chars of the SHA-256 of the document the client reviewed.
  verificationCode: string;
}

export interface SepaMandatePdfInput {
  creditor: SepaCreditorData;
  mandate: SepaMandateData;
  logo: string; // data: URI
  signature?: SepaSignatureStamp;
  // The document is about to be signed with the creditor's certificate (see
  // PdfSignerService): say so on the page.
  sealedByCreditor?: boolean;
  // When the creditor's signature was applied (shown in the visible box).
  sealedAt?: Date;
}

// A4 width minus 40pt margins each side.
const CONTENT_WIDTH = 515;
const FOOTER_BAND = 34;

// Standard wording Spanish banks use for SEPA CORE mandates.
const AUTHORISATION_TEXT =
  'Mediante la firma de esta orden de domiciliación, el deudor autoriza (A) al acreedor a enviar instrucciones a la entidad del deudor para adeudar su cuenta y (B) a la entidad para efectuar los adeudos en su cuenta siguiendo las instrucciones del acreedor. Como parte de sus derechos, el deudor está legitimado al reembolso por su entidad en los términos y condiciones del contrato suscrito con la misma. La solicitud de reembolso deberá efectuarse dentro de las ocho semanas que siguen a la fecha de adeudo en cuenta. Puede obtener información adicional sobre sus derechos en su entidad financiera.';

/** "2026-12-01" → "1 de diciembre de 2026". */
export function formatLongDate(isoDate: string): string {
  const [y, m, d] = isoDate.split('-').map(Number);
  return new Intl.DateTimeFormat('es-ES', {
    timeZone: 'UTC',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(new Date(Date.UTC(y, m - 1, d)));
}

const gridLayout: CustomTableLayout = {
  hLineWidth: () => 0.6,
  vLineWidth: () => 0.6,
  hLineColor: () => C.border,
  vLineColor: () => C.border,
  paddingLeft: () => 6,
  paddingRight: () => 6,
  paddingTop: () => 2,
  paddingBottom: () => 3,
};

function sectionTitle(title: string): Content {
  return {
    table: { widths: ['*'], body: [[{ text: title, style: 'sectionTitle' }]] },
    layout: {
      fillColor: () => C.primary,
      hLineWidth: () => 0,
      vLineWidth: () => 0,
      paddingLeft: () => 8,
      paddingTop: () => 3,
      paddingBottom: () => 3,
    },
    margin: [0, 6, 0, 0],
  };
}

interface Field {
  label: string;
  value: string | null | undefined;
  span: number; // out of 6 columns per row
}

// Form-style grid: each cell is a small uppercase label over its value,
// six equal columns so rows can split 4+2, 3+1+2, 1+2+2+1...
function fieldGrid(rows: Field[][]): Content {
  const body: TableCell[][] = rows.map((row) => {
    const cells: TableCell[] = [];
    for (const field of row) {
      cells.push({
        colSpan: field.span,
        stack: [
          { text: field.label.toUpperCase(), style: 'label' },
          { text: field.value?.trim() || ' ', style: 'value' },
        ],
      });
      for (let i = 1; i < field.span; i++) cells.push({});
    }
    return cells;
  });
  return {
    table: { widths: ['*', '*', '*', '*', '*', '*'], body },
    layout: gridLayout,
  };
}

function checkbox(checked: boolean, label: string): Content {
  return {
    columns: [
      {
        width: 12,
        canvas: [
          {
            type: 'rect',
            x: 0,
            y: 1.5,
            w: 8,
            h: 8,
            lineWidth: 0.8,
            lineColor: C.primary,
            ...(checked ? { color: C.primary } : {}),
          },
        ],
      },
      { width: 'auto', text: label, style: checked ? 'valueStrong' : 'value' },
    ],
    columnGap: 0,
  };
}

// One box per IBAN character, grouped in fours like the printed IBAN.
// Empty boxes when the account isn't known yet (24 = Spanish length).
function ibanBoxes(iban: string | null): Content {
  const chars = (iban ?? '').split('');
  const length = Math.max(24, chars.length);
  const groups = Math.ceil(length / 4);
  const gap = 5;
  const box = Math.min(18, (CONTENT_WIDTH - gap * (groups - 1)) / length);
  const widths: number[] = [];
  const row: TableCell[] = [];
  for (let i = 0; i < length; i++) {
    if (i > 0 && i % 4 === 0) {
      widths.push(gap);
      row.push({ text: '', border: [false, false, false, false] });
    }
    widths.push(box);
    row.push({
      text: chars[i] ?? ' ',
      style: 'ibanChar',
      border: [true, true, true, true],
    });
  }
  return {
    table: { widths, body: [row] },
    layout: {
      hLineWidth: () => 0.8,
      vLineWidth: () => 0.8,
      hLineColor: () => C.primary,
      vLineColor: () => C.primary,
      paddingLeft: () => 0,
      paddingRight: () => 0,
      paddingTop: () => 4,
      paddingBottom: () => 3,
    },
  };
}

function letterhead(
  creditor: SepaCreditorData,
  logo: string,
  { newPage = false }: { newPage?: boolean } = {},
): Content {
  const contact = [creditor.email, creditor.phone, creditor.website]
    .filter(Boolean)
    .join('  ·  ');
  return {
    ...(newPage ? { pageBreak: 'before' as const } : {}),
    columns: [
      // Horizontal logo (~3:1): 112pt wide is ~37pt tall, about the height of
      // the creditor's address block beside it.
      { width: 112, image: logo, fit: [112, 38] },
      {
        width: '*',
        alignment: 'right',
        margin: [0, 2, 0, 0],
        stack: [
          { text: creditor.name, bold: true, color: C.primary, fontSize: 10 },
          {
            text: `NIF ${creditor.taxId}  ·  ${creditor.address}`,
            style: 'small',
          },
          {
            text: `${creditor.postalCode} ${creditor.city} (${creditor.province}), ${creditor.country}`,
            style: 'small',
          },
          { text: contact, style: 'small' },
        ],
      },
    ],
    margin: [0, 0, 0, 8],
  };
}

function amountsTable(m: SepaMandateData): Content {
  const a = computeSepaAmounts(m.monthlyBase, m.vatPercent, m.irpfPercent);
  const rows: TableCell[][] = [
    [
      { text: 'Cuota mensual (base imponible)', style: 'value' },
      { text: formatCents(a.baseCents), style: 'value', alignment: 'right' },
    ],
    [
      { text: `IVA (${formatPercent(m.vatPercent)} %)`, style: 'value' },
      {
        text: `+ ${formatCents(a.vatCents)}`,
        style: 'value',
        alignment: 'right',
      },
    ],
  ];
  if (a.irpfCents > 0) {
    rows.push([
      {
        text: `Retención IRPF (${formatPercent(m.irpfPercent)} %)`,
        style: 'value',
      },
      {
        text: `− ${formatCents(a.irpfCents)}`,
        style: 'value',
        alignment: 'right',
      },
    ]);
  }
  rows.push([
    { text: 'Importe de cada adeudo', style: 'totalLabel' },
    {
      text: formatCents(a.totalCents),
      style: 'totalLabel',
      alignment: 'right',
    },
  ]);
  const last = rows.length - 1;
  return {
    table: { widths: ['*', 'auto'], body: rows },
    layout: {
      hLineWidth: (i: number) => (i === last ? 0.8 : 0),
      vLineWidth: () => 0,
      hLineColor: () => C.primary,
      fillColor: (i: number) => (i === last ? C.tint : null),
      paddingLeft: () => 6,
      paddingRight: () => 6,
      paddingTop: () => 2,
      paddingBottom: () => 2,
    },
  };
}

function planNote(m: SepaMandateData): string {
  const parts = [
    `Los adeudos se cargarán mensualmente a partir del ${formatLongDate(m.firstChargeDate)}.`,
  ];
  if (m.irpfPercent > 0) {
    parts.push(
      'La retención de IRPF la ingresa el cliente en la Agencia Tributaria, por lo que se descuenta del importe que se carga en cuenta.',
    );
  }
  parts.push(
    'Cada adeudo irá precedido de su factura, enviada por correo electrónico, que sirve como notificación previa del cargo.',
  );
  return parts.join(' ');
}

// "55001 – Sevilla" when the province is still empty, "" when all are.
function placeLine(
  postalCode: string | null,
  city: string | null,
  province: string | null,
): string {
  return [postalCode, city, province].filter(Boolean).join(' – ');
}

/** "16 de noviembre de 2026, 10:32 (hora de Madrid)". */
export function formatSignedAt(date: Date): string {
  const fmt = new Intl.DateTimeFormat('es-ES', {
    timeZone: 'Europe/Madrid',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
  return `${fmt.format(date)} (hora de Madrid)`;
}

function signatureBoxContent(stamp: SepaSignatureStamp | undefined): Content[] {
  if (!stamp) {
    return [
      {
        text: 'Firma electrónica con certificado digital',
        style: 'small',
      },
    ];
  }
  return [
    {
      text: stamp.signerName,
      bold: true,
      color: C.primary,
      fontSize: 12,
      margin: [0, 6, 0, 2],
    },
    {
      text: 'Firmado electrónicamente (firma electrónica simple)',
      style: 'small',
    },
    { text: formatSignedAt(stamp.signedAt), style: 'small' },
    {
      text: `Dirección IP ${stamp.ip ?? 'no disponible'}  ·  Código de verificación ${stamp.verificationCode}`,
      style: 'small',
    },
  ];
}

/** "16 de noviembre de 2026" — the day the document was issued and signed. */
function formatIssuedDate(date: Date): string {
  return new Intl.DateTimeFormat('es-ES', {
    timeZone: 'Europe/Madrid',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(date);
}

// The visible counterpart of the creditor's digital signature. The signature
// itself is invisible and cryptographic (see PdfSignerService) — this box just
// shows, on the page, who signed and when; the reader's signature panel shows
// whether it's valid.
function creditorSignatureBox(
  creditor: SepaCreditorData,
  sealedAt: Date | undefined,
): Content {
  const when = sealedAt ? ` · ${formatIssuedDate(sealedAt)}` : '';
  return {
    table: {
      widths: ['*'],
      heights: [44],
      body: [
        [
          {
            stack: [
              { text: 'FIRMA DEL ACREEDOR', style: 'label' },
              {
                text: `Firmado digitalmente por ${creditor.name}`,
                bold: true,
                color: C.primary,
                fontSize: 9,
                margin: [0, 3, 0, 1],
              },
              {
                text: `NIF ${creditor.taxId}${when}`,
                style: 'small',
              },
            ],
          },
        ],
      ],
    },
    layout: {
      ...gridLayout,
      hLineColor: () => C.primary,
      vLineColor: () => C.primary,
    },
    margin: [0, 6, 0, 0],
  };
}

function mandatePage(input: SepaMandatePdfInput): Content[] {
  const { creditor: cr, mandate: m, logo } = input;
  const signer =
    m.signerName && m.signerPosition
      ? `${m.signerName} (${m.signerPosition})`
      : m.signerName;

  return [
    letterhead(cr, logo),
    { text: 'Orden de domiciliación de adeudo directo SEPA', style: 'title' },
    {
      text: 'Esquema básico (CORE) · Servicio Mederi Cloud',
      style: 'subtitle',
    },

    {
      table: {
        widths: ['*', '*'],
        body: [
          [
            {
              stack: [
                { text: 'REFERENCIA DE LA ORDEN', style: 'label' },
                { text: m.reference, style: 'reference' },
              ],
            },
            {
              stack: [
                { text: 'TIPO DE PAGO', style: 'label' },
                {
                  columns: [
                    checkbox(true, 'Pago recurrente'),
                    checkbox(false, 'Pago único'),
                  ],
                  margin: [0, 2, 0, 0],
                },
              ],
            },
          ],
        ],
      },
      layout: { ...gridLayout, fillColor: () => C.tint },
    },

    sectionTitle('DATOS DEL ACREEDOR'),
    fieldGrid([
      [
        { label: 'Nombre o razón social', value: cr.name, span: 3 },
        { label: 'NIF', value: cr.taxId, span: 1 },
        {
          label: 'Identificador de acreedor',
          value: cr.sepaCreditorId,
          span: 2,
        },
      ],
      [
        { label: 'Dirección', value: cr.address, span: 3 },
        {
          label: 'Código postal – Población – Provincia',
          value: `${cr.postalCode} – ${cr.city} – ${cr.province}`,
          span: 2,
        },
        { label: 'País', value: cr.country, span: 1 },
      ],
    ]),

    sectionTitle('DATOS DEL DEUDOR'),
    fieldGrid([
      [
        {
          label: 'Titular de la cuenta (nombre o razón social)',
          value: m.holderName,
          span: 4,
        },
        { label: 'NIF / CIF', value: m.holderTaxId, span: 2 },
      ],
      [
        { label: 'Clínica', value: m.clinicName, span: 3 },
        { label: 'Firmante', value: signer, span: 3 },
      ],
      [
        { label: 'Dirección', value: m.address, span: 3 },
        {
          label: 'Código postal – Población – Provincia',
          value: placeLine(m.postalCode, m.city, m.province),
          span: 2,
        },
        { label: 'País', value: m.country, span: 1 },
      ],
      [
        { label: 'Correo electrónico', value: m.email, span: 4 },
        { label: 'Teléfono', value: m.phone, span: 2 },
      ],
    ]),

    sectionTitle('CUENTA DE CARGO'),
    {
      table: {
        widths: ['*'],
        body: [
          [
            {
              stack: [
                {
                  text: 'NÚMERO DE CUENTA — IBAN',
                  style: 'label',
                  margin: [0, 0, 0, 3],
                },
                ibanBoxes(m.iban),
                {
                  columns: [
                    {
                      width: 'auto',
                      text: [
                        { text: 'SWIFT BIC  ', style: 'label' },
                        { text: m.bic ?? '', style: 'value' },
                      ],
                    },
                    {
                      width: '*',
                      text: 'En España el IBAN tiene 24 caracteres y empieza siempre por ES.',
                      style: 'small',
                      alignment: 'right',
                    },
                  ],
                  margin: [0, 5, 0, 0],
                },
              ],
            },
          ],
        ],
      },
      layout: gridLayout,
    },

    sectionTitle('PLAN CONTRATADO'),
    fieldGrid([
      [
        { label: 'Plan', value: m.planName, span: 3 },
        { label: 'Periodicidad', value: 'Mensual', span: 1 },
        {
          label: 'Fecha del primer cargo',
          value: formatLongDate(m.firstChargeDate),
          span: 2,
        },
      ],
    ]),
    {
      columns: [
        { width: '*', text: planNote(m), style: 'small', margin: [0, 2, 0, 0] },
        { width: 230, stack: [amountsTable(m)] },
      ],
      columnGap: 16,
      margin: [0, 6, 0, 0],
    },

    { text: AUTHORISATION_TEXT, style: 'legal', margin: [0, 8, 0, 0] },

    {
      columns: [
        {
          width: '*',
          stack: [
            fieldGrid([
              [
                { label: 'Localidad', value: m.city, span: 2 },
                {
                  label: 'Fecha',
                  value: input.signature
                    ? formatSignedAt(input.signature.signedAt)
                    : 'La de la firma electrónica',
                  span: 4,
                },
              ],
            ]),
            ...(input.sealedByCreditor
              ? [creditorSignatureBox(cr, input.sealedAt)]
              : []),
            {
              text: input.signature
                ? 'Todos los campos son obligatorios salvo el BIC. Orden firmada electrónicamente: conserve una copia como justificante.'
                : `Todos los campos son obligatorios salvo el BIC. Una vez firmada, súbala en el enlace de firma o envíela a ${cr.email}.`,
              style: 'small',
              margin: [0, 6, 0, 0],
            },
          ],
        },
        {
          width: 270,
          table: {
            widths: ['*'],
            heights: [80],
            body: [
              [
                {
                  stack: [
                    { text: 'FIRMA DEL DEUDOR', style: 'label' },
                    ...signatureBoxContent(input.signature),
                  ],
                },
              ],
            ],
          },
          layout: {
            ...gridLayout,
            hLineColor: () => C.primary,
            vLineColor: () => C.primary,
          },
        },
      ],
      columnGap: 16,
      margin: [0, 8, 0, 0],
      // Never split the signature block across pages.
      unbreakable: true,
    },
  ];
}

const dpLayout: CustomTableLayout = {
  ...gridLayout,
  fillColor: (_row: number, _node: unknown, col: number) =>
    col === 0 ? C.tint : null,
  paddingTop: () => 5,
  paddingBottom: () => 5,
};

function dataProtectionPage(input: SepaMandatePdfInput): Content[] {
  const { creditor: cr, logo } = input;
  const dpRow = (label: string, text: string): TableCell[] => [
    { text: label, style: 'valueStrong' },
    { text, style: 'value' },
  ];
  const heading = (text: string): Content => ({
    text,
    style: 'dpHeading',
  });
  const para = (text: string): Content => ({ text, style: 'dpText' });

  return [
    letterhead(cr, logo, { newPage: true }),
    { text: 'Información sobre protección de datos', style: 'title' },
    {
      text: `Orden de domiciliación ${input.mandate.reference}`,
      style: 'subtitle',
    },
    {
      table: {
        widths: [110, '*'],
        body: [
          dpRow('Responsable', cr.name),
          dpRow(
            'Finalidad',
            'Gestionar la relación contractual del servicio Mederi Cloud y el cobro de sus cuotas mediante adeudo directo SEPA.',
          ),
          dpRow(
            'Legitimación',
            'Ejecución del contrato (art. 6.1.b RGPD) y cumplimiento de obligaciones legales (art. 6.1.c RGPD).',
          ),
          dpRow(
            'Destinatarios',
            'Entidades bancarias que intervienen en el cobro y Administración Tributaria cuando la ley lo exija. No se ceden datos a terceros salvo obligación legal.',
          ),
          dpRow(
            'Derechos',
            'Acceso, rectificación, supresión, oposición, limitación y portabilidad, como se explica a continuación.',
          ),
        ],
      },
      layout: dpLayout,
      margin: [0, 0, 0, 14],
    },

    heading('¿Quién es el responsable del tratamiento de sus datos?'),
    {
      stack: [
        { text: [{ text: 'Responsable: ', bold: true }, cr.name] },
        { text: [{ text: 'NIF: ', bold: true }, cr.taxId] },
        {
          text: [
            { text: 'Domicilio: ', bold: true },
            `${cr.address}, ${cr.postalCode} ${cr.city} (${cr.province})`,
          ],
        },
        { text: [{ text: 'Correo electrónico: ', bold: true }, cr.email] },
        { text: [{ text: 'Teléfono: ', bold: true }, cr.phone] },
      ],
      style: 'dpText',
    },

    heading('¿Con qué finalidad tratamos sus datos?'),
    para(
      'Tratamos los datos de esta orden para gestionar la relación contractual del servicio Mederi Cloud, emitir las facturas y cobrar las cuotas mediante adeudo directo SEPA en la cuenta indicada.',
    ),

    heading('¿Por cuánto tiempo conservaremos sus datos?'),
    para(
      'Mientras se mantenga la relación contractual y, después, durante los plazos que exige la ley: al menos 14 meses desde el último adeudo, según la normativa SEPA, y los plazos de conservación de la normativa fiscal y mercantil.',
    ),

    heading('¿Cuál es la legitimación para el tratamiento?'),
    para(
      'La ejecución del contrato de servicio del que usted es parte (art. 6.1.b RGPD) y el cumplimiento de las obligaciones legales, fiscales y contables del responsable (art. 6.1.c RGPD).',
    ),

    heading('¿A quién se comunican sus datos?'),
    para(
      'A las entidades bancarias necesarias para tramitar los adeudos y a la Administración Tributaria cuando lo exija la ley. No se ceden datos a terceros salvo obligación legal.',
    ),

    heading('¿Cuáles son sus derechos?'),
    para(
      `Puede solicitar el acceso a sus datos, su rectificación o supresión, la limitación de su tratamiento, oponerse a él y pedir su portabilidad, escribiendo a ${cr.email}. Si considera que el tratamiento no se ajusta a la normativa, puede presentar una reclamación ante la Agencia Española de Protección de Datos (www.aepd.es).`,
    ),
  ];
}

export function buildSepaMandatePdf(
  input: SepaMandatePdfInput,
): TDocumentDefinitions {
  const website = input.creditor.website;
  return {
    pageSize: 'A4',
    pageMargins: [40, 34, 40, FOOTER_BAND + 18],
    info: {
      title: `Orden de domiciliación SEPA ${input.mandate.reference}`,
      author: input.creditor.name,
      subject: `Domiciliación SEPA — ${input.mandate.clinicName}`,
    },
    defaultStyle: {
      font: INTER_FONT,
      fontSize: 9,
      color: C.text,
      lineHeight: 1.15,
    },
    background: (_page, pageSize) => ({
      canvas: [
        {
          type: 'rect',
          x: 0,
          y: pageSize.height - FOOTER_BAND,
          w: pageSize.width,
          h: FOOTER_BAND,
          color: C.primary,
        },
      ],
    }),
    footer: (currentPage, pageCount) => ({
      columns: [
        {
          text: website ? `Mederi  ·  ${website}` : 'Mederi',
          color: '#FFFFFF',
          bold: true,
        },
        {
          text: `${input.mandate.reference}  ·  Página ${currentPage} de ${pageCount}`,
          color: C.accent,
          alignment: 'right',
        },
      ],
      fontSize: 8,
      margin: [40, 18 + (FOOTER_BAND - 10) / 2, 40, 0],
    }),
    content: [...mandatePage(input), ...dataProtectionPage(input)],
    styles: {
      title: { fontSize: 15, bold: true, color: C.primary },
      subtitle: { fontSize: 9, color: C.muted, margin: [0, 1, 0, 8] },
      sectionTitle: {
        fontSize: 8,
        bold: true,
        color: '#FFFFFF',
        characterSpacing: 0.6,
      },
      label: {
        fontSize: 6.5,
        bold: true,
        color: C.primary,
        characterSpacing: 0.4,
      },
      value: { fontSize: 9 },
      valueStrong: { fontSize: 9, bold: true },
      reference: { fontSize: 12, bold: true, color: C.primary },
      ibanChar: { fontSize: 10.5, bold: true, alignment: 'center' },
      totalLabel: { fontSize: 10, bold: true, color: C.primary },
      small: { fontSize: 7.5, color: C.muted },
      legal: { fontSize: 7.5, color: C.muted, alignment: 'justify' },
      dpHeading: {
        fontSize: 9.5,
        bold: true,
        color: C.primary,
        margin: [0, 8, 0, 2],
      },
      dpText: { fontSize: 9, lineHeight: 1.3 },
    },
  };
}
