"use strict";
const {test}=require('node:test');
const assert=require('node:assert/strict');
const crypto=require('node:crypto');
const {createEngine,servers,backendClient}=require('../scripts/whatsapp-flow/demo.cjs');
const phone='+34600000111', demo='+34600000991', professional='00000000-0000-4000-8000-000000000001';
const day=new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Madrid',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(Date.now()+3*86400000));
const slot=`${day}T09:00:00.000Z`;
function fixture(){let bookings=0;const backend=async(path,body,key)=>{
  if(path==='/practitioners')return [{id:professional,firstName:'Ana',lastName:'Ejemplo'}];
  if(path.startsWith('/dates?'))return [day];
  if(path.startsWith('/slots?'))return [{scheduledAt:slot}];
  if(path==='/appointments'){bookings++;assert.equal(body.phone,demo);assert.match(key,/^flow:[a-f0-9]{64}$/);return {id:'example-id',status:'scheduled',scheduledAt:slot};}
  throw Error('unknown path');
};return {engine:createEngine({backend,allowedPhone:phone,demoPhone:demo}),bookings:()=>bookings};}
async function prepared(engine){const token=engine.start(phone);assert.equal(engine.start('+34600000000'),null);
 let r=await engine.handle({action:'INIT',flow_token:token});assert.equal(r.screen,'PROFESIONAL');
 r=await engine.handle({action:'data_exchange',screen:'PROFESIONAL',flow_token:token,data:{profesional:professional}});assert.equal(r.screen,'FECHA');
 assert.match((await engine.handle({action:'data_exchange',screen:'FECHA',flow_token:token,data:{profesional:professional,fecha:'1900-01-01'}})).data.error_message,/fecha disponible/);
 r=await engine.handle({action:'data_exchange',screen:'FECHA',flow_token:token,data:{profesional:professional,fecha:day}});assert.equal(r.screen,'HORA');
 r=await engine.handle({action:'data_exchange',screen:'HORA',flow_token:token,data:{profesional:professional,fecha:day,hora:slot}});assert.equal(r.screen,'DATOS');
 r=await engine.handle({action:'data_exchange',screen:'DATOS',flow_token:token,data:{profesional:professional,fecha:day,hora:slot,nombre:'Prueba Demo',nacimiento:'1990-01-01'}});assert.equal(r.screen,'RESUMEN');return token;}
test('binds session to allowed sender and verifies every booking choice',async()=>{
 const f=fixture(),token=await prepared(f.engine),request={action:'data_exchange',screen:'RESUMEN',flow_token:token,data:{profesional:professional,fecha:day,hora:slot,nombre:'Prueba Demo',nacimiento:'1990-01-01'}};
 await assert.rejects(f.engine.handle({...request,data:{...request.data,hora:'2000-01-01T00:00:00.000Z'}}));
 assert.equal((await f.engine.handle(request)).screen,'SUCCESS');assert.equal((await f.engine.handle(request)).screen,'SUCCESS');assert.equal(f.bookings(),1);
 assert.equal(f.engine.lookup(token,'+34600000000'),null);assert.equal(f.engine.lookup(token,phone).id,'example-id');
});
test('authenticates Meta, decrypts requests and encrypts the response',async()=>{
 const pair=crypto.generateKeyPairSync('rsa',{modulusLength:2048}),secret='demo-secret';const f=fixture();
 const app=servers({engine:f.engine,appSecret:secret,privateKey:pair.privateKey,gatewayDigest:'a'.repeat(64),allowedClient:'127.0.0.1'});
 await new Promise(r=>app.external.listen(0,'127.0.0.1',r));
 try{
  const key=crypto.randomBytes(16),iv=crypto.randomBytes(16),cipher=crypto.createCipheriv('aes-128-gcm',key,iv);
  const encrypted=Buffer.concat([cipher.update(JSON.stringify({version:'3.0',action:'ping'})),cipher.final(),cipher.getAuthTag()]);
  const raw=JSON.stringify({encrypted_flow_data:encrypted.toString('base64'),encrypted_aes_key:crypto.publicEncrypt({key:pair.publicKey,padding:crypto.constants.RSA_PKCS1_OAEP_PADDING,oaepHash:'sha256'},key).toString('base64'),initial_vector:iv.toString('base64')});
  const url=`http://127.0.0.1:${app.external.address().port}/flows`;
  assert.equal((await fetch(url,{method:'POST',body:raw,headers:{'x-hub-signature-256':'sha256=wrong'}})).status,401);
  const signature='sha256='+crypto.createHmac('sha256',secret).update(raw).digest('hex');
  const res=await fetch(url,{method:'POST',body:raw,headers:{'x-hub-signature-256':signature}});assert.equal(res.status,200);
  const response=Buffer.from(await res.text(),'base64'),dec=crypto.createDecipheriv('aes-128-gcm',key,Buffer.from(iv.map(x=>x^255)));dec.setAuthTag(response.subarray(-16));
  assert.deepEqual(JSON.parse(Buffer.concat([dec.update(response.subarray(0,-16)),dec.final()])),{data:{status:'active'}});
 }finally{await new Promise(r=>app.external.close(r));}
});


test('internal session creation requires both the permitted client and credential',async()=>{
 const secret='test_'+'a'.repeat(48),digest=crypto.createHash('sha256').update(secret).digest('hex');
 const app=servers({engine:fixture().engine,appSecret:'test',privateKey:'test',gatewayDigest:digest,allowedClient:'127.0.0.1'});
 await new Promise(r=>app.internal.listen(0,'127.0.0.1',r));
 try{
  const url=`http://127.0.0.1:${app.internal.address().port}/start`,body=JSON.stringify({phone});
  assert.equal((await fetch(url,{method:'POST',body,headers:{authorization:'Bearer '+('x'.repeat(48))}})).status,401);
  const headers={authorization:'Bearer '+secret};
  assert.equal((await fetch(url,{method:'POST',headers,body:JSON.stringify({phone:'+34600000000'})})).status,403);
  const response=await fetch(url,{method:'POST',headers,body});assert.equal(response.status,200);
  const {flow_token}=await response.json();assert.match(flow_token,/^[A-Za-z0-9_-]{43}$/);
 }finally{await new Promise(r=>app.internal.close(r));}
});


test('backend client calls the protected integration route',async()=>{
 const previous=global.fetch;let seen;global.fetch=async(url,options)=>{seen={url,options};return {ok:true,json:async()=>[]};};
 try{await backendClient('http://127.0.0.1:31091','fixture-token')('/practitioners');assert.equal(seen.url,'http://127.0.0.1:31091/integrations/whatsapp-booking/practitioners');assert.equal(seen.options.headers.authorization,'Bearer fixture-token');}
 finally{global.fetch=previous;}
});
