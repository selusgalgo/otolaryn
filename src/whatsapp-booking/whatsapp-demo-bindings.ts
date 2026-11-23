import { ForbiddenException, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { isUUID } from 'class-validator';

/**
 * Optional single-tenant routing kept for isolated DEMO environments: each
 * allowed sender maps to a synthetic patient phone. Multi-tenant production
 * leaves both variables empty and uses the sender's own number.
 */
export function resolvePatientPhone(config: ConfigService, phone: string): { patientPhone: string; demoTenant: string } {
  const demoTenant = config.get<string>('WHATSAPP_ROUTER_DEMO_TENANT_ID')?.trim() ?? '';
  const bindingsText = config.get<string>('WHATSAPP_ROUTER_DEMO_BINDINGS') ?? '';
  if (!demoTenant && !bindingsText) return { patientPhone: phone, demoTenant };
  if (!isUUID(demoTenant) || !bindingsText) throw new ServiceUnavailableException();
  let bindings: Record<string, string>;
  try { bindings = JSON.parse(bindingsText) as Record<string, string>; } catch { throw new ServiceUnavailableException(); }
  if (!bindings || typeof bindings !== 'object' || Array.isArray(bindings)) throw new ServiceUnavailableException();
  const pairs = Object.entries(bindings);
  if (!pairs.length || pairs.length > 20 || pairs.some(([from, alias]) => !/^\+[1-9]\d{7,14}$/.test(from) || typeof alias !== 'string' || !/^\+[1-9]\d{7,14}$/.test(alias)) || new Set(pairs.map(([, alias]) => alias)).size !== pairs.length) throw new ServiceUnavailableException();
  const alias = Object.hasOwn(bindings, phone) ? bindings[phone] : undefined;
  if (typeof alias !== 'string' || !/^\+[1-9]\d{7,14}$/.test(alias)) throw new ForbiddenException();
  return { patientPhone: alias, demoTenant };
}
