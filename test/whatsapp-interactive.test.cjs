const { test } = require('node:test');
const assert = require('node:assert/strict');
const { inboundText, outbound } = require('../scripts/whatsapp-interactive.cjs');

const phone = '34695853627';
const practitioner = '00000000-0000-4000-8000-000000000001';
const first = `S:${practitioner}:2026-11-20T09:00:00.000Z`;
const second = `S:${practitioner}:2026-11-20T09:30:00.000Z`;
test('turns real slots and navigation into a bounded interactive list', () => {
  const text = 'Elige un horario escribiendo su número:\n1. 20/11/2026, 10:00\n2. 20/11/2026, 10:30\nEscribe MAS para ver otros horarios.\nEscribe FECHA para elegir otro día.';
  const result = outbound(phone, text, { kind: 'slots', options: [{ id: first, title: '20/11/2026, 10:00' }, { id: second, title: '20/11/2026, 10:30' }], hasMore: true });
  assert.equal(result.type, 'interactive');
  const rows = result.interactive.action.sections[0].rows;
  assert.deepEqual(rows.map((r) => r.id), [first, second, 'MAS', 'FECHA']);
  assert.equal(inboundText({ type: 'interactive', interactive: { type: 'list_reply', list_reply: { id: rows[0].id } } }), rows[0].id);
});

test('keeps the full professional identity even when its displayed label is truncated', () => {
  const name = 'Profesional de ejemplo de nombre largo';
  const result = outbound(phone, `Para reservar una cita, elige profesional escribiendo el número:\n1. ${name}\nEscribe CANCELAR para salir.`, { kind: 'professionals', options: [{ id: `P:${practitioner}`, title: name }] });
  const row = result.interactive.action.sections[0].rows[0];
  assert.equal(row.id, `P:${practitioner}`);
  assert.ok(Array.from(row.title).length <= 24);
});

test('falls back to text for unsupported or oversized menus and ignores unrelated responses', () => {
  const menu = 'Para reservar una cita, elige profesional escribiendo el número:\n' + Array.from({ length: 11 }, (_, i) => `${i + 1}. Profesional ${i}`).join('\n');
  assert.equal(outbound(phone, menu, { kind: 'professionals', options: Array.from({ length: 11 }, () => ({ id: `P:${practitioner}`, title: 'Profesional' })) }).type, 'text');
  assert.equal(outbound(phone, menu).type, 'text');
  assert.equal(outbound(phone, 'Indica tu fecha de nacimiento.').type, 'text');
  assert.equal(inboundText({ type: 'interactive', interactive: { type: 'list_reply', list_reply: { id: 'SI' } } }), '');
  assert.equal(inboundText({ type: 'text', text: { body: ' CITA ' } }), 'CITA');
});


test('offers dates and a confirmation bound to the chosen appointment', () => {
  const day = `D:${practitioner}:2026-11-20`;
  const dates = outbound(phone, 'Elige una fecha', { kind: 'dates', options: [{ id: day, title: 'vie, 20/11' }], hasMore: true });
  assert.deepEqual(dates.interactive.action.sections[0].rows.map((row) => row.id), [day, 'MASFECHAS']);
  assert.equal(inboundText({ type: 'interactive', interactive: { type: 'list_reply', list_reply: { id: day } } }), day);
  const id = `CONFIRMAR:${practitioner}:2026-11-20T09:00:00.000Z`;
  const confirm = outbound(phone, '¿Confirmas la cita?', { kind: 'confirm', options: [{ id, title: 'Confirmar cita' }, { id: 'CANCELAR', title: 'Cancelar' }] });
  assert.equal(confirm.interactive.type, 'button');
  assert.equal(inboundText({ type: 'interactive', interactive: { type: 'button_reply', button_reply: { id } } }), id);
});
