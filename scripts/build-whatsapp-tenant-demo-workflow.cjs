'use strict';

const { randomUUID } = require('node:crypto');
const { inboundText } = require('./whatsapp-interactive.cjs');

// Builds an inactive candidate; it never edits the published workflow or a webhook.
function build(base) {
  const names = ['WhatsApp Trigger', 'Normalizar mensaje', 'Mederi conversación', '¿Mensaje real?', 'Resultado de prueba', 'Prueba manual', 'Mensaje ficticio'];
  const nodes = names.map(name => {
    const node = base.nodes.find(n => n.name === name);
    if (!node) throw new Error(`Falta el nodo ${name}`);
    return structuredClone(node);
  });
  const node = name => nodes.find(n => n.name === name);
  node('Normalizar mensaje').parameters.jsCode = `${inboundText.toString()}\nconst out=[]; for(const [i,item] of $input.all().entries()){const data=item.json;const phoneNumberId=data.__mederi_test===true?'1262575040283464':String(data.metadata?.phone_number_id||'');if(phoneNumberId!=='1262575040283464')continue;for(const m of data.messages||[]){const text=inboundText(m);if(!text)continue;const phone=String(m.from||'').replace(/^\\+/,'');if(!['34695853627','34626079025'].includes(phone))continue;if(typeof m.id!=='string'||!m.id||m.id.length>256||text.length>500)continue;out.push({json:{text,phone:'+'+phone,phoneNumberId,event_id:m.id,is_test:data.__mederi_test===true},pairedItem:{item:i}});}}return out;`;
  node('Mederi conversación').parameters = {
    method: 'POST', url: 'http://172.18.0.1:31093/integrations/whatsapp-tenant-router/messages',
    authentication: 'genericCredentialType', genericAuthType: 'httpHeaderAuth', sendBody: true, specifyBody: 'json',
    jsonBody: '={{ JSON.stringify({phoneNumberId:$json.phoneNumberId,phone:$json.phone,messageId:$json.event_id,text:$json.text}) }}',
    options: { timeout: 60000 },
  };
  node('Resultado de prueba').parameters.jsCode = "return [{json:{test:true,send:false},pairedItem:{item:0}}];";
  const edge = name => ({ node: name, type: 'main', index: 0 });
  return {
    id: randomUUID().replaceAll('-', '').slice(0, 16),
    name: 'Mederi DEMO · Conexión autónoma (borrador)', active: false, nodes,
    connections: {
      'WhatsApp Trigger': { main: [[edge('Normalizar mensaje')]] },
      'Prueba manual': { main: [[edge('Mensaje ficticio')]] },
      'Mensaje ficticio': { main: [[edge('Normalizar mensaje')]] },
      'Normalizar mensaje': { main: [[edge('¿Mensaje real?')]] },
      '¿Mensaje real?': { main: [[edge('Mederi conversación')], [edge('Resultado de prueba')]] },
    },
    settings: { executionOrder: 'v1', saveDataErrorExecution: 'none', saveDataSuccessExecution: 'none', saveManualExecutions: false },
  };
}
module.exports = { build };
if (require.main === module) {
  let raw = '';
  process.stdin.setEncoding('utf8');
  process.stdin.on('data', data => raw += data);
  process.stdin.on('end', () => process.stdout.write(JSON.stringify(build(JSON.parse(raw)))));
}
