'use strict';
// Creates (or updates) the Mederi booking Flow in Meta and registers the RSA
// public key used to encrypt Flow requests. Run on the VPS with Plesk node:
//   node setup-whatsapp-flow.cjs <n8n credential id> <flow json> [flow id]
// The access token is read from an n8n whatsAppApi credential and never printed.
const { execFileSync } = require('node:child_process');
const crypto = require('node:crypto');
const fs = require('node:fs');

const APP = process.env.MEDERI_APP_DIR || '/var/www/vhosts/medericloud.com/app.medericloud.com';
const KEY_FILE = process.env.WHATSAPP_FLOW_PRIVATE_KEY_FILE || '/etc/mederi/whatsapp-flow-private.pem';
const ENDPOINT = process.env.WHATSAPP_FLOW_ENDPOINT || 'https://api.medericloud.com/integrations/whatsapp-flows/endpoint';
const [credentialId, flowJsonPath, existingFlowId] = process.argv.slice(2);
if (!/^[A-Za-z0-9]{16}$/.test(credentialId || '') || !flowJsonPath) throw new Error('Uso: <id credencial n8n> <flow json> [flow id]');

const env = {};
for (const file of [`${APP}/.env`, '/etc/mederi/whatsapp-demo-signup.env']) {
  for (const line of fs.readFileSync(file, 'utf8').split('\n')) {
    const match = /^([A-Z0-9_]+)=(.*)$/.exec(line);
    if (match) env[match[1]] = match[2].replace(/^"|"$/g, '');
  }
}
const waba = env.WHATSAPP_ONBOARDING_DEMO_WABA_ID;
const phone = env.WHATSAPP_ONBOARDING_DEMO_PHONE_ID;

function n8nToken() {
  const key = execFileSync('docker', ['exec', 'n8n', 'sh', '-c', 'printf %s "$N8N_ENCRYPTION_KEY"']).toString();
  const blob = execFileSync('sqlite3', ['/opt/n8n/data/database.sqlite', `select data from credentials_entity where id='${credentialId}'`]).toString().trim();
  const raw = Buffer.from(blob, 'base64');
  const salt = raw.subarray(8, 16);
  let derived = Buffer.alloc(0);
  let block = Buffer.alloc(0);
  while (derived.length < 48) {
    block = crypto.createHash('md5').update(Buffer.concat([block, Buffer.from(key), salt])).digest();
    derived = Buffer.concat([derived, block]);
  }
  const decipher = crypto.createDecipheriv('aes-256-cbc', derived.subarray(0, 32), derived.subarray(32, 48));
  return JSON.parse(Buffer.concat([decipher.update(raw.subarray(16)), decipher.final()]).toString()).accessToken;
}

async function graph(path, token, form) {
  const response = await fetch(`https://graph.facebook.com/v25.0/${path}`, { method: form ? 'POST' : 'GET', headers: { Authorization: `Bearer ${token}` }, body: form });
  const body = await response.json();
  if (!response.ok) throw new Error(`${path} -> ${response.status} ${JSON.stringify(body.error ? { code: body.error.code, msg: body.error.message, detail: body.error.error_user_msg } : body)}`);
  return body;
}

(async () => {
  const token = n8nToken();
  if (!fs.existsSync(KEY_FILE)) {
    const { privateKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048, privateKeyEncoding: { type: 'pkcs8', format: 'pem' }, publicKeyEncoding: { type: 'spki', format: 'pem' } });
    fs.writeFileSync(KEY_FILE, privateKey, { mode: 0o640 });
    console.log('Clave RSA creada en', KEY_FILE, '(ajusta propietario/grupo para el backend)');
  }
  const publicPem = crypto.createPublicKey(fs.readFileSync(KEY_FILE, 'utf8')).export({ type: 'spki', format: 'pem' });
  const keyForm = new FormData();
  keyForm.append('business_public_key', publicPem);
  console.log('Clave pública:', JSON.stringify(await graph(`${phone}/whatsapp_business_encryption`, token, keyForm)));

  const json = JSON.parse(fs.readFileSync(flowJsonPath, 'utf8'));
  const file = new Blob([JSON.stringify(json)], { type: 'application/json' });
  let flowId = existingFlowId;
  if (!flowId) {
    const form = new FormData();
    form.append('name', 'Mederi · Reserva de citas');
    form.append('categories', JSON.stringify(['APPOINTMENT_BOOKING']));
    form.append('endpoint_uri', ENDPOINT);
    form.append('flow_json', JSON.stringify(json));
    const created = await graph(`${waba}/flows`, token, form);
    flowId = created.id;
    console.log('Flow creado:', flowId, 'validación:', JSON.stringify(created.validation_errors || []));
  } else {
    const form = new FormData();
    form.append('file', file, 'flow.json');
    form.append('name', 'flow.json');
    form.append('asset_type', 'FLOW_JSON');
    const updated = await graph(`${flowId}/assets`, token, form);
    console.log('Flow actualizado:', flowId, 'validación:', JSON.stringify(updated.validation_errors || []));
  }
})().catch((error) => { console.error('ERROR:', error.message); process.exit(1); });
