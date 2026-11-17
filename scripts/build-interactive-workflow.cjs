'use strict';

// Usage: node scripts/build-interactive-workflow.cjs < exported-workflow.json > draft.json
// The output is a separate inactive draft; it contains credential references,
// not credential values. Never activate it until the paired backend is deployed.
const fs = require('node:fs');
const { randomUUID } = require('node:crypto');
const { inboundText, outbound } = require('./whatsapp-interactive.cjs');
const source = JSON.parse(fs.readFileSync(0, 'utf8'));
const workflow = Array.isArray(source) ? source[0] : source;
const node = (name) => {
  const result = workflow.nodes.find((item) => item.name === name);
  if (!result) throw new Error(`Missing node: ${name}`);
  return result;
};
const trigger = node('WhatsApp Trigger');
const normalizer = node('Normalizar mensaje');
const validator = node('Validar reclamación');
const sender = node('Enviar WhatsApp');
if (sender.type !== 'n8n-nodes-base.whatsApp' || !sender.credentials?.whatsAppApi) throw new Error('Unexpected sender');
for (const item of workflow.nodes) {
  item.id = randomUUID();
  if (item.webhookId) item.webhookId = randomUUID();
}
trigger.disabled = true;
normalizer.parameters.jsCode = `${inboundText.toString()}\n` +
  `const out=[]; for(const [i,item] of $input.all().entries()){const data=item.json; for(const m of data.messages||[]){const text=inboundText(m); if(!text) continue; const phone=String(m.from||'').replace(/^\\+/,''); if(!/^[1-9][0-9]{7,14}$/.test(phone)||typeof m.id!=='string'||!m.id) throw new Error('Mensaje sin remitente o identificador válido');out.push({json:{text,phone,event_id:m.id,is_test:data.__mederi_test===true},pairedItem:{item:i}});}}return out;`;
validator.parameters.jsCode = `const truncate=(value,length)=>Array.from(value).slice(0,length).join('');\n${outbound.toString()}\n` +
  `return $input.all().flatMap((item,index)=>{if(!item.json.send)return [];const origin=$('Preparar respuesta Mederi').itemMatching(index).json;if(typeof item.json.attempt!=='string')throw new Error('Reclamación sin identificador');return [{json:{...origin,attempt:item.json.attempt,metaPayload:outbound(origin.phone,origin.reply)},pairedItem:{item:index}}];});`;
sender.type = 'n8n-nodes-base.httpRequest';
sender.typeVersion = 4.2;
sender.disabled = true;
sender.parameters = {
  method: 'POST',
  url: 'https://graph.facebook.com/v25.0/1262575040283464/messages',
  authentication: 'predefinedCredentialType',
  nodeCredentialType: 'whatsAppApi',
  sendBody: true,
  specifyBody: 'json',
  jsonBody: '={{ JSON.stringify($json.metaPayload) }}',
  options: { timeout: 20000 },
};
workflow.name = 'Mederi DEMO · Citas WhatsApp interactivas (borrador)';
workflow.active = false;
workflow.settings = { ...workflow.settings, saveDataErrorExecution: 'none', saveDataSuccessExecution: 'none', saveManualExecutions: false };
const result = { id: randomUUID().replaceAll('-', '').slice(0, 16), name: workflow.name, active: false, nodes: workflow.nodes, connections: workflow.connections, settings: workflow.settings };
// The original manual fixture contains the authorised real phone; a new draft
// starts with an unrelated fictitious phone and cannot accidentally test it.
process.stdout.write(JSON.stringify(result, null, 2).replaceAll('34695853627', '34600000990'));
