const { test } = require('node:test');
const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const path = require('node:path');

test('generated inactive workflow normalizes clicks and builds Meta payload after claim', () => {
  const nodes = ['WhatsApp Trigger', 'Normalizar mensaje', 'Validar reclamación', 'Enviar WhatsApp', 'Preparar respuesta Mederi'].map((name) => ({ id: name, name, type: 'n8n-nodes-base.code', parameters: {} }));
  nodes[0].webhookId = 'old-webhook';
  nodes[3].type = 'n8n-nodes-base.whatsApp';
  nodes[3].credentials = { whatsAppApi: { id: 'test-credential', name: 'test' } };
  nodes[4].parameters.jsCode = 'return [{json:{reply:body.reply,duplicate:false}}];';
  const fixture = { name: 'test', nodes, connections: {}, settings: {} };
  const script = path.join(__dirname, '../scripts/build-interactive-workflow.cjs');
  const flow = JSON.parse(execFileSync(process.execPath, [script], { input: JSON.stringify(fixture), encoding: 'utf8' }));
  const get = (name) => flow.nodes.find((n) => n.name === name);
  assert.equal(flow.active, false);
  assert.equal(get('WhatsApp Trigger').disabled, true);
  assert.notEqual(get('WhatsApp Trigger').webhookId, 'old-webhook');
  assert.equal(get('Enviar WhatsApp').disabled, true);
  assert.equal(get('Enviar WhatsApp').parameters.nodeCredentialType, 'whatsAppApi');
  assert.match(get('Enviar WhatsApp').parameters.url, /^https:\/\/graph\.facebook\.com\//);
  const selection = 'S:00000000-0000-4000-8000-000000000001:2026-11-20T09:00:00.000Z';
  const input = [{ json: { messages: [{ type: 'interactive', interactive: { type: 'list_reply', list_reply: { id: selection } }, from: '34695853627', id: 'm1' }] } }];
  const normalized = new Function('$input', get('Normalizar mensaje').parameters.jsCode)({ all: () => input });
  assert.equal(normalized[0].json.text, selection);
  const origin = { ...normalized[0].json, reply: 'Elige un horario escribiendo su número:\n1. 20/11/2026, 10:00\nEscribe FECHA para elegir otro día.', menu: { kind: 'slots', options: [{ id: selection, title: '20/11/2026, 10:00' }] } };
  const selected = new Function('$input', '$', get('Validar reclamación').parameters.jsCode)(
    { all: () => [{ json: { send: true, attempt: 'attempt-1' } }] },
    () => ({ itemMatching: () => ({ json: origin }) }),
  );
  assert.equal(selected[0].json.metaPayload.type, 'interactive');
  assert.equal(selected[0].json.metaPayload.interactive.action.sections[0].rows[0].id, selection);
});
