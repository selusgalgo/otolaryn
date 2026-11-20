import { BadRequestException, ForbiddenException, Injectable, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash, randomBytes } from 'node:crypto';
import { TenancyContext } from '../tenancy/tenancy-context';
import { MetaEmbeddedSignup } from './meta-embedded-signup';
import { WhatsappCredentialCrypto } from './whatsapp-credential-crypto';

/** Internal operation: callers must authenticate an admin and validate the signup session first. */
@Injectable()
export class WhatsappTenantOnboardingService {
  constructor(private readonly config: ConfigService, private readonly tenancy: TenancyContext) {}

  private ensureDemo(): void {
    const permitted = this.config.get<string>('WHATSAPP_ONBOARDING_DEMO_TENANT_ID');
    if (!permitted || permitted !== this.tenancy.tenantId) throw new ForbiddenException();
  }

  async begin(userId: string) {
    this.ensureDemo();
    const appId = this.config.get<string>('WHATSAPP_META_APP_ID') ?? '';
    const configId = this.config.get<string>('WHATSAPP_META_CONFIG_ID') ?? '';
    const demoWaba = this.config.get<string>('WHATSAPP_ONBOARDING_DEMO_WABA_ID') ?? '';
    const demoPhone = this.config.get<string>('WHATSAPP_ONBOARDING_DEMO_PHONE_ID') ?? '';
    if (![appId, configId, demoWaba, demoPhone].every((value) => /^\d{1,30}$/.test(value)) || !this.config.get<string>('WHATSAPP_META_APP_SECRET') || !this.config.get<string>('WHATSAPP_CREDENTIAL_KEY')) {
      throw new ServiceUnavailableException('La conexión de prueba aún no está configurada');
    }
    const state = randomBytes(32).toString('base64url');
    await this.tenancy.manager.query(
      `INSERT INTO public.whatsapp_onboarding_attempts (tenant_id,user_id,state_hash,expires_at)
       VALUES ($1,$2,$3,now() + interval '15 minutes')`,
      [this.tenancy.tenantId, userId, createHash('sha256').update(state).digest('hex')],
    );
    return { appId, configId, state };
  }

  async finish(userId: string, state: string, input: { code: string; wabaId: string; phoneNumberId: string }) {
    this.ensureDemo();
    if (input.wabaId !== this.config.get<string>('WHATSAPP_ONBOARDING_DEMO_WABA_ID') || input.phoneNumberId !== this.config.get<string>('WHATSAPP_ONBOARDING_DEMO_PHONE_ID')) throw new ForbiddenException('Esta prueba solo admite la cuenta y el número de WhatsApp de DEMO');
    if (!/^[A-Za-z0-9_-]{43}$/.test(state)) throw new BadRequestException('La sesión de conexión no es válida');
    const [attempt] = await this.tenancy.manager.query<{ valid: boolean }[]>(
      `SELECT true AS valid FROM public.whatsapp_onboarding_attempts
       WHERE tenant_id=$1 AND user_id=$2 AND state_hash=$3 AND consumed_at IS NULL AND expires_at > now() FOR UPDATE`,
      [this.tenancy.tenantId, userId, createHash('sha256').update(state).digest('hex')],
    );
    if (!attempt) throw new BadRequestException('La sesión de conexión ha caducado o ya se ha utilizado');
    const result = await this.completeVerifiedSignup(input);
    await this.tenancy.manager.query(`UPDATE public.whatsapp_onboarding_attempts SET consumed_at=now()
      WHERE tenant_id=$1 AND user_id=$2 AND state_hash=$3`,
      [this.tenancy.tenantId, userId, createHash('sha256').update(state).digest('hex')]);
    return result;
  }

  async status() {
    this.ensureDemo();
    const [connection] = await this.tenancy.manager.query<{ status: string }[]>(
      'SELECT status FROM public.whatsapp_tenant_connections WHERE tenant_id=$1', [this.tenancy.tenantId],
    );
    return { status: connection?.status ?? 'not_connected' };
  }

  async activate() {
    this.ensureDemo();
    if (this.config.get<string>('WHATSAPP_ROUTER_ACTIVATION_ENABLED') !== 'true' || this.config.get<string>('WHATSAPP_ROUTER_DEMO_TENANT_ID') !== this.tenancy.tenantId || !this.config.get<string>('WHATSAPP_ROUTER_DEMO_BINDINGS') || !this.config.get<string>('WHATSAPP_ROUTER_TOKEN_SHA256')) {
      throw new ServiceUnavailableException('El canal de prueba aún no está preparado');
    }
    const [connection] = await this.tenancy.manager.query<{ waba_id: string; phone_number_id: string; encrypted_access_token: string; status: string }[]>(
      'SELECT waba_id, phone_number_id, encrypted_access_token, status FROM public.whatsapp_tenant_connections WHERE tenant_id=$1 FOR UPDATE', [this.tenancy.tenantId],
    );
    if (!connection || connection.waba_id !== this.config.get<string>('WHATSAPP_ONBOARDING_DEMO_WABA_ID') || connection.phone_number_id !== this.config.get<string>('WHATSAPP_ONBOARDING_DEMO_PHONE_ID')) throw new BadRequestException('No hay una cuenta de prueba conectada');
    const cipher = new WhatsappCredentialCrypto(this.config.get<string>('WHATSAPP_CREDENTIAL_KEY') ?? '');
    const token = cipher.decrypt(this.tenancy.tenantId, connection.encrypted_access_token);
    const meta = new MetaEmbeddedSignup(this.config.get<string>('WHATSAPP_META_APP_ID') ?? '', this.config.get<string>('WHATSAPP_META_APP_SECRET') ?? '');
    if (!await meta.isSubscribed(connection.waba_id, token)) {
      await meta.subscribe(connection.waba_id, token);
      if (!await meta.isSubscribed(connection.waba_id, token)) throw new BadRequestException('Meta todavía no confirma la suscripción de esta cuenta');
    }
    await this.tenancy.manager.query("UPDATE public.whatsapp_tenant_connections SET status='ready', updated_at=now() WHERE tenant_id=$1", [this.tenancy.tenantId]);
    return { status: 'ready' as const };
  }

  async completeVerifiedSignup(input: { code: string; wabaId: string; phoneNumberId: string }) {
    const appId = this.config.get<string>('WHATSAPP_META_APP_ID') ?? '';
    const appSecret = this.config.get<string>('WHATSAPP_META_APP_SECRET') ?? '';
    const encryptionKey = this.config.get<string>('WHATSAPP_CREDENTIAL_KEY') ?? '';
    if (!appId || !appSecret || !encryptionKey) throw new ServiceUnavailableException('Conexión de WhatsApp no configurada');
    const cipher = new WhatsappCredentialCrypto(encryptionKey);
    const meta = new MetaEmbeddedSignup(appId, appSecret);
    const token = await meta.exchangeAndVerify(input.code, input.wabaId, input.phoneNumberId);
    const encrypted = cipher.encrypt(this.tenancy.tenantId, token);
    // A linked account remains pending until webhook subscription and a real
    // delivery check succeed. A previously linked clinic is never replaced.
    await this.tenancy.manager.query(
      `INSERT INTO public.whatsapp_tenant_connections (tenant_id,waba_id,phone_number_id,encrypted_access_token,status)
       VALUES ($1,$2,$3,$4,'pending')`,
      [this.tenancy.tenantId, input.wabaId, input.phoneNumberId, encrypted],
    );
    return { status: 'pending' as const };
  }
}
