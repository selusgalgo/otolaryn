import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { isUUID } from 'class-validator';
import { createHash, randomBytes } from 'node:crypto';
import { TenancyContext } from '../tenancy/tenancy-context';
import { MetaEmbeddedSignup } from './meta-embedded-signup';
import { WhatsappCredentialCrypto } from './whatsapp-credential-crypto';

/** Internal operation: callers must authenticate an admin and validate the signup session first. */
@Injectable()
export class WhatsappTenantOnboardingService {
  constructor(
    private readonly config: ConfigService,
    private readonly tenancy: TenancyContext,
  ) {}

  /** Optional single-clinic lock for isolated demo environments; omit in multi-tenant production. */
  private enforceOptionalDemoTenant(): void {
    const permitted =
      this.config.get<string>('WHATSAPP_ONBOARDING_DEMO_TENANT_ID')?.trim() ??
      '';
    if (!permitted) return;
    if (!isUUID(permitted))
      throw new ServiceUnavailableException(
        'La restricción DEMO de WhatsApp no está configurada correctamente',
      );
    if (permitted.toLowerCase() !== this.tenancy.tenantId.toLowerCase())
      throw new ForbiddenException();
  }

  private connectionConfig() {
    const appId = this.config.get<string>('WHATSAPP_META_APP_ID') ?? '';
    const appSecret = this.config.get<string>('WHATSAPP_META_APP_SECRET') ?? '';
    const encryptionKey =
      this.config.get<string>('WHATSAPP_CREDENTIAL_KEY') ?? '';
    const demoWaba =
      this.config.get<string>('WHATSAPP_ONBOARDING_DEMO_WABA_ID')?.trim() ?? '';
    const demoPhone =
      this.config.get<string>('WHATSAPP_ONBOARDING_DEMO_PHONE_ID')?.trim() ??
      '';
    if (
      !/^\d{1,30}$/.test(appId) ||
      !appSecret ||
      !/^[0-9a-f]{64}$/i.test(encryptionKey)
    ) {
      throw new ServiceUnavailableException(
        'La conexión de WhatsApp aún no está configurada correctamente en el servidor',
      );
    }
    // These two values are an optional restriction for a disposable DEMO only.
    if (
      (demoWaba || demoPhone) &&
      (!/^\d{1,30}$/.test(demoWaba) || !/^\d{1,30}$/.test(demoPhone))
    ) {
      throw new ServiceUnavailableException(
        'La restricción de cuenta DEMO de WhatsApp no está configurada correctamente',
      );
    }
    return { appId, appSecret, encryptionKey, demoWaba, demoPhone };
  }

  private signupConfig() {
    const connection = this.connectionConfig();
    const configId = this.config.get<string>('WHATSAPP_META_CONFIG_ID') ?? '';
    if (!/^\d{1,30}$/.test(configId))
      throw new ServiceUnavailableException(
        'La configuración de Meta Embedded Signup no está completa',
      );
    return { ...connection, configId };
  }

  private enforceOptionalDemoAccount(
    config: { demoWaba: string; demoPhone: string },
    input: { wabaId: string; phoneNumberId: string },
  ): void {
    if (
      config.demoWaba &&
      (input.wabaId !== config.demoWaba ||
        input.phoneNumberId !== config.demoPhone)
    ) {
      throw new ForbiddenException(
        'Esta prueba solo admite la cuenta configurada para DEMO',
      );
    }
  }

  async begin(userId: string) {
    this.enforceOptionalDemoTenant();
    const { appId, configId } = this.signupConfig();
    const state = randomBytes(32).toString('base64url');
    await this.tenancy.manager.query(
      `INSERT INTO public.whatsapp_onboarding_attempts (tenant_id,user_id,state_hash,expires_at)
       VALUES ($1,$2,$3,now() + interval '15 minutes')`,
      [
        this.tenancy.tenantId,
        userId,
        createHash('sha256').update(state).digest('hex'),
      ],
    );
    return { appId, configId, state };
  }

