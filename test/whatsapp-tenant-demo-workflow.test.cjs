const { build } = require('../scripts/build-whatsapp-tenant-demo-workflow.cjs');
const { test } = require('node:test');
const assert = require('node:assert/strict');

test('el flujo de prueba filtra cuenta y remitente y no envía desde la rama manual', () => {
  const names = ['WhatsApp Trigger', 'Normalizar mensaje', 'Mederi conversación', '¿Mensaje real?', 'Resultado de prueba', 'Prueba manual', 'Mensaje ficticio'];
  const result = build({ nodes: names.map(name => ({ name, parameters: {} })) });
  assert.equal(result.active, false);
  const code = result.nodes.find(n => n.name === 'Normalizar mensaje').parameters.jsCode;
  const normalize = new Function('$input', code);
  const item = (from, id) => ({ json: { metadata: { phone_number_id: id }, messages: [{ from, id: 'event', type: 'text', text: { body: 'HOLA' } }] } });
  assert.equal(normalize({ all: () => [item('34695853627', '1262575040283464'), item('34626079025', '1262575040283464')] }).length, 2);
  assert.equal(normalize({ all: () => [item('34699999999', '1262575040283464'), item('34695853627', '999')] }).length, 0);
  assert.equal(result.connections['¿Mensaje real?'].main[1][0].node, 'Resultado de prueba');
  assert.equal(result.connections['Resultado de prueba'], undefined);
});
