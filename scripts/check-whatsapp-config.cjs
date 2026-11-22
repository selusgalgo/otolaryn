#!/usr/bin/env node
'use strict';

require('dotenv').config({ quiet: true });

const errors = [];
const get = (name) => (process.env[name] ?? '').trim();
const report = (name, detail = 'falta') => errors.push(`${name}: ${detail}`);
const idPattern = /^\d{1,30}$/;

const appSecret = get('WHATSAPP_META_APP_SECRET');
const encryptionKey = get('WHATSAPP_CREDENTIAL_KEY');
const routerTokenHash = get('WHATSAPP_ROUTER_TOKEN_SHA256');

for (const name of ['WHATSAPP_META_APP_ID', 'WHATSAPP_META_CONFIG_ID']) {
  if (!idPattern.test(get(name))) report(name, 'ID numérico ausente o no válido');
}
if (!appSecret) report('WHATSAPP_META_APP_SECRET');
if (!/^[0-9a-f]{64}$/i.test(encryptionKey)) report('WHATSAPP_CREDENTIAL_KEY', 'debe tener 64 caracteres hexadecimales');

if (get('WHATSAPP_ROUTER_ACTIVATION_ENABLED') !== 'true') {
  report('WHATSAPP_ROUTER_ACTIVATION_ENABLED', 'debe ser true para activar las conexiones');
}
if (!/^[a-f0-9]{64}$/.test(routerTokenHash)) report('WHATSAPP_ROUTER_TOKEN_SHA256', 'debe tener 64 caracteres hexadecimales en minúscula');
for (const name of [
  'WHATSAPP_ONBOARDING_DEMO_TENANT_ID',
  'WHATSAPP_ONBOARDING_DEMO_WABA_ID',
  'WHATSAPP_ONBOARDING_DEMO_PHONE_ID',
  'WHATSAPP_ROUTER_DEMO_TENANT_ID',
  'WHATSAPP_ROUTER_DEMO_BINDINGS',
]) {
  if (get(name)) report(name, 'quitar en el backend multiempresa');
}

if (errors.length) {
  process.stderr.write('Configuración compartida de WhatsApp incompleta:\n');
  for (const error of errors) process.stderr.write(`- ${error}\n`);
  process.stderr.write('No se han mostrado valores, secretos ni números de teléfono.\n');
  process.exitCode = 1;
} else {
  process.stdout.write('Configuración compartida de WhatsApp completa y con formatos válidos.\n');
}