  async finish(
    userId: string,
    state: string,
    input: { code: string; wabaId: string; phoneNumberId: string },
  ) {
    this.enforceOptionalDemoTenant();
    this.enforceOptionalDemoAccount(this.signupConfig(), input);
    if (!/^[A-Za-z0-9_-]{43}$/.test(state))
      throw new BadRequestException('La sesión de conexión no es válida');
    const [attempt] = await this.tenancy.manager.query<{ valid: boolean }[]>(
      `SELECT true AS valid FROM public.whatsapp_onboarding_attempts
       WHERE tenant_id=$1 AND user_id=$2 AND state_hash=$3 AND consumed_at IS NULL AND expires_at > now() FOR UPDATE`,
      [
        this.tenancy.tenantId,
        userId,
        createHash('sha256').update(state).digest('hex'),
      ],
    );
    if (!attempt)
      throw new BadRequestException(
        'La sesión de conexión ha caducado o ya se ha utilizado',
      );
    const result = await this.completeVerifiedSignup(input);
    await this.tenancy.manager.query(
      `UPDATE public.whatsapp_onboarding_attempts SET consumed_at=now()
      WHERE tenant_id=$1 AND user_id=$2 AND state_hash=$3`,
      [
        this.tenancy.tenantId,
        userId,
        createHash('sha256').update(state).digest('hex'),
      ],
    );
    return result;
  }

  async status() {
    this.enforceOptionalDemoTenant();
    const [connection] = await this.tenancy.manager.query<{ status: string }[]>(
      'SELECT status FROM public.whatsapp_tenant_connections WHERE tenant_id=$1',
      [this.tenancy.tenantId],
    );
    return { status: connection?.status ?? 'not_connected' };
  }

  async activate() {
    this.enforceOptionalDemoTenant();
    const config = this.connectionConfig();
    if (
      this.config.get<string>('WHATSAPP_ROUTER_ACTIVATION_ENABLED') !==
        'true' ||
      !this.config.get<string>('WHATSAPP_ROUTER_TOKEN_SHA256')
    ) {
      throw new ServiceUnavailableException(
        'El canal de WhatsApp aún no está habilitado en el servidor',
      );
    }
    const [connection] = await this.tenancy.manager.query<
      {
        waba_id: string;
        phone_number_id: string;
        encrypted_access_token: string;
        status: string;
      }[]
    >(
      'SELECT waba_id, phone_number_id, encrypted_access_token, status FROM public.whatsapp_tenant_connections WHERE tenant_id=$1 FOR UPDATE',
      [this.tenancy.tenantId],
    );
    if (!connection)
      throw new BadRequestException('No hay una cuenta de WhatsApp conectada');
    this.enforceOptionalDemoAccount(config, {
      wabaId: connection.waba_id,
      phoneNumberId: connection.phone_number_id,
    });
    const cipher = new WhatsappCredentialCrypto(config.encryptionKey);
    const token = cipher.decrypt(
      this.tenancy.tenantId,
      connection.encrypted_access_token,
    );
    const meta = new MetaEmbeddedSignup(config.appId, config.appSecret);
    if (!(await meta.isSubscribed(connection.waba_id, token))) {
      await meta.subscribe(connection.waba_id, token);
      if (!(await meta.isSubscribed(connection.waba_id, token)))
        throw new BadRequestException(
          'Meta todavía no confirma la suscripción de esta cuenta',
        );
    }
    await this.tenancy.manager.query(
      "UPDATE public.whatsapp_tenant_connections SET status='ready', updated_at=now() WHERE tenant_id=$1",
      [this.tenancy.tenantId],
    );
    return { status: 'ready' as const };
  }

  async completeVerifiedSignup(input: {
    code: string;
    wabaId: string;
    phoneNumberId: string;
  }) {
    const config = this.connectionConfig();
    this.enforceOptionalDemoAccount(config, input);
    const cipher = new WhatsappCredentialCrypto(config.encryptionKey);
    const meta = new MetaEmbeddedSignup(config.appId, config.appSecret);
    const token = await meta.exchangeAndVerify(
      input.code,
      input.wabaId,
      input.phoneNumberId,
    );
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
