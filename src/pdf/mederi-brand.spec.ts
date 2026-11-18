import { mederiLogoDataUri } from './mederi-brand';

// Reads width and height from the PNG header (IHDR), no image library needed.
function pngSize(dataUri: string): { width: number; height: number } {
  const bytes = Buffer.from(dataUri.split(',')[1], 'base64');
  return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) };
}

describe('mederiLogoDataUri', () => {
  it('is a PNG data URI, which pdfmake accepts without touching the filesystem', () => {
    expect(mederiLogoDataUri().startsWith('data:image/png;base64,')).toBe(true);
  });

  it('is the horizontal logo (about 3:1), not the vertical one', () => {
    const { width, height } = pngSize(mederiLogoDataUri());
    expect(width / height).toBeGreaterThan(2.5);
    expect(width / height).toBeLessThan(3.5);
  });

  it('is large enough to print sharply (several times its on-page size)', () => {
    expect(pngSize(mederiLogoDataUri()).width).toBeGreaterThanOrEqual(600);
  });

  it('is cached: the same string comes back', () => {
    expect(mederiLogoDataUri()).toBe(mederiLogoDataUri());
  });
});
