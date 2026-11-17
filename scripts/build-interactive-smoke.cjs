'use strict';
const fs = require('node:fs');
const { randomUUID } = require('node:crypto');
const draft = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
const code = (name) => draft.nodes.find((n) => n.name === name).parameters.jsCode;
const make = (name, jsCode, index) => ({ id: randomUUID(), name, type: 'n8n-nodes-base.code', typeVersion: 2, position: [index * 220, 0], parameters: { jsCode } });
const trigger = { id: randomUUID(), name: 'Manual', type: 'n8n-nodes-base.manualTrigger', typeVersion: 1, position: [0, 0], parameters: {} };
const providerPath = process.argv[3] === 'empty' ? 'empty' : 'ok';
const sender = draft.nodes.find((n) => n.name === 'Enviar WhatsApp');
const mockSender = {
  id: randomUUID(), name: 'Enviar WhatsApp', type: 'n8n-nodes-base.httpRequest', typeVersion: sender.typeVersion,
  position: [1320, 0], parameters: { ...sender.parameters, url: `http://127.0.0.1:31977/${providerPath}` },
};
if (process.argv[4] === 'auth') {
  mockSender.credentials = { whatsAppApi: { id: 'localmockcred001', name: 'Credencial ficticia interactiva' } };
} else {
  delete mockSender.parameters.authentication;
  delete mockSender.parameters.nodeCredentialType;
}
const nodes = [
  trigger,
  make('Fixture', `return [{json:{messages:[{type:'interactive',interactive:{type:'list_reply',list_reply:{id:'S:20/11/2026, 10:00'}},from:'34600000990',id:'smoke-1'}]}}];`, 1),
  make('Normalizar mensaje', code('Normalizar mensaje'), 2),
  make('Preparar respuesta Mederi', `return $input.all().map(item=>({json:{...item.json,reply:'Elige un horario escribiendo su número:\\n1. 20/11/2026, 10:00\\nEscribe FECHA para elegir otro día.'},pairedItem:item.pairedItem}));`, 3),
  make('Reclamar respuesta', `return $input.all().map((item,i)=>({json:{send:true,attempt:'test'},pairedItem:{item:i}}));`, 4),
  make('Validar reclamación', code('Validar reclamación'), 5),
  mockSender,
  make('Validar aceptación Meta', code('Validar aceptación Meta'), 7),
  make('Comprobar', `const item=$input.first().json;const origin=$('Validar reclamación').item.json;if(item.accepted!==true||origin.attempt!=='test'||origin.event_id!=='smoke-1')throw new Error('Aceptación o trazabilidad incorrecta');return [{json:{ok:true}}];`, 8),
];
const connections = {};
for (let i=0;i<nodes.length-1;i++) connections[nodes[i].name] = { main: [[{ node: nodes[i+1].name, type: 'main', index: 0 }]] };
process.stdout.write(JSON.stringify({ id: `smoke${randomUUID().replaceAll('-', '').slice(0, 10)}`, name: 'Prueba temporal interactiva', active: false, nodes, connections, settings: { executionOrder: 'v1' } }));
