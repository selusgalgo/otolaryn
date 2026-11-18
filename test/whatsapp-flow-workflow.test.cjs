"use strict";
const {test}=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs');const os=require('node:os');const path=require('node:path');const cp=require('node:child_process');
test('constructs an inactive workflow that filters senders and verifies completions',()=>{
 const names=['WhatsApp Trigger','Enviar WhatsApp','Normalizar mensaje','Mederi conversación','Preparar respuesta Mederi','Validar reclamación','Reclamar respuesta','Registrar entrega aceptada'];
 const w={active:false,nodes:names.map(name=>({name,id:name,parameters:{}})),connections:{},settings:{}};
 for(const name of ['Reclamar respuesta','Registrar entrega aceptada'])w.nodes.find(x=>x.name===name).parameters.jsonBody="phone:'+34600000990'";
 const temp=fs.mkdtempSync(path.join(os.tmpdir(),'flow-wf-'));const source=path.join(temp,'source.json');fs.writeFileSync(source,JSON.stringify(w));
 try{
  const f=JSON.parse(cp.execFileSync(process.execPath,[path.join(__dirname,'../scripts/whatsapp-flow/build-workflow.cjs'),source,'34600000111','+34600000991','1818531055964877'],{encoding:'utf8'}));const n=name=>f.nodes.find(x=>x.name===name);assert.equal(f.active,false);assert.equal(n('WhatsApp Trigger').disabled,true);assert.equal(n('Enviar WhatsApp').disabled,true);
  const normalize=new Function('$input',n('Normalizar mensaje').parameters.jsCode);const message=(from,body)=>({json:{messages:[{from,id:'m1',type:'text',text:{body}}]}});
  assert.equal(normalize({all:()=>[message('34600000000','CITA')]}).length,0);assert.equal(normalize({all:()=>[message('34600000111','hola')]}).length,0);
  const start=normalize({all:()=>[message('34600000111','CITA')]})[0];assert.equal(start.json.kind,'start');
  const token='A'.repeat(43),completed=normalize({all:()=>[{json:{messages:[{from:'34600000111',id:'m2',type:'interactive',interactive:{type:'nfm_reply',nfm_reply:{response_json:JSON.stringify({flow_token:token})}}}]}}]})[0];assert.equal(completed.json.kind,'completed');
  const select=new Function('$input','$',n('Validar reclamación').parameters.jsCode);const x=select({all:()=>[{json:{send:true,attempt:'attempt'}}]},()=>({itemMatching:()=>({json:{...start.json,flow_token:token}})}));
  assert.equal(x[0].json.metaPayload.interactive.action.parameters.mode,'draft');assert.equal(x[0].json.metaPayload.to,'34600000111');
  assert.match(n('Mederi conversación').parameters.url,/'result'/);assert.match(n('Reclamar respuesta').parameters.jsonBody,/34600000991/);
 }finally{fs.rmSync(temp,{recursive:true,force:true});}
});
