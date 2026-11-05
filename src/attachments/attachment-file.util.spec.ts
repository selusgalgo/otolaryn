import {
  decodeUploadName,
  extensionFor,
  safeDisplayName,
  sniffMime,
} from './attachment-file.util';

const png = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  Buffer.alloc(16),
]);

describe('sniffMime', () => {
  it('reconoce PDF, JPEG, PNG y WebP por su contenido', () => {
    expect(sniffMime(Buffer.from('%PDF-1.7\n...'))).toBe('application/pdf');
    expect(sniffMime(Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0]))).toBe(
      'image/jpeg',
    );
    expect(sniffMime(png)).toBe('image/png');
    expect(
      sniffMime(
        Buffer.concat([
          Buffer.from('RIFF'),
          Buffer.alloc(4),
          Buffer.from('WEBPVP8 '),
        ]),
      ),
    ).toBe('image/webp');
  });

  it('rechaza lo que no es de esos tipos, tenga la extensión que tenga', () => {
    expect(
      sniffMime(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"></svg>')),
    ).toBeNull();
    expect(
      sniffMime(Buffer.from('<html><script>alert(1)</script></html>')),
    ).toBeNull();
    expect(sniffMime(Buffer.from('MZ\x90\x00 ejecutable'))).toBeNull();
    expect(sniffMime(Buffer.from('texto plano'))).toBeNull();
    expect(sniffMime(Buffer.alloc(0))).toBeNull();
    // RIFF que no es WebP (p.ej. un WAV).
    expect(
      sniffMime(
        Buffer.concat([
          Buffer.from('RIFF'),
          Buffer.alloc(4),
          Buffer.from('WAVEfmt '),
        ]),
      ),
    ).toBeNull();
  });

  it('una cabecera de PDF a medias no basta', () => {
    expect(sniffMime(Buffer.from('%PD'))).toBeNull();
  });
});

describe('extensionFor', () => {
  it('da la extensión que corresponde al contenido', () => {
    expect(extensionFor('application/pdf')).toBe('pdf');
    expect(extensionFor('image/jpeg')).toBe('jpg');
  });
});

describe('decodeUploadName', () => {
  it('recupera los acentos que multer lee como latin1', () => {
    const asMulterSeesIt = Buffer.from('Radiografía.pdf', 'utf8').toString(
      'latin1',
    );
    expect(decodeUploadName(asMulterSeesIt)).toBe('Radiografía.pdf');
  });

  it('deja tal cual un nombre que ya estaba bien', () => {
    expect(decodeUploadName('analitica.pdf')).toBe('analitica.pdf');
  });
});

describe('safeDisplayName', () => {
  it('quita rutas y caracteres peligrosos', () => {
    expect(safeDisplayName('../../etc/passwd')).toBe('passwd');
    expect(safeDisplayName('C:\\Users\\ana\\informe.pdf')).toBe('informe.pdf');
    expect(safeDisplayName('a"b<c>d.pdf')).toBe('abcd.pdf');
    expect(safeDisplayName('línea\nnueva\r.pdf')).toBe('líneanueva.pdf');
  });

  it('usa un nombre por defecto si no queda nada útil', () => {
    expect(safeDisplayName('')).toBe('archivo');
    expect(safeDisplayName('..')).toBe('archivo');
    expect(safeDisplayName('///')).toBe('archivo');
  });

  it('acota la longitud conservando el final (la extensión)', () => {
    const name = `${'a'.repeat(300)}.pdf`;
    const safe = safeDisplayName(name);
    expect(safe.length).toBeLessThanOrEqual(120);
    expect(safe.endsWith('.pdf')).toBe(true);
  });
});
