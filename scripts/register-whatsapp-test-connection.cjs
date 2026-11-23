'use strict';
// Registers the WhatsApp test number as the "ready" connection of the demo
// clinic, reusing the access token stored in an n8n whatsAppApi credential.
// Run on the VPS with Plesk node: /opt/plesk/node/24/bin/node <this file> <n8n credential id>
// The token is never printed. It is validated against Graph, re-encrypted with
// WHATSAPP_CREDENTIAL_KEY (bound to the tenant) and stored via the tenant RLS.
const { execFileSync } = require('node:child_process');
const crypto = require('node:crypto');
const fs = require('node:fs');

const APP = process.env.MEDERI_APP_DIR || '/var/www/vhosts/medericloud.com/app.medericloud.com';
const credentialId = process.argv[2];
if (!/^[A-Za-z0-9]{16}$/.test(credentialId || '')) throw new Error('Uso: register-whatsapp-test-connection.cjs <id credencial n8n>');

const env = {};
for (const file of [`${APP}/.env`, '/etc/mederi/whatsapp-demo-signup.env']) {
  for (const line of fs.readFileSync(file, 'utf8').split('\n')) {
    const match = /^([A-Z0-9_]+)=(.*)$/.exec(line);
    if (match) env[match[1]] = match[2].replace(/^"|"$/g, '');
  }
}
const tenant = env.WHATSAPP_ROUTER_DEMO_TENANT_ID;
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
  const data = JSON.parse(Buffer.concat([decipher.update(raw.subarray(16)), decipher.final()]).toString());
  if (typeof data.accessToken !== 'string' || !data.accessToken) throw new Error('La credencial no contiene accessToken');
  return data.accessToken;
}

(async () => {
  const token = n8nToken();
  const check = await fetch(`https://graph.facebook.com/v25.0/${phone}?fields=display_phone_number`, { headers: { Authorization: `Bearer ${token}` } });
  if (!check.ok) throw new Error(`Meta rechaza el token (${check.status})`);
  const { WhatsappCredentialCrypto } = require(`${APP}/dist/whatsapp-booking/whatsapp-credential-crypto.js`);
  const encrypted = new WhatsappCredentialCrypto(env.WHATSAPP_CREDENTIAL_KEY).encrypt(tenant, token);
  const { Client } = require(`${APP}/node_modules/pg`);
  const db = new Client({ host: env.DB_HOST, port: env.DB_PORT, user: env.DB_OWNER_USER, password: env.DB_OWNER_PASSWORD, database: env.DB_NAME });
  await db.connect();
  try {
    await db.query('BEGIN');
    await db.query("select set_config('app.tenant_id',$1,true)", [tenant]);
    await db.query(
      `INSERT INTO public.whatsapp_tenant_connections(tenant_id,waba_id,phone_number_id,encrypted_access_token,status)
       VALUES($1,$2,$3,$4,'ready')
       ON CONFLICT (tenant_id) DO UPDATE SET waba_id=$2,phone_number_id=$3,encrypted_access_token=$4,status='ready',updated_at=now()`,
      [tenant, waba, phone, encrypted],
    );
    await db.query('COMMIT');
  } catch (error) { await db.query('ROLLBACK'); throw error; }
  const route = await db.query('select iam.whatsapp_connection_tenant($1) t', [phone]);
  console.log(route.rows[0].t === tenant ? 'Conexión lista y ruta resuelta' : 'La ruta no resuelve al tenant esperado');
  await db.end();
})().catch((error) => { console.error('ERROR:', error.message); process.exit(1); });
