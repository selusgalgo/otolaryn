"use strict";
const fs=require('node:fs'),{randomUUID}=require('node:crypto');
const w=JSON.parse(fs.readFileSync(process.argv[2],'utf8'));const mode=process.argv[3]==='completed'?'completed':'start';const phone=process.argv[4];if(!/^\d{8,15}$/.test(phone||''))throw Error('Test phone required');
w.id='fs'+randomUUID().replaceAll('-','').slice(0,12);w.name='Prueba local de Flow';w.active=false;
w.nodes=w.nodes.filter(x=>x.name!=='WhatsApp Trigger');delete w.connections['WhatsApp Trigger'];
const node=name=>w.nodes.find(x=>x.name===name);node('Enviar WhatsApp').disabled=false;
const tok='A'.repeat(43);
node('Mensaje ficticio').parameters.jsCode=mode==='start'?`return [{json:{messages:[{from:'${phone}',id:'smoke-start',type:'text',text:{body:'CITA'}}]}}];`:`return [{json:{messages:[{from:'${phone}',id:'smoke-end',type:'interactive',interactive:{type:'nfm_reply',nfm_reply:{response_json:JSON.stringify({flow_token:'${tok}'})}}}]}}];`;
for(const [name,url] of Object.entries({'Mederi conversación':`http://127.0.0.1:31978/${mode}`,'Reclamar respuesta':'http://127.0.0.1:31978/claim','Enviar WhatsApp':'http://127.0.0.1:31978/meta','Registrar entrega aceptada':'http://127.0.0.1:31978/record'})){
 const n=node(name);n.parameters.url=url;delete n.parameters.authentication;delete n.parameters.genericAuthType;delete n.parameters.nodeCredentialType;delete n.credentials;
}
process.stdout.write(JSON.stringify(w));
