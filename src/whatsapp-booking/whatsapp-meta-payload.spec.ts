import { whatsappMetaPayload } from './whatsapp-meta-payload';

describe('whatsappMetaPayload', () => {
  it('presenta las horas de los huecos y las opciones de navegación', () => {
    const id = '32d948bd-874b-4f84-a163-e1bc7f759ce4';
    const result = whatsappMetaPayload('34695853627', 'Elige una hora', { kind: 'slots', options: [{ id: `S:${id}:2026-11-24T09:00:00.000Z`, title: '10:00' }], hasMore: true });
    expect(JSON.stringify(result)).toContain('10:00');
    expect(JSON.stringify(result)).toContain('Más horarios');
    expect(JSON.stringify(result)).toContain('Otra fecha');
  });
  it('no envía como opción interactiva un identificador ajeno al menú', () => {
    const result = whatsappMetaPayload('34695853627', 'Elige', { kind: 'professionals', options: [{ id: 'otro', title: 'Test' }] });
    expect(result.type).toBe('text');
  });
});
