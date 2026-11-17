"use strict";
// Temporary, single-tenant demo adapter. No clinical data or tokens are logged.
const crypto = require('node:crypto');
const fs = require('node:fs');
const http = require('node:http');

const same = (a,b) => {
  const x=Buffer.from(String(a)), y=Buffer.from(String(b));
  return x.length===y.length && crypto.timingSafeEqual(x,y);
};
function decrypt(body, privateKey) {
  const key=crypto.privateDecrypt({key:privateKey,padding:crypto.constants.RSA_PKCS1_OAEP_PADDING,oaepHash:'sha256'},Buffer.from(body.encrypted_aes_key,'base64'));
  if (key.length!==16) throw Error('invalid key');
  const iv=Buffer.from(body.initial_vector,'base64');
  if (iv.length<12 || iv.length>16) throw Error('invalid iv');
  const encrypted=Buffer.from(body.encrypted_flow_data,'base64');
  if(encrypted.length<17) throw Error('invalid ciphertext');
  const dec=crypto.createDecipheriv('aes-128-gcm',key,iv);
  dec.setAuthTag(encrypted.subarray(-16));
  return {data:JSON.parse(Buffer.concat([dec.update(encrypted.subarray(0,-16)),dec.final()]).toString('utf8')),key,iv};
}
function encrypt(data,key,iv) {
  const cipher=crypto.createCipheriv('aes-128-gcm',key,Buffer.from(iv.map(x=>x^255)));
  return Buffer.concat([cipher.update(JSON.stringify(data),'utf8'),cipher.final(),cipher.getAuthTag()]).toString('base64');
}
const datesFor = (start,count) => Array.from({length:count},(_,i)=>{
  const d=new Date(`${start}T12:00:00Z`); d.setUTCDate(d.getUTCDate()+i); return d.toISOString().slice(0,10);
});
const today = () => new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Madrid',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
const formatSlot = iso => new Intl.DateTimeFormat('es-ES',{timeZone:'Europe/Madrid',day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).format(new Date(iso));
const summary = (s) => `${s.professionalName}\n${formatSlot(s.slot)}\n${s.fullName}`;
const safeName = value => typeof value==='string' && value.trim().length>=3 && value.trim().length<=80 && value.trim().split(/\s+/u).length>=2;
const validDOB = value => typeof value==='string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(`${value}T00:00:00Z`)) && new Date(`${value}T00:00:00Z`).toISOString().slice(0,10)===value && value>= '1900-01-01' && value<=today();
function createEngine({backend,allowedPhone,demoPhone,now=()=>Date.now()}) {
  if(!/^\+[1-9]\d{7,14}$/.test(allowedPhone)||!/^\+[1-9]\d{7,14}$/.test(demoPhone)) throw Error('invalid demo configuration');
  const sessions=new Map();
  const clean=()=>{for(const [key,val] of sessions)if(val.expires<=now())sessions.delete(key);};
  function start(phone) {
    clean();if(!same(phone,allowedPhone)) return null;
    const token=crypto.randomBytes(32).toString('base64url');
    sessions.set(token,{expires:now()+30*60*1000,phone});return token;
  }
  async function professionals(){
    const data=await backend('/practitioners');
    if(!Array.isArray(data)||!data.length||data.length>20) throw Error('no professionals');
    return data.map(p=>({id:p.id,title:`${p.firstName} ${p.lastName}`.slice(0,30)}));
  }
  async function calendar(id) {
    const available=await backend('/dates?'+new URLSearchParams({practitionerId:id}));
    if(!Array.isArray(available)) throw Error('invalid dates');
    const all=datesFor(today(),31), set=new Set(available);
    const allowed=all.filter(x=>set.has(x));
    return {allowed,min_fecha:all[0],max_fecha:all[30],no_disponibles:all.filter(x=>!set.has(x))};
  }
  function timeChoices(s) {
    const page=s.page||0, first=page*18;
    const items=s.slots.slice(first,first+18).map(x=>({id:x,title:formatSlot(x).slice(-5)}));
    if(page>0) items.push({id:'ANTERIORES',title:'Horarios anteriores'});
    if(s.slots.length>first+18) items.push({id:'MAS',title:'Más horarios'});
    return items;
  }
  async function handle(req) {
    if(req.action==='ping') return {data:{status:'active'}};
    if(req.data?.error) return {data:{acknowledged:true}};
    clean();const s=sessions.get(req.flow_token);
    if(!s) throw Error('unknown flow token');
    if(req.action==='INIT') {
      if(s.booked) throw Error('flow already completed');
      s.professionals=await professionals();s.step='PROFESIONAL';
      return {screen:'PROFESIONAL',data:{profesionales:s.professionals}};
    }
    if(req.action!=='data_exchange'||!req.data||typeof req.data!=='object') throw Error('invalid action');
    const data=req.data;
    if(req.screen==='PROFESIONAL' && ['PROFESIONAL','FECHA','HORA','DATOS','RESUMEN'].includes(s.step)) {
      const p=s.professionals.find(x=>x.id===data.profesional);if(!p)throw Error('invalid professional');
      const cal=await calendar(p.id);
      if(!cal.allowed.length)return {screen:'PROFESIONAL',data:{profesionales:s.professionals,error_message:'No hay fechas disponibles. Contacta con recepción.'}};
      Object.assign(s,{professional:p.id,professionalName:p.title,calendar:cal,step:'FECHA'});
      return {screen:'FECHA',data:{min_fecha:cal.min_fecha,max_fecha:cal.max_fecha,no_disponibles:cal.no_disponibles}};
    }
    if(req.screen==='FECHA' && ['FECHA','HORA','DATOS','RESUMEN'].includes(s.step)) {
      if(data.profesional!==s.professional)throw Error('invalid professional');
      if(!s.calendar.allowed.includes(data.fecha)){const c=s.calendar;s.step='FECHA';return {screen:'FECHA',data:{min_fecha:c.min_fecha,max_fecha:c.max_fecha,no_disponibles:c.no_disponibles,error_message:'Elige una fecha disponible.'}};}
      const slots=await backend('/slots?'+new URLSearchParams({practitionerId:s.professional,date:data.fecha}));
      if(!Array.isArray(slots)||!slots.length){
        s.calendar=await calendar(s.professional);const c=s.calendar;
        return {screen:'FECHA',data:{min_fecha:c.min_fecha,max_fecha:c.max_fecha,no_disponibles:c.no_disponibles,error_message:'Ese día ya no tiene huecos. Elige otro.'}};
      }
      s.date=data.fecha;s.slots=slots.map(x=>x.scheduledAt);s.page=0;s.step='HORA';
      return {screen:'HORA',data:{horarios:timeChoices(s)}};
    }
    if(req.screen==='HORA' && ['HORA','DATOS','RESUMEN'].includes(s.step)) {
      if(data.profesional!==s.professional||data.fecha!==s.date)throw Error('invalid slot');
      if(data.hora==='MAS' && s.slots.length>(s.page+1)*18){s.page++;return {screen:'HORA',data:{horarios:timeChoices(s)}};}
      if(data.hora==='ANTERIORES' && s.page>0){s.page--;return {screen:'HORA',data:{horarios:timeChoices(s)}};}
      if(!s.slots.slice(s.page*18,s.page*18+18).includes(data.hora)){s.step='HORA';return {screen:'HORA',data:{horarios:timeChoices(s),error_message:'Elige uno de los horarios mostrados.'}};}
      s.slot=data.hora;s.step='DATOS';return {screen:'DATOS',data:{}};
    }
    if(req.screen==='DATOS' && ['DATOS','RESUMEN'].includes(s.step)) {
      if(data.profesional!==s.professional||data.fecha!==s.date||data.hora!==s.slot)throw Error('invalid selection');
      if(!safeName(data.nombre)||!validDOB(data.nacimiento)){s.step='DATOS';return {screen:'DATOS',data:{error_message:'Escribe nombre y apellidos y selecciona una fecha válida.'}};}
      s.fullName=data.nombre.trim().replace(/\s+/gu,' ');s.dob=data.nacimiento;s.step='RESUMEN';
      return {screen:'RESUMEN',data:{resumen:summary(s)}};
    }
    if(req.screen==='RESUMEN' && (s.step==='RESUMEN'||s.step==='BOOKED')) {
      if(data.profesional!==s.professional||data.fecha!==s.date||data.hora!==s.slot||data.nombre?.trim().replace(/\s+/gu,' ')!==s.fullName||data.nacimiento!==s.dob)throw Error('invalid confirmation');
      if(!s.booked){
        // Demo-only split: a real deployment needs explicit review of compound names.
        const parts=s.fullName.split(' '),lastName=parts.pop();
        const body={practitionerId:s.professional,scheduledAt:s.slot,firstName:parts.join(' '),lastName,dateOfBirth:s.dob,phone:demoPhone};
        const key='flow:'+crypto.createHash('sha256').update(req.flow_token).digest('hex');
        let booked;
        try { booked=await backend('/appointments',body,key); }
        catch(err) {
          if(err.status>=400 && err.status<500)return {screen:'RESUMEN',data:{resumen:summary(s),error_message:'No se ha podido reservar. El horario puede estar ocupado o los datos requerir revisión.'}};
          throw err;
        }
        if(booked.status!=='scheduled'||typeof booked.id!=='string')throw Error('not scheduled');
        s.booked={id:booked.id,scheduledAt:booked.scheduledAt};s.step='BOOKED';
      }
      return {screen:'SUCCESS',data:{extension_message_response:{params:{flow_token:req.flow_token,referencia:s.booked.id}}}};
    }
    throw Error('invalid transition');
  }
  return {start,handle,lookup(token,phone){clean();const s=sessions.get(token);if(!s||!same(phone,s.phone)||!s.booked)return null;return s.booked;}};
}
function backendClient(base,bearer) {
  if(base!=='http://127.0.0.1:31091')throw Error('invalid backend');
  return async(path,body,key)=>{
    const res=await fetch(base+'/integrations/whatsapp-booking'+path,{method:body?'POST':'GET',headers:{authorization:'Bearer '+bearer,'content-type':'application/json',...(key?{'idempotency-key':key}:{})},...(body?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(8000)});
    if(!res.ok){const err=Error('backend rejected');err.status=res.status;throw err;}return res.json();
  };
}
function read(req,limit=65536){return new Promise((resolve,reject)=>{let size=0,chunks=[];req.on('data',part=>{size+=part.length;if(size>limit){reject(Error('too large'));req.destroy();}else chunks.push(part);});req.on('end',()=>resolve(Buffer.concat(chunks)));req.on('error',reject);});}
function servers({engine,appSecret,privateKey,gatewayDigest,allowedClient}) {
  if(!/^[a-f0-9]{64}$/.test(gatewayDigest)||!appSecret||!privateKey||!allowedClient)throw Error('missing security configuration');
  const external=http.createServer(async(req,res)=>{
    if(req.method!=='POST'||req.url!=='/flows'){res.writeHead(404).end();return;}
    try {
      const raw=await read(req);const sig=req.headers['x-hub-signature-256'];
      const expected='sha256='+crypto.createHmac('sha256',appSecret).update(raw).digest('hex');
      if(typeof sig!=='string'||!same(sig,expected)){res.writeHead(401).end();return;}
      let payload;try{payload=decrypt(JSON.parse(raw),privateKey);}catch{res.writeHead(421).end();return;}
      let response;try{response=await engine.handle(payload.data);}catch{res.writeHead(400).end();return;}
      res.writeHead(200,{'content-type':'text/plain','cache-control':'no-store'}).end(encrypt(response,payload.key,payload.iv));
    }catch{if(!res.headersSent)res.writeHead(400).end();}
  });
  const internal=http.createServer(async(req,res)=>{
    const remote=(req.socket.remoteAddress||'').replace(/^::ffff:/,'');
    const auth=req.headers.authorization||'';const match=/^Bearer ([A-Za-z0-9_-]{43,128})$/.exec(auth);
    const digest=match?crypto.createHash('sha256').update(match[1]).digest('hex'):'';
    if(remote!==allowedClient||!match||!same(digest,gatewayDigest)){res.writeHead(401).end();return;}
    if(req.method!=='POST'||!['/start','/result'].includes(req.url)){res.writeHead(404).end();return;}
    try{
      const body=JSON.parse(await read(req,4096));let result;
      if(req.url==='/start'){const token=engine.start(body.phone);if(!token){res.writeHead(403).end();return;}result={flow_token:token};}
      else{result=engine.lookup(body.flow_token,body.phone);if(!result){res.writeHead(404).end();return;}}
      res.writeHead(200,{'content-type':'application/json','cache-control':'no-store'}).end(JSON.stringify(result));
    }catch{res.writeHead(400).end();}
  });
  return {external,internal};
}
if(require.main===module){
  const readFile=(key)=>fs.readFileSync(process.env[key],'utf8').trim();
  const engine=createEngine({backend:backendClient('http://127.0.0.1:31091',readFile('FLOW_BACKEND_BEARER_FILE')),allowedPhone:process.env.FLOW_ALLOWED_REAL_PHONE,demoPhone:process.env.FLOW_DEMO_PATIENT_PHONE});
  const app=servers({engine,appSecret:readFile('FLOW_APP_SECRET_FILE'),privateKey:readFile('FLOW_PRIVATE_KEY_FILE'),gatewayDigest:readFile('FLOW_GATEWAY_DIGEST_FILE'),allowedClient:process.env.FLOW_ALLOWED_CLIENT});
  app.external.listen(31094,'127.0.0.1');app.internal.listen(31093,'172.18.0.1');
}
module.exports={createEngine,servers,decrypt,encrypt,backendClient};
