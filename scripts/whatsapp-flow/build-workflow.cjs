"use strict";
// A separate inactive n8n draft. Inputs and output contain no credentials.
const fs=require('node:fs'),{randomUUID}=require('node:crypto');
const [path,allowed,alias,flowId]=process.argv.slice(2);
if(!/^\d{8,15}$/.test(allowed||'')||!/^\+\d{8,15}$/.test(alias||'')||!/^\d{8,30}$/.test(flowId||''))throw Error('Invalid demo parameters');
const w=JSON.parse(fs.readFileSync(path,'utf8'));
if(w.active)throw Error('Expected inactive source');
const node=name=>{const n=w.nodes.find(x=>x.name===name);if(!n)throw Error(`Missing ${name}`);return n;};
for(const n of w.nodes){n.id=randomUUID();if(n.webhookId)n.webhookId=randomUUID();}
w.id=randomUUID().replaceAll('-','').slice(0,16);w.name='Mederi DEMO · Flow visual (prueba aislada)';w.active=false;
node('WhatsApp Trigger').disabled=true;node('Enviar WhatsApp').disabled=true;
node('Normalizar mensaje').parameters.jsCode=`const result=[];for(const [i,item] of $input.all().entries()){for(const m of item.json.messages||[]){const phone=String(m.from||'').replace(/^\\+/,'');if(phone!==${JSON.stringify(allowed)}||typeof m.id!=='string'||!m.id)continue;let kind,token;if(m.type==='text'&&/^cita$/i.test(String(m.text?.body||'').trim()))kind='start';else if(m.type==='interactive'&&m.interactive?.type==='nfm_reply'){try{const r=JSON.parse(m.interactive.nfm_reply?.response_json||'{}');if(/^[A-Za-z0-9_-]{43}$/.test(r.flow_token)){kind='completed';token=r.flow_token;}}catch{}}if(kind)result.push({json:{phone,event_id:m.id,kind,flow_token:token,is_test:false},pairedItem:{item:i}});}}return result;`;
const request=node('Mederi conversación');
request.parameters.url="={{ 'http://172.18.0.1:31093/' + ($json.kind === 'start' ? 'start' : 'result') }}";
request.parameters.jsonBody="={{ JSON.stringify({phone:'+'+$json.phone,flow_token:$json.flow_token}) }}";
node('Preparar respuesta Mederi').parameters.jsCode=`const out=[];for(const [i,item] of $input.all().entries()){const incoming=$('Normalizar mensaje').itemMatching(i).json;if(item.json.statusCode!==200)throw new Error('Error al iniciar o verificar la reserva');const body=item.json.body;if(incoming.kind==='start'&&!/^[A-Za-z0-9_-]{43}$/.test(body?.flow_token||''))throw new Error('Sesión inválida');if(incoming.kind==='completed'&&(typeof body?.id!=='string'||!Number.isFinite(Date.parse(body?.scheduledAt))))throw new Error('Reserva no confirmada');out.push({json:{...incoming,flow_token:body.flow_token||incoming.flow_token,booking_id:body.id,scheduled_at:body.scheduledAt},pairedItem:{item:i}});}return out;`;
node('Validar reclamación').parameters.jsCode=`return $input.all().flatMap((item,index)=>{if(!item.json.send)return [];const origin=$('Preparar respuesta Mederi').itemMatching(index).json;if(typeof item.json.attempt!=='string')throw new Error('Reclamación sin identificador');const base={messaging_product:'whatsapp',recipient_type:'individual',to:origin.phone};let metaPayload;if(origin.kind==='start'){metaPayload={...base,type:'interactive',interactive:{type:'flow',body:{text:'Reserva tu cita de forma sencilla.'},action:{name:'flow',parameters:{flow_message_version:'3',flow_id:${JSON.stringify(flowId)},flow_cta:'Reservar cita',flow_token:origin.flow_token,flow_action:'data_exchange',mode:'draft'}}}};}else{const when=new Intl.DateTimeFormat('es-ES',{timeZone:'Europe/Madrid',dateStyle:'long',timeStyle:'short'}).format(new Date(origin.scheduled_at));metaPayload={...base,type:'text',text:{body:'Tu cita de prueba está confirmada para el '+when+'. Referencia: '+origin.booking_id}};}return [{json:{...origin,attempt:item.json.attempt,metaPayload},pairedItem:{item:index}}];});`;
for(const name of ['Reclamar respuesta','Registrar entrega aceptada']){
 const p=node(name).parameters;const prior="'+34600000990'";if(!p.jsonBody.includes(prior))throw Error('Unexpected prior demo phone');p.jsonBody=p.jsonBody.replaceAll(prior,JSON.stringify(alias));
}
w.settings={...w.settings,saveDataErrorExecution:'none',saveDataSuccessExecution:'none',saveManualExecutions:false};
process.stdout.write(JSON.stringify({id:w.id,name:w.name,active:false,nodes:w.nodes,connections:w.connections,settings:w.settings},null,2));
