'use strict';
const fs = require('node:fs');
const { randomUUID } = require('node:crypto');
const draft = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
const code = (name) => draft.nodes.find((n) => n.name === name).parameters.jsCode;
const make = (name, jsCode, index) => ({ id: randomUUID(), name, type: 'n8n-nodes-base.code', typeVersion: 2, position: [index * 220, 0], parameters: { jsCode } });
const trigger = { id: randomUUID(), name: 'Manual', type: 'n8n-nodes-base.manualTrigger', typeVersion: 1, position: [0, 0], parameters: {} };
const nodes = [
  trigger,
  make('Fixture', `return [{json:{messages:[{type:'interactive',interactive:{type:'list_reply',list_reply:{id:'S:20/11/2026, 10:00'}},from:'34600000990',id:'smoke-1'}]}}];`, 1),
  make('Normalizar mensaje', code('Normalizar mensaje'), 2),
  make('Preparar respuesta Mederi', `return $input.all().map(item=>({json:{...item.json,reply:'Elige un horario escribiendo su número:\\n1. 20/11/2026, 10:00\\nEscribe FECHA para elegir otro día.'},pairedItem:item.pairedItem}));`, 3),
  make('Reclamar respuesta', `return $input.all().map((item,i)=>({json:{send:true,attempt:'test'},pairedItem:{item:i}}));`, 4),
  make('Validar reclamación', code('Validar reclamación'), 5),
  make('Comprobar', `const p=$input.first().json.metaPayload;if(p.type!=='interactive'||p.interactive.action.sections[0].rows[0].id!=='S:20/11/2026, 10:00')throw new Error('Lista incorrecta');return [{json:{ok:true}}];`, 6),
];
const connections = {};
for (let i=0;i<nodes.length-1;i++) connections[nodes[i].name] = { main: [[{ node: nodes[i+1].name, type: 'main', index: 0 }]] };
process.stdout.write(JSON.stringify({ id: `smoke${randomUUID().replaceAll('-', '').slice(0, 10)}`, name: 'Prueba temporal interactiva', active: false, nodes, connections, settings: { executionOrder: 'v1' } }));
