const { test } = require('node:test');
const assert = require('node:assert/strict');
const { inboundText, outbound } = require('../scripts/whatsapp-interactive.cjs');

const phone = '34695853627';
test('turns real slots and navigation into a bounded interactive list', () => {
  const text = 'Elige un horario escribiendo su número:\n1. 20/11/2026, 10:00\n2. 20/11/2026, 10:30\nEscribe MAS para ver otros horarios.\nEscribe FECHA para elegir otro día.';
  const result = outbound(phone, text);
  assert.equal(result.type, 'interactive');
  const rows = result.interactive.action.sections[0].rows;
  assert.deepEqual(rows.map((r) => r.id), ['S:20/11/2026, 10:00', 'S:20/11/2026, 10:30', 'MAS', 'FECHA']);
  assert.equal(inboundText({ type: 'interactive', interactive: { type: 'list_reply', list_reply: { id: rows[0].id } } }), rows[0].id);
});

test('keeps the full professional identity even when its displayed label is truncated', () => {
  const name = 'Profesional de ejemplo de nombre largo';
  const result = outbound(phone, `Para reservar una cita, elige profesional escribiendo el número:\n1. ${name}\nEscribe CANCELAR para salir.`);
  const row = result.interactive.action.sections[0].rows[0];
  assert.equal(row.id, `P:1:${name}`);
  assert.ok(Array.from(row.title).length <= 24);
});

test('falls back to text for unsupported or oversized menus and ignores unrelated responses', () => {
  const menu = 'Para reservar una cita, elige profesional escribiendo el número:\n' + Array.from({ length: 11 }, (_, i) => `${i + 1}. Profesional ${i}`).join('\n');
  assert.equal(outbound(phone, menu).type, 'text');
  assert.equal(outbound(phone, 'Indica tu fecha de nacimiento.').type, 'text');
  assert.equal(inboundText({ type: 'interactive', interactive: { type: 'list_reply', list_reply: { id: 'SI' } } }), '');
  assert.equal(inboundText({ type: 'text', text: { body: ' CITA ' } }), 'CITA');
});
